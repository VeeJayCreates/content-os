import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ResearchLifecycleState, TopicSelectionDecision } from '@content-os/contracts';
import type {
  ResearchEvidence,
  ResearchFact,
  ResearchPackage,
  ResearchPackageDetail,
  ResearchPackageGenerationResult,
  ResearchPackageStatus,
  ResearchVerification,
} from '@content-os/contracts';
import {
  OpportunityRepository,
  ResearchFactWithEvidence,
  ResearchPackageRepository,
  ResearchPackageWithContext,
} from '@content-os/storage';
import { GeographicEntityEnrichmentService } from './geographic-entity-enrichment.service';

import {
  factStatusForSources,
  normalizeClaimKey,
  scoreResearchConfidence,
  summarizeResearchPackage,
} from './research-package';
import {
  OpportunityEvidenceResolutionError,
  OpportunityEvidenceService,
  type ResolvedOpportunityEvidence,
} from './opportunity-evidence.service';
import { evaluateResearchVerification } from './research-verification';
import { TopicSelectionService } from './topic-selection.service';
import { ResearchExecutionLogger } from './research-execution-logger.service';

@Injectable()
export class ResearchPackageService {
  private readonly logger = new Logger(ResearchPackageService.name);

  constructor(
    private readonly opportunities: OpportunityRepository,
    private readonly packages: ResearchPackageRepository,
    private readonly evidence: OpportunityEvidenceService,
    private readonly geographicEntities?: GeographicEntityEnrichmentService,
    @Optional() private readonly topicSelections?: TopicSelectionService,
    @Optional() private readonly executionLog?: ResearchExecutionLogger,
  ) {}

  async generate(opportunityId: string): Promise<ResearchPackageGenerationResult> {
    const startedAt = Date.now();
    this.executionLog?.withContext({ opportunityId }, () => this.executionLog?.event('info', 'research_package.generation.started', 'started'));
    const opportunity = await this.opportunities.findById(opportunityId);
    if (!opportunity) throw new NotFoundException('Opportunity not found');

    let resolvedEvidence: ResolvedOpportunityEvidence;
    try {
      resolvedEvidence = await this.evidence.resolveOpportunityEvidence(
        opportunityId,
      );
    } catch (error) {
      if (error instanceof OpportunityEvidenceResolutionError) {
        this.executionLog?.withContext({ opportunityId }, () => this.executionLog?.event('warn', 'research_package.evidence_resolution', 'failed', { result: { category: error.category } }));
        this.logger.warn(
          JSON.stringify({
            stage: 'research_package.evidence_resolution_failed',
            opportunityId,
            category: error.category,
          }),
        );
        throw new ConflictException('Opportunity evidence is unavailable');
      }
      throw error;
    }
    const signals = resolvedEvidence.signals;
    if (!signals.length)
      throw new ConflictException('Opportunity has no supporting signals');

    const sourceCount = new Set(
      signals.map((signal) => signal.researchSourceId),
    ).size;
    this.executionLog?.withContext({ opportunityId, projectId: opportunity.projectId }, () => this.executionLog?.event('debug', 'research_package.evidence.resolved', 'completed', { result: { evidenceKind: resolvedEvidence.kind, signalCount: signals.length, sourceCount } }));
    const candidateClaimCount = resolvedEvidence.kind === 'candidate'
      ? new Set(resolvedEvidence.candidates.map((candidate) => normalizeClaimKey(candidate.candidateText))).size
      : 1;
    const verification = evaluateResearchVerification({
      signals: signals.map((signal) => ({
        signalId: signal.id,
        researchSourceId: signal.researchSourceId,
      })),
      candidateClaimCount,
      facts: [],
    });
    const confidenceScore = scoreResearchConfidence(signals);
    const packageData = {
      title: opportunity.title,
      summary: summarizeResearchPackage(
        opportunity.title,
        opportunity.summary,
        signals,
      ),
      status: 'ready',
      confidenceScore,
      sourceCount,
      signalCount: signals.length,
      lifecycleState: ResearchLifecycleState.RESEARCHING,
    } as const;

    let researchPackage =
      await this.packages.findByOpportunityId(opportunityId);
    const reusedResearchPackage = Boolean(researchPackage);
    if (researchPackage) {
      researchPackage = (await this.packages.update(
        researchPackage.id,
        packageData,
      ))!;
    } else {
      researchPackage = await this.packages.create({
        projectId: opportunity.projectId,
        opportunityId,
        ...packageData,
      });
    }

    let factsCreated = 0;
    let factsUpdated = 0;
    let finalVerification = verification;
    if (resolvedEvidence.kind === 'candidate') {
      const facts = new Map<string, { claim: string; normalizedClaimKey: string; signalIds: string[] }>();
      const signalSourceById = new Map(
        signals.map((signal) => [signal.id, signal.researchSourceId]),
      );
      const candidateSignalIds = new Set(resolvedEvidence.candidates.map((candidate) => candidate.signal.id));
      for (const candidate of resolvedEvidence.candidates) {
        const normalizedClaimKey = normalizeClaimKey(candidate.candidateText);
        const existing = facts.get(normalizedClaimKey);
        if (existing) {
          existing.signalIds.push(candidate.signal.id);
        } else {
          facts.set(normalizedClaimKey, {
            claim: candidate.candidateText,
            normalizedClaimKey,
            signalIds: [candidate.signal.id],
          });
        }
      }
      const legacySignals = signals.filter((signal) => !candidateSignalIds.has(signal.id));
      if (legacySignals.length > 0) {
        const normalizedOpportunityKey = normalizeClaimKey(opportunity.title);
        const existing = facts.get(normalizedOpportunityKey);
        if (existing) existing.signalIds.push(...legacySignals.map((signal) => signal.id));
        else facts.set(normalizedOpportunityKey, { claim: opportunity.title, normalizedClaimKey: normalizedOpportunityKey, signalIds: legacySignals.map((signal) => signal.id) });
      }
      const replacements = [...facts.values()].map((fact) => {
        const factSourceCount = new Set(
          fact.signalIds
            .map((signalId) => signalSourceById.get(signalId))
            .filter((sourceId): sourceId is string => Boolean(sourceId)),
        ).size;

        return {
          ...fact,
          signalIds: [...new Set(fact.signalIds)],
          confidence: confidenceScore,
          status: factStatusForSources(factSourceCount),
        };
      });

      const replacement = await this.packages.replaceFactsWithEvidence(
        researchPackage.id,
        replacements,
      );
      await this.enrichPackageFacts(researchPackage.id);

      finalVerification = evaluateResearchVerification({
        signals: signals.map((signal) => ({ signalId: signal.id, researchSourceId: signal.researchSourceId })),
        candidateClaimCount,
        facts: replacements.map((fact) => ({ status: fact.status })),
      });
      const potential = finalVerification.canProceedAutomatically && this.topicSelections
        ? await this.topicSelections.evaluateOne(opportunityId)
        : null;
      const lifecycleUpdated = await this.packages.update(researchPackage.id, {
        lifecycleState: !finalVerification.canProceedAutomatically
          ? ResearchLifecycleState.NEEDS_MORE_EVIDENCE
          : potential?.decision === TopicSelectionDecision.SELECTED
            ? ResearchLifecycleState.REVIEW_READY
            : ResearchLifecycleState.CORROBORATED,
      });
      if (lifecycleUpdated) researchPackage = lifecycleUpdated;

      if (replacement.previousFactCount > 0) {
        factsUpdated = replacements.length;
      } else {
        factsCreated = replacements.length;
      }
    } else {
      const factResult = await this.packages.upsertFact({
        researchPackageId: researchPackage.id,
        claim: opportunity.title,
        normalizedClaimKey: normalizeClaimKey(opportunity.title),
        confidence: confidenceScore,
        status: factStatusForSources(sourceCount),
      });
      if (factResult.created) factsCreated += 1;
      else factsUpdated += 1;
      for (const signal of signals) await this.packages.attachEvidence(factResult.fact.id, signal.id);
      await this.enrichPackageFacts(researchPackage.id);
      finalVerification = evaluateResearchVerification({
        signals: signals.map((signal) => ({ signalId: signal.id, researchSourceId: signal.researchSourceId })),
        candidateClaimCount,
        facts: [{ status: factResult.fact.status }],
      });
    }
    this.executionLog?.withContext({ opportunityId, projectId: opportunity.projectId, researchPackageId: researchPackage.id }, () => this.executionLog?.event('info', 'research_package.persistence.completed', 'completed', { result: { reused: reusedResearchPackage, status: researchPackage.status, confidenceScore, sourceCount, signalCount: signals.length, factsCreated, factsUpdated, verificationStatus: finalVerification.verificationStatus, canProceedAutomatically: finalVerification.canProceedAutomatically, lifecycleState: researchPackage.lifecycleState }, durationMs: Date.now() - startedAt }));

    return {
      packageId: researchPackage.id,
      signalsProcessed: signals.length,
      sourcesUsed: sourceCount,
      factsCreated,
      factsUpdated,
      confidenceScore,
      verification: finalVerification,
      warnings: sourceCount < 2
          ? ['Only one independent source supports this package.']
          : [],
    };
  }

  private async enrichPackageFacts(researchPackageId: string) {
    if (!this.geographicEntities) return;
    const rows = (await this.packages.findFactsWithEvidenceByPackageIds([researchPackageId])).get(researchPackageId) ?? [];
    for (const [factId, factRows] of new Map([...rows.reduce((groups, row) => groups.set(row.id, [...(groups.get(row.id) ?? []), row]), new Map<string, ResearchFactWithEvidence[]>())]).entries()) {
      const fact = factRows[0]; if (!fact) continue;
      await this.enrichOneFact(fact, factRows.map((row) => row.signalId).filter((id): id is string => Boolean(id)));
    }
  }

  private async enrichOneFact(fact: { id: string; claim: string; status: string }, signalIds: string[]) {
    if (!this.geographicEntities) return;
    await this.packages.setFactGeographicEntities(fact.id, await this.geographicEntities.enrich(fact, signalIds));
  }

  async findAll(projectId?: string): Promise<ResearchPackage[]> {
    return (await this.packages.findAll(projectId)).map((researchPackage) =>
      this.toPackage(researchPackage),
    );
  }

  async findOne(id: string): Promise<ResearchPackageDetail> {
    const researchPackage = await this.packages.findById(id);
    if (!researchPackage)
      throw new NotFoundException('Research package not found');

    const rows =
      (await this.packages.findFactsWithEvidenceByPackageIds([id])).get(id) ??
      [];
    const factsAndSignals = this.toFactsAndSignals(rows);
    return {
      ...this.toPackage(researchPackage),
      ...factsAndSignals,
      verification: this.verificationFor(factsAndSignals),
    };
  }

  async review(id: string, decision: 'approved' | 'rejected'): Promise<ResearchPackage> {
    const existing = await this.packages.findById(id);
    if (!existing) throw new NotFoundException('Research package not found');
    if (existing.lifecycleState !== ResearchLifecycleState.REVIEW_READY) {
      throw new ConflictException('Only review-ready research packages can be reviewed');
    }
    const lifecycleState = decision === 'approved'
      ? ResearchLifecycleState.APPROVED
      : ResearchLifecycleState.REJECTED;
    const updated = await this.packages.update(id, { lifecycleState });
    if (!updated) throw new NotFoundException('Research package not found');
    return this.toPackage(updated);
  }

  private toPackage(record: ResearchPackageWithContext): ResearchPackage {
    return {
      id: record.id,
      projectId: record.projectId,
      opportunityId: record.opportunityId,
      project: { id: record.projectId, name: record.projectName },
      opportunityTitle: record.opportunityTitle,
      title: record.title,
      summary: record.summary,
      status: record.status as ResearchPackageStatus,
      lifecycleState: record.lifecycleState as ResearchLifecycleState,
      confidenceScore: record.confidenceScore,
      sourceCount: record.sourceCount,
      signalCount: record.signalCount,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  private toFactsAndSignals(
    rows: ResearchFactWithEvidence[],
  ): Pick<ResearchPackageDetail, 'facts' | 'signals'> {
    const facts = new Map<string, ResearchFact>();
    const signals = new Map<string, ResearchEvidence>();
    for (const row of rows) {
      let fact = facts.get(row.id);
      if (!fact) {
        fact = {
          id: row.id,
          claim: row.claim,
          confidence: row.confidence,
          status: row.status as ResearchFact['status'],
          geographicEntities: Array.isArray(row.geographicEntities) ? row.geographicEntities as ResearchFact['geographicEntities'] : [],
          evidence: [],
          createdAt: row.createdAt,
        };
        facts.set(row.id, fact);
      }
      if (
        !row.signalId ||
        !row.researchSourceId ||
        !row.signalTitle ||
        !row.signalUrl ||
        !row.sourceName ||
        !row.signalDiscoveredAt
      )
        continue;
      const evidence = {
        signalId: row.signalId,
        researchSourceId: row.researchSourceId,
        title: row.signalTitle,
        url: row.signalUrl,
        summary: row.signalSummary,
        sourceName: row.sourceName,
        publishedAt: row.signalPublishedAt,
        discoveredAt: row.signalDiscoveredAt,
      };
      fact.evidence.push(evidence);
      signals.set(evidence.signalId, evidence);
    }
    return { facts: [...facts.values()], signals: [...signals.values()] };
  }

  private verificationFor(detail: Pick<ResearchPackageDetail, 'facts' | 'signals'>): ResearchVerification {
    return evaluateResearchVerification({
      signals: detail.signals.map((signal) => ({
        signalId: signal.signalId,
        researchSourceId: signal.researchSourceId,
      })),
      candidateClaimCount: detail.facts.length,
      facts: detail.facts,
    });
  }
}
