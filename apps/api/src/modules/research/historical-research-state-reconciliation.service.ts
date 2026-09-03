import { Injectable, Optional } from '@nestjs/common';
import { SourceEvidenceContentStatus } from '@content-os/contracts';
import { OpportunityRepository, SignalRepository, SourceEvidenceContentRepository, TranscriptAcquisitionJobRepository } from '@content-os/storage';
import { NewVideoTopicService } from './new-video-topic.service';
import { ResearchExecutionLogger } from './research-execution-logger.service';
import { TranscriptAcquisitionQueueService } from './transcript-acquisition-queue.service';
import { YOUTUBE_TRANSCRIPT_COMPLETENESS_VERSION } from './youtube-transcript-completeness';

type TranscriptAuditState = 'trusted_available' | 'trusted_no_captions' | 'stale_unavailable' | 'stale_failed' | 'legacy_available_unverified' | 'in_flight' | 'missing';
type AuditRecord = { signalId: string; videoId: string; transcriptState: TranscriptAuditState; topicState: 'present' | 'missing'; reason: string; jobId: string | null; evidenceIds: string[] };

/**
 * Audits historical outcomes without deleting or mutating their evidence.  A caller must
 * explicitly select stale records for repair; normal queue reconciliation remains incremental.
 */
@Injectable()
export class HistoricalResearchStateReconciliationService {
  constructor(
    private readonly signals: SignalRepository,
    private readonly evidence: SourceEvidenceContentRepository,
    private readonly jobs: TranscriptAcquisitionJobRepository,
    private readonly opportunities: OpportunityRepository,
    private readonly topics: NewVideoTopicService,
    private readonly queue: TranscriptAcquisitionQueueService,
    @Optional() private readonly log?: ResearchExecutionLogger,
  ) {}

  async audit(projectId: string, signalIds?: string[]) {
    const records = (await this.signals.findAll(projectId))
      .filter((signal) => signal.sourceType === 'youtube' && signal.externalId.startsWith('youtube:'))
      .filter((signal) => !signalIds?.length || signalIds.includes(signal.id));
    const ids = records.map((record) => record.id);
    const [evidence, jobs, topics] = await Promise.all([
      this.evidence.findTranscriptBySignalIds(ids),
      this.jobs.findBySignalIds(ids),
      this.opportunities.findBySignalIds(ids),
    ]);
    const evidenceBySignal = groupBy(evidence, (item) => item.signalId);
    const jobsBySignal = groupBy(jobs, (item) => item.signalId);
    const audit: AuditRecord[] = records.map((signal) => {
      const transcriptEvidence = evidenceBySignal.get(signal.id) ?? [];
      const transcriptJob = preferredJob(jobsBySignal.get(signal.id) ?? []);
      const transcript = classifyTranscript(transcriptEvidence, transcriptJob?.status);
      return {
        signalId: signal.id,
        videoId: signal.externalId.slice('youtube:'.length),
        transcriptState: transcript.state,
        topicState: topics.has(signal.id) ? 'present' : 'missing',
        reason: transcript.reason,
        jobId: transcriptJob?.id ?? null,
        evidenceIds: transcriptEvidence.map((item) => item.id),
      };
    });
    return { eligibleSignals: audit.length, summary: summarize(audit), records: audit };
  }

  async repair(projectId: string, signalIds: string[], dryRun = false) {
    const selected = [...new Set(signalIds)];
    const audit = await this.audit(projectId, selected);
    const result = {
      dryRun,
      eligibleSignals: audit.eligibleSignals,
      transcriptJobsCreated: 0,
      transcriptJobsReopened: 0,
      transcriptJobsSkipped: 0,
      topicsCreated: 0,
      topicsJoined: 0,
      topicsSkipped: 0,
      topicFailures: 0,
      records: [] as Array<{ signalId: string; videoId: string; transcriptAction: string; topicAction: string }>,
    };
    const missingTopics = audit.records.filter((record) => record.topicState === 'missing').map((record) => record.signalId);
    const topicActions = new Map<string, string>();
    if (missingTopics.length && !dryRun) {
      try {
        const processed = await this.topics.process(projectId, missingTopics);
        result.topicsCreated = processed.topicsCreated;
        result.topicsJoined = processed.videosJoinedToExistingTopic;
        result.topicFailures = processed.failures.length;
        for (const mapping of processed.mappings) topicActions.set(mapping.signalId, mapping.decision);
      } catch {
        result.topicFailures = missingTopics.length;
      }
    }
    for (const record of audit.records) {
      let transcriptAction = 'untouched';
      if (record.transcriptState === 'stale_unavailable' || record.transcriptState === 'stale_failed') {
        transcriptAction = dryRun ? 'would_reopen_stale_terminal' : await this.safeQueue(() => this.createRevalidation(projectId, record.signalId, result));
      } else if (record.transcriptState === 'missing') {
        transcriptAction = dryRun ? 'would_create_missing_job' : await this.safeQueue(() => this.createInitialJob(projectId, record.signalId, result));
      } else {
        result.transcriptJobsSkipped += 1;
      }
      const topicAction = record.topicState === 'present' ? 'existing_skipped' : dryRun ? 'would_process_missing_topic' : topicActions.get(record.signalId) ?? 'topic_processing_failed';
      if (record.topicState === 'present') result.topicsSkipped += 1;
      result.records.push({ signalId: record.signalId, videoId: record.videoId, transcriptAction, topicAction });
    }
    this.log?.withContext({ projectId }, () => this.log?.event('info', 'historical_research_reconciliation.completed', dryRun ? 'dry_run' : 'repaired', { result: { eligibleSignals: result.eligibleSignals, transcriptJobsCreated: result.transcriptJobsCreated, transcriptJobsReopened: result.transcriptJobsReopened, topicsCreated: result.topicsCreated, topicsJoined: result.topicsJoined, topicFailures: result.topicFailures } }));
    return result;
  }

  private async createRevalidation(projectId: string, signalId: string, result: { transcriptJobsCreated: number; transcriptJobsReopened: number; transcriptJobsSkipped: number }) {
    const queued = await this.queue.enqueueRevalidation(projectId, signalId);
    if (queued.created) { result.transcriptJobsReopened += 1; return 'revalidation_job_created'; }
    result.transcriptJobsSkipped += 1;
    return 'revalidation_already_exists';
  }

  private async createInitialJob(projectId: string, signalId: string, result: { transcriptJobsCreated: number; transcriptJobsReopened: number; transcriptJobsSkipped: number }) {
    const queued = await this.queue.enqueue(projectId, signalId);
    if (queued.created) { result.transcriptJobsCreated += 1; return 'initial_job_created'; }
    result.transcriptJobsSkipped += 1;
    return 'initial_job_already_exists';
  }

  private async safeQueue(action: () => Promise<string>) {
    try { return await action(); } catch { return 'queue_repair_failed'; }
  }
}

function classifyTranscript(items: Array<{ id: string; status: string; provenance: Record<string, unknown> }>, jobStatus?: string): { state: TranscriptAuditState; reason: string } {
  if (jobStatus === 'pending' || jobStatus === 'processing' || jobStatus === 'retryable_failure') return { state: 'in_flight', reason: `queue_${jobStatus}` };
  const available = items.find((item) => item.status === SourceEvidenceContentStatus.AVAILABLE);
  if (available) {
    const completeness = valueAt(available.provenance, 'transcriptCompleteness', 'classification');
    const validationVersion = typeof available.provenance.validationVersion === 'string' ? available.provenance.validationVersion : null;
    if (validationVersion === YOUTUBE_TRANSCRIPT_COMPLETENESS_VERSION && completeness === 'complete') return { state: 'trusted_available', reason: 'current_complete_validation' };
    return { state: 'legacy_available_unverified', reason: 'available_without_current_complete_validation' };
  }
  if (items.some((item) => item.status === SourceEvidenceContentStatus.FAILED)) return { state: 'stale_failed', reason: 'historical_acquisition_failure_without_current_terminal_validation' };
  const unavailable = items.find((item) => item.status === SourceEvidenceContentStatus.UNAVAILABLE);
  if (unavailable) {
    const validationVersion = typeof unavailable.provenance.validationVersion === 'string' ? unavailable.provenance.validationVersion : null;
    const outcome = unavailable.provenance.transcriptOutcome;
    if (validationVersion === YOUTUBE_TRANSCRIPT_COMPLETENESS_VERSION && outcome === 'no_captions_available') return { state: 'trusted_no_captions', reason: 'current_no_caption_validation' };
    return { state: 'stale_unavailable', reason: 'historical_no_caption_without_current_validation' };
  }
  return { state: 'missing', reason: 'no_transcript_evidence_or_job' };
}

function valueAt(value: Record<string, unknown>, key: string, nestedKey: string) { const nested = value[key]; return nested && typeof nested === 'object' ? (nested as Record<string, unknown>)[nestedKey] : null; }
function groupBy<T>(items: T[], key: (item: T) => string) { const grouped = new Map<string, T[]>(); for (const item of items) grouped.set(key(item), [...(grouped.get(key(item)) ?? []), item]); return grouped; }
function preferredJob<T extends { id: string; status: string; createdAt: string }>(jobs: T[]) { const active = new Set(['pending', 'processing', 'retryable_failure']); return [...jobs].sort((left, right) => Number(active.has(right.status)) - Number(active.has(left.status)) || right.createdAt.localeCompare(left.createdAt))[0]; }
function summarize(records: AuditRecord[]) { const count = (predicate: (record: AuditRecord) => boolean) => records.filter(predicate).length; return { trustedAvailable: count((record) => record.transcriptState === 'trusted_available'), trustedNoCaptions: count((record) => record.transcriptState === 'trusted_no_captions'), staleRecoverable: count((record) => record.transcriptState === 'stale_unavailable' || record.transcriptState === 'stale_failed'), legacyAvailableUnverified: count((record) => record.transcriptState === 'legacy_available_unverified'), inFlight: count((record) => record.transcriptState === 'in_flight'), missingTranscriptState: count((record) => record.transcriptState === 'missing'), topicsPresent: count((record) => record.topicState === 'present'), topicsMissing: count((record) => record.topicState === 'missing') }; }
