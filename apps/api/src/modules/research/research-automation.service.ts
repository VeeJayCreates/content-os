import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { ProjectStatus, ResearchFactStatus, ResearchLifecycleState, type ResearchAutomationRun, type ResearchReviewQueueItem } from '@content-os/contracts';
import { OpportunityRepository, ProjectRepository, ResearchAutomationRepository, ResearchPackageRepository, ResearchSourceRepository, TopicSelectionRepository } from '@content-os/storage';
import { IngestionService } from './ingestion.service';
import { OpportunityService } from './opportunity.service';
import { ResearchExpansionService } from './research-expansion.service';
import { ResearchPackageService } from './research-package.service';
import { TopicSelectionService } from './topic-selection.service';
import { ResearchExecutionLogger } from './research-execution-logger.service';

const DEFAULT_INTERVAL_MS = 2 * 60 * 60 * 1_000;
const MIN_INTERVAL_MS = 60 * 60 * 1_000;
const DEFAULT_OPPORTUNITY_BUDGET = 5;
const DEFAULT_SOURCE_BUDGET = 8;

/**
 * Bounded project research loop. It deliberately ends at review_ready and
 * contains no downstream production action.
 */
@Injectable()
export class ResearchAutomationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ResearchAutomationService.name);
  private readonly running = new Set<string>();
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly projects: ProjectRepository,
    private readonly sources: ResearchSourceRepository,
    private readonly opportunities: OpportunityRepository,
    private readonly packageRecords: ResearchPackageRepository,
    private readonly selections: TopicSelectionRepository,
    private readonly runs: ResearchAutomationRepository,
    private readonly ingestion: IngestionService,
    private readonly opportunityService: OpportunityService,
    private readonly packages: ResearchPackageService,
    private readonly expansion: ResearchExpansionService,
    private readonly topicSelection: TopicSelectionService,
    @Optional() private readonly executionLog?: ResearchExecutionLogger,
  ) {}

  onModuleInit() {
    void this.executionLog?.initialize();
    if (process.env.RESEARCH_AUTOMATION_ENABLED !== 'true') return;
    this.timer = setInterval(() => void this.runAllConfiguredProjects(), this.intervalMs());
    void this.runAllConfiguredProjects();
  }

  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async status(projectId: string): Promise<ResearchAutomationRun> {
    return (await this.runs.findByProjectId(projectId)) ?? this.runs.createIdle(projectId);
  }

  async runProject(projectId: string): Promise<ResearchAutomationRun> {
    if (this.running.has(projectId)) return this.status(projectId);
    if (this.executionLog) return this.executionLog.withRun(projectId, () => this.runProjectInternal(projectId));
    return this.runProjectInternal(projectId);
  }

  private async runProjectInternal(projectId: string): Promise<ResearchAutomationRun> {
    this.running.add(projectId);
    const startedAt = new Date().toISOString();
    try {
      this.executionLog?.event('info', 'automation.configuration.resolved', 'completed', { result: { sourceBudget: this.sourceBudget(), opportunityBudget: this.opportunityBudget(), schedulerEnabled: process.env.RESEARCH_AUTOMATION_ENABLED === 'true' } });
      const project = await this.projects.findById(projectId);
      if (!project || project.status !== ProjectStatus.ACTIVE) {
        this.executionLog?.event('warn', 'automation.project.eligibility', 'skipped', { result: { reasonCode: 'project_not_active' } });
        return this.runs.upsert({ projectId, status: 'completed', lastRunAt: startedAt, nextRunAt: this.nextRunAt(), opportunitiesProcessed: 0, providerFailures: 0, warnings: ['Project is not active for research automation.'] });
      }
      const warnings: string[] = [];
      let providerFailures = 0;
      // Capture the authoritative pre-refresh identities. Detection remains the
      // single clustering/dedupe authority; this only gives freshly created
      // topics their first bounded research opportunity before older backlog.
      const opportunityIdsBeforeRefresh = new Set(
        (await this.opportunities.findAll(projectId)).map((opportunity) => opportunity.id),
      );
      const enabledSources = (await this.sources.findAll(projectId)).filter((source) => source.enabled).slice(0, this.sourceBudget());
      this.executionLog?.event('info', 'automation.sources.selected', 'completed', { result: { attempted: enabledSources.length, sourceIds: enabledSources.map((source) => source.id) } });
      for (const source of enabledSources) {
        const sourceStarted = Date.now();
        this.executionLog?.withContext({ sourceId: source.id }, () => this.executionLog?.event('debug', 'source.refresh.started', 'started', { result: { sourceType: source.sourceType, target: source.url } }));
        try {
          const outcome = await this.ingestion.ingest(source.id);
          this.executionLog?.withContext({ sourceId: source.id }, () => this.executionLog?.event('info', 'source.refresh.completed', 'completed', { durationMs: Date.now() - sourceStarted, result: outcome }));
        }
        catch (error) {
          providerFailures += 1;
          const category = safeFailureCategory(error);
          warnings.push(`Source '${source.name}' refresh failed (${category}).`);
          this.executionLog?.withContext({ sourceId: source.id }, () => this.executionLog?.event('warn', 'source.refresh.failed', 'failed', { durationMs: Date.now() - sourceStarted, result: { failureCategory: category } }));
        }
      }
      try {
        this.executionLog?.event('info', 'opportunity_detection.started', 'started');
        const detection = await this.opportunityService.detect(projectId);
        this.executionLog?.event('info', 'opportunity_detection.completed', 'completed', { result: detection });
      }
      catch (error) { providerFailures += 1; const category = safeFailureCategory(error); warnings.push(`Topic clustering failed (${category}).`); this.executionLog?.event('warn', 'opportunity_detection.failed', 'failed', { result: { failureCategory: category } }); }

      let processed = 0;
      const detectedOpportunities = await this.opportunities.findAll(projectId);
      const newOpportunityIds = new Set(
        detectedOpportunities
          .filter((opportunity) => !opportunityIdsBeforeRefresh.has(opportunity.id))
          .map((opportunity) => opportunity.id),
      );
      const candidateOpportunities = [
        ...detectedOpportunities.filter((item) => newOpportunityIds.has(item.id)),
        ...detectedOpportunities.filter((item) => !newOpportunityIds.has(item.id)),
      ]
        .filter((item) => item.status !== 'rejected')
        .slice(0, this.opportunityBudget());
      this.executionLog?.event('info', 'automation.opportunities.prioritized', 'completed', { result: { newOpportunityIds: [...newOpportunityIds], selectedIds: candidateOpportunities.map((item) => item.id), skippedCount: Math.max(0, detectedOpportunities.filter((item) => item.status !== 'rejected').length - candidateOpportunities.length) } });
      for (const opportunity of candidateOpportunities) {
        try {
          this.executionLog?.withContext({ opportunityId: opportunity.id }, () => this.executionLog?.event('info', 'topic_selection.started', 'started', { result: { opportunityScore: opportunity.score, processingPriority: newOpportunityIds.has(opportunity.id) ? 'new' : 'existing' } }));
          // Persist the existing project-specific content-potential result for
          // every newly detected candidate before research changes its inputs.
          const selection = await this.topicSelection.evaluateOne(opportunity.id);
          this.executionLog?.withContext({ opportunityId: opportunity.id }, () => this.executionLog?.event('info', 'topic_selection.completed', 'completed', { result: { selectionScore: selection.selectionScore, decision: selection.decision, reason: selection.reason } }));
          const record = await this.packageRecords.findByOpportunityId(opportunity.id);
          if (!record) {
            const generated = await this.packages.generate(opportunity.id);
            this.executionLog?.withContext({ opportunityId: opportunity.id, researchPackageId: generated.packageId }, () => this.executionLog?.event('info', 'research_package.generated', 'completed', { result: generated }));
          } else if (record.lifecycleState !== ResearchLifecycleState.REVIEW_READY) {
            const expanded = await this.expansion.expand(opportunity.id);
            this.executionLog?.withContext({ opportunityId: opportunity.id, researchPackageId: record.id }, () => this.executionLog?.event('info', 'research_expansion.completed', expanded.status, { result: expanded }));
          } else this.executionLog?.withContext({ opportunityId: opportunity.id, researchPackageId: record.id }, () => this.executionLog?.event('debug', 'research_package.skipped', 'skipped', { result: { reasonCode: 'review_ready' } }));
          processed += 1;
        } catch (error) {
          providerFailures += 1;
          const category = safeFailureCategory(error);
          warnings.push(`Research for '${opportunity.title.slice(0, 80)}' failed (${category}).`);
          this.executionLog?.withContext({ opportunityId: opportunity.id }, () => this.executionLog?.event('warn', 'research_processing.failed', 'failed', { result: { failureCategory: category } }));
        }
      }
      const completed = await this.runs.upsert({ projectId, status: 'completed', lastRunAt: startedAt, nextRunAt: this.nextRunAt(), opportunitiesProcessed: processed, providerFailures, warnings });
      this.executionLog?.event('info', 'automation.completed', 'completed', { result: completed });
      return completed;
    } catch {
      const failed = await this.runs.upsert({ projectId, status: 'failed', lastRunAt: startedAt, nextRunAt: this.nextRunAt(), opportunitiesProcessed: 0, providerFailures: 1, warnings: ['Research automation failed before completion.'] });
      this.executionLog?.event('error', 'automation.failed', 'failed', { result: failed });
      return failed;
    } finally { this.running.delete(projectId); }
  }

  async reviewQueue(projectId: string): Promise<ResearchReviewQueueItem[]> {
    const packages = await this.packageRecords.findAll(projectId);
    const opportunityScores = new Map((await this.opportunities.findAll(projectId)).map((opportunity) => [opportunity.id, opportunity.score]));
    const items = await Promise.all(packages.map(async (record) => {
      const detail = await this.packages.findOne(record.id);
      const selection = await this.selections.findByOpportunityId(record.opportunityId);
      const supportedFacts = detail.facts.filter((fact) => fact.status === ResearchFactStatus.SUPPORTED).map((fact) => fact.claim);
      const unverifiedFacts = detail.facts.filter((fact) => fact.status !== ResearchFactStatus.SUPPORTED).map((fact) => fact.claim);
      const reviewReady = record.lifecycleState === ResearchLifecycleState.REVIEW_READY;
      return {
        researchPackageId: record.id, opportunityId: record.opportunityId, projectId, title: record.opportunityTitle, topicStrength: opportunityScores.get(record.opportunityId) ?? 0,
        contentPotentialScore: selection?.selectionScore ?? 0,
        contentPotentialRecommendation: selection?.decision === 'selected' ? 'selected' : selection?.decision === 'rejected' ? 'rejected' : 'hold',
        contentPotentialReason: selection?.reason ?? 'Topic selection has not yet met the project-specific potential gate.',
        researchConfidence: record.confidenceScore, supportingEvidenceCount: detail.verification.supportingContentCount,
        evidenceRecordCount: detail.verification.evidenceRecordCount,
        distinctSourceCount: detail.verification.distinctSourceCount, lifecycleState: record.lifecycleState as ResearchLifecycleState,
        verificationStatus: detail.verification.verificationStatus, supportedFacts, unverifiedFacts,
        sourceNames: [...new Set(detail.signals.map((signal) => signal.sourceName))], updatedAt: record.updatedAt,
        reviewReadyReason: reviewReady ? `${detail.verification.verificationReasons.join(' ')} ${selection?.reason ?? ''}`.trim() : null,
      } satisfies ResearchReviewQueueItem;
    }));
    return items.filter((item) => item.lifecycleState === ResearchLifecycleState.REVIEW_READY).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  private async runAllConfiguredProjects() {
    for (const project of await this.projects.findAll()) if (project.status === ProjectStatus.ACTIVE) await this.runProject(project.id);
  }
  private intervalMs() { return Math.max(MIN_INTERVAL_MS, Number(process.env.RESEARCH_AUTOMATION_INTERVAL_MS) || DEFAULT_INTERVAL_MS); }
  private opportunityBudget() { return Math.max(1, Math.min(10, Number(process.env.RESEARCH_AUTOMATION_MAX_OPPORTUNITIES_PER_RUN) || DEFAULT_OPPORTUNITY_BUDGET)); }
  private sourceBudget() { return Math.max(1, Math.min(12, Number(process.env.RESEARCH_AUTOMATION_MAX_SOURCES_PER_RUN) || DEFAULT_SOURCE_BUDGET)); }
  private nextRunAt() { return new Date(Date.now() + this.intervalMs()).toISOString(); }
}

/** No message/body is retained: run records are safe to display in the dashboard. */
function safeFailureCategory(error: unknown): string {
  if (error && typeof error === 'object' && 'name' in error && typeof error.name === 'string') return error.name.slice(0, 80);
  return 'unknown_error';
}
