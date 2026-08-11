import { createHash } from 'node:crypto';
import { ConflictException, Inject, Injectable, InternalServerErrorException, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ContentAngleType, EditorialAssessment, EditorialAssessmentBand, EditorialAssessmentLongevity, EditorialAssessmentRecommendation, EditorialAssessmentStatus, OPPORTUNITY_METRICS_V2_VERSION } from '@content-os/contracts';
import { EditorialAssessmentRepository, OpportunityMetricRepository, OpportunityRepository, ProjectEditorialProfileRepository, ResearchPackageRepository } from '@content-os/storage';
import { EDITORIAL_ASSESSMENT_EVALUATOR, EDITORIAL_ASSESSMENT_PROMPT_VERSION, EditorialEvaluatorNotConfiguredError, EditorialEvaluatorProviderError } from './editorial-assessment.evaluator';
import type { EditorialAssessmentEvaluator } from './editorial-assessment.evaluator';

type Output = { relevance: EditorialAssessmentBand; newsworthiness: EditorialAssessmentBand; contentPotential: EditorialAssessmentBand; longevity: EditorialAssessmentLongevity; duplicationRisk: EditorialAssessmentBand; recommendation: EditorialAssessmentRecommendation; rationale: string; citedFactIds: string[]; citedSignalIds: string[]; angleType: ContentAngleType; videoIdeaTitle: string; videoIdeaSummary: string; hook: string; whyNow: string };
type OutputValidationReason = 'invalid_json_shape' | 'missing_required_field' | 'invalid_relevance' | 'invalid_newsworthiness' | 'invalid_content_potential' | 'invalid_longevity' | 'invalid_duplication_risk' | 'invalid_recommendation' | 'invalid_angle_type' | 'rationale_too_long' | 'unknown_fact_citation' | 'unknown_signal_citation' | 'missing_video_idea_title' | 'video_idea_title_too_long' | 'missing_video_idea_summary' | 'video_idea_summary_too_long' | 'hook_too_long' | 'why_now_too_long';
class EditorialAssessmentOutputValidationError extends Error {}

@Injectable()
export class EditorialAssessmentService {
  private readonly logger = new Logger(EditorialAssessmentService.name);

  constructor(
    private readonly opportunities: OpportunityRepository,
    private readonly metrics: OpportunityMetricRepository,
    private readonly profiles: ProjectEditorialProfileRepository,
    private readonly packages: ResearchPackageRepository,
    private readonly assessments: EditorialAssessmentRepository,
    @Inject(EDITORIAL_ASSESSMENT_EVALUATOR) private readonly evaluator: EditorialAssessmentEvaluator,
  ) {}

  async findOne(opportunityId: string): Promise<EditorialAssessment> {
    const opportunity = await this.opportunities.findById(opportunityId);
    if (!opportunity) throw new NotFoundException('Opportunity not found');
    const assessment = await this.assessments.find(opportunity.projectId, opportunityId);
    if (!assessment) throw new NotFoundException('Editorial assessment not found');
    const [profile, metric, researchPackage] = await Promise.all([
      this.profiles.getOrCreateDefault(opportunity.projectId),
      this.metrics.findByOpportunityId(opportunityId, OPPORTUNITY_METRICS_V2_VERSION),
      this.packages.findByOpportunityId(opportunityId),
    ]);
    if (!metric || !researchPackage || researchPackage.status !== 'ready' || !assessment.angleType || !assessment.videoIdeaTitle || !assessment.videoIdeaSummary || !assessment.hook || !assessment.whyNow) return this.toContract({ ...assessment, status: EditorialAssessmentStatus.STALE });
    const input = await this.inputFor(opportunity, profile, metric, researchPackage);
    const hash = this.hash(input);
    return this.toContract(hash === assessment.inputHash ? assessment : { ...assessment, status: EditorialAssessmentStatus.STALE });
  }

  async assess(opportunityId: string): Promise<EditorialAssessment> {
    const opportunity = await this.opportunities.findById(opportunityId);
    if (!opportunity) throw new NotFoundException('Opportunity not found');
    const [profile, metric, researchPackage] = await Promise.all([
      this.profiles.getOrCreateDefault(opportunity.projectId),
      this.metrics.findByOpportunityId(opportunityId, OPPORTUNITY_METRICS_V2_VERSION),
      this.packages.findByOpportunityId(opportunityId),
    ]);
    if (!metric) throw new ConflictException('Opportunity Metrics V2 are required before editorial assessment');
    if (!researchPackage || researchPackage.status !== 'ready') throw new ConflictException('A ready Research Package is required before editorial assessment');
    const input = await this.inputFor(opportunity, profile, metric, researchPackage);
    const inputHash = this.hash(input);
    const cached = await this.assessments.find(opportunity.projectId, opportunityId);
    if (cached?.status === EditorialAssessmentStatus.READY && cached.inputHash === inputHash && cached.angleType && cached.videoIdeaTitle && cached.videoIdeaSummary && cached.hook && cached.whyNow) return this.toContract(cached);
    const base = { projectId: opportunity.projectId, opportunityId, projectEditorialProfileRevision: profile.revision, opportunityMetricsVersion: metric.scoreVersion, researchPackageId: researchPackage.id, researchPackageUpdatedAt: researchPackage.updatedAt, promptVersion: EDITORIAL_ASSESSMENT_PROMPT_VERSION, inputHash };
    try {
      const facts = input.researchPackage.facts;
      const signals = input.researchPackage.signals;
      const output = this.validate(await this.evaluator.assess(input, opportunity.projectId), new Set(facts.map((fact) => fact.id)), new Set(signals.map((signal) => signal.id)), opportunityId);
      return this.toContract(await this.assessments.upsert({ ...base, status: EditorialAssessmentStatus.READY, ...output, editorialScore: score(output), evaluatorProvider: this.evaluator.provider, evaluatorModel: this.evaluator.model, errorCode: null, failureReason: null, assessedAt: new Date().toISOString() }));
    } catch (error) {
      this.logger.warn(JSON.stringify({ stage: 'editorial_assessment.service_catch', opportunityId, category: this.errorCategory(error) }));
      const configured = !(error instanceof EditorialEvaluatorNotConfiguredError);
      try {
        await this.assessments.upsert({ ...base, status: EditorialAssessmentStatus.FAILED, relevance: null, newsworthiness: null, contentPotential: null, longevity: null, duplicationRisk: null, recommendation: null, editorialScore: null, rationale: null, citedFactIds: [], citedSignalIds: [], angleType: null, videoIdeaTitle: null, videoIdeaSummary: null, hook: null, whyNow: null, evaluatorProvider: this.evaluator.provider, evaluatorModel: this.evaluator.model, errorCode: configured ? 'provider_failure' : 'not_configured', failureReason: configured ? 'Editorial evaluator request failed' : 'Editorial evaluator is not configured', assessedAt: null });
      } catch {
        throw new InternalServerErrorException('Unable to persist editorial assessment');
      }
      if (error instanceof EditorialEvaluatorNotConfiguredError) throw new ServiceUnavailableException('Editorial evaluator is not configured');
      if (error instanceof EditorialEvaluatorProviderError || error instanceof EditorialAssessmentOutputValidationError) throw new ServiceUnavailableException('Editorial evaluator request failed');
      throw new InternalServerErrorException('Unable to persist editorial assessment');
    }
  }

  private async inputFor(opportunity: Awaited<ReturnType<OpportunityRepository['findById']>>, profile: Awaited<ReturnType<ProjectEditorialProfileRepository['getOrCreateDefault']>>, metric: NonNullable<Awaited<ReturnType<OpportunityMetricRepository['findByOpportunityId']>>>, researchPackage: NonNullable<Awaited<ReturnType<ResearchPackageRepository['findByOpportunityId']>>>) {
    if (!opportunity) throw new InternalServerErrorException('Opportunity is unavailable');
    const rows = (await this.packages.findFactsWithEvidenceByPackageIds([researchPackage.id])).get(researchPackage.id) ?? [];
    const facts = [...new Map(rows.map((row) => [row.id, { id: row.id, claim: row.claim, status: row.status, evidenceIds: rows.filter((candidate) => candidate.id === row.id && candidate.signalId).map((candidate) => candidate.signalId!) }])).values()];
    const signals = [...new Map(rows.filter((row) => row.signalId).map((row) => [row.signalId!, { id: row.signalId!, sourceName: row.sourceName, title: row.signalTitle }])).values()];
    return { profile: { ...profile }, opportunity: { id: opportunity.id, title: opportunity.title, summary: opportunity.summary, url: opportunity.representativeUrl, status: opportunity.status }, metrics: { ...metric }, researchPackage: { id: researchPackage.id, updatedAt: researchPackage.updatedAt, summary: researchPackage.summary, confidenceScore: researchPackage.confidenceScore, sourceCount: researchPackage.sourceCount, signalCount: researchPackage.signalCount, facts, signals }, promptVersion: EDITORIAL_ASSESSMENT_PROMPT_VERSION };
  }

  private hash(input: object) { return editorialAssessmentInputHash(input); }

  private errorCategory(error: unknown) {
    if (error instanceof EditorialEvaluatorNotConfiguredError) return 'not_configured';
    if (error instanceof EditorialAssessmentOutputValidationError) return 'output_validation';
    if (error instanceof EditorialEvaluatorProviderError) return 'provider';
    return 'internal_or_persistence';
  }

  private validate(value: unknown, facts: Set<string>, signals: Set<string>, opportunityId: string): Output {
    if (!value || typeof value !== 'object') this.outputValidationFailure(opportunityId, 'invalid_json_shape');
    const get = (key: string) => Reflect.get(value, key);
    const band = (value: unknown) => Object.values(EditorialAssessmentBand).includes(value as EditorialAssessmentBand) ? value as EditorialAssessmentBand : undefined;
    const relevance = band(get('relevance'));
    if (!relevance) this.outputValidationFailure(opportunityId, get('relevance') === undefined ? 'missing_required_field' : 'invalid_relevance', 'relevance', get('relevance'));
    const newsworthiness = band(get('newsworthiness'));
    if (!newsworthiness) this.outputValidationFailure(opportunityId, get('newsworthiness') === undefined ? 'missing_required_field' : 'invalid_newsworthiness', 'newsworthiness', get('newsworthiness'));
    const contentPotential = band(get('contentPotential'));
    if (!contentPotential) this.outputValidationFailure(opportunityId, get('contentPotential') === undefined ? 'missing_required_field' : 'invalid_content_potential', 'contentPotential', get('contentPotential'));
    const longevity = Object.values(EditorialAssessmentLongevity).includes(get('longevity') as EditorialAssessmentLongevity) ? get('longevity') as EditorialAssessmentLongevity : undefined;
    if (!longevity) this.outputValidationFailure(opportunityId, get('longevity') === undefined ? 'missing_required_field' : 'invalid_longevity', 'longevity', get('longevity'));
    const duplicationRisk = band(get('duplicationRisk'));
    if (!duplicationRisk) this.outputValidationFailure(opportunityId, get('duplicationRisk') === undefined ? 'missing_required_field' : 'invalid_duplication_risk', 'duplicationRisk', get('duplicationRisk'));
    const recommendation = Object.values(EditorialAssessmentRecommendation).includes(get('recommendation') as EditorialAssessmentRecommendation) ? get('recommendation') as EditorialAssessmentRecommendation : undefined;
    if (!recommendation) this.outputValidationFailure(opportunityId, get('recommendation') === undefined ? 'missing_required_field' : 'invalid_recommendation', 'recommendation', get('recommendation'));
    const angleType = Object.values(ContentAngleType).includes(get('angleType') as ContentAngleType) ? get('angleType') as ContentAngleType : undefined;
    if (!angleType) this.outputValidationFailure(opportunityId, get('angleType') === undefined ? 'missing_required_field' : 'invalid_angle_type', 'angleType', get('angleType'));
    const videoIdeaTitle = this.requiredText(get('videoIdeaTitle'), opportunityId, 'videoIdeaTitle', 'missing_video_idea_title', 'video_idea_title_too_long', 140);
    const videoIdeaSummary = this.requiredText(get('videoIdeaSummary'), opportunityId, 'videoIdeaSummary', 'missing_video_idea_summary', 'video_idea_summary_too_long', 600);
    const hook = this.requiredText(get('hook'), opportunityId, 'hook', 'missing_required_field', 'hook_too_long', 240);
    const whyNow = this.requiredText(get('whyNow'), opportunityId, 'whyNow', 'missing_required_field', 'why_now_too_long', 360);
    const rawRationale = get('rationale');
    if (typeof rawRationale !== 'string' || !rawRationale.trim()) this.outputValidationFailure(opportunityId, 'missing_required_field', 'rationale');
    const rationale = rawRationale.trim();
    if (rationale.length > 500) this.outputValidationFailure(opportunityId, 'rationale_too_long', 'rationale', String(rationale.length));
    const citedFactIds = this.citations(get('citedFactIds'), facts, opportunityId, 'citedFactIds', 'unknown_fact_citation');
    const citedSignalIds = this.citations(get('citedSignalIds'), signals, opportunityId, 'citedSignalIds', 'unknown_signal_citation');
    return { relevance, newsworthiness, contentPotential, longevity, duplicationRisk, recommendation, rationale, citedFactIds, citedSignalIds, angleType, videoIdeaTitle, videoIdeaSummary, hook, whyNow };
  }

  private requiredText(value: unknown, opportunityId: string, field: string, missingReason: OutputValidationReason, tooLongReason: OutputValidationReason, maxLength: number): string {
    if (typeof value !== 'string' || !value.trim()) this.outputValidationFailure(opportunityId, missingReason, field);
    const text = value.trim();
    if (text.length > maxLength) this.outputValidationFailure(opportunityId, tooLongReason, field, String(text.length));
    return text;
  }

  private citations(value: unknown, allowed: Set<string>, opportunityId: string, field: 'citedFactIds' | 'citedSignalIds', unknownReason: 'unknown_fact_citation' | 'unknown_signal_citation') {
    if (!Array.isArray(value)) this.outputValidationFailure(opportunityId, value === undefined ? 'missing_required_field' : 'invalid_json_shape', field);
    if (!value.every((id) => typeof id === 'string')) this.outputValidationFailure(opportunityId, 'invalid_json_shape', field, undefined, value.length);
    const unknownIds = value.filter((id) => !allowed.has(id));
    if (unknownIds.length > 0) this.outputValidationFailure(opportunityId, unknownReason, field, undefined, value.length, unknownIds);
    return [...new Set(value)];
  }

  private outputValidationFailure(opportunityId: string, reasonCode: OutputValidationReason, field?: string, receivedValue?: unknown, citationCount?: number, unknownCitationIds?: string[]): never {
    this.logger.warn(JSON.stringify({ stage: 'editorial_assessment.output_validation_failed', reasonCode, field, receivedValue: typeof receivedValue === 'string' ? receivedValue.slice(0, 120) : undefined, citationCount, unknownCitationIds: unknownCitationIds?.slice(0, 10).map((id) => id.slice(0, 120)), model: this.evaluator.model, opportunityId }));
    throw new EditorialAssessmentOutputValidationError('Editorial evaluator output validation failed');
  }

  private toContract(record: Awaited<ReturnType<EditorialAssessmentRepository['find']>>): EditorialAssessment {
    if (!record) throw new InternalServerErrorException('Editorial assessment is unavailable');
    return record as EditorialAssessment;
  }
}

function score(output: Output): number {
  const band: { [key: string]: number } = { low: 5, medium: 15, high: 25 };
  return Math.min(100, band[output.relevance] + band[output.newsworthiness] + band[output.contentPotential] + ({ breaking: 10, timely: 12, evergreen: 15 }[output.longevity] ?? 0) + ({ low: 10, medium: 5, high: 0 }[output.duplicationRisk] ?? 0));
}

export function editorialAssessmentInputHash(input: object) {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}
