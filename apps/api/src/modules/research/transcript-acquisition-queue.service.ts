import { Injectable, Optional } from '@nestjs/common';
import { SourceEvidenceContentStatus } from '@content-os/contracts';
import { SignalRepository, SourceEvidenceContentRepository, TranscriptAcquisitionJobRepository } from '@content-os/storage';
import { ResearchExecutionLogger } from './research-execution-logger.service';
import { YouTubeTranscriptRepairService, type TranscriptRepairOneResult } from './youtube-transcript-repair.service';

export const TRANSCRIPT_ACQUISITION_VERSION = 'transcript-acquisition-queue-v1';
/** A distinct logical generation preserves legacy terminal history while revalidating it. */
export const TRANSCRIPT_REVALIDATION_VERSION = 'transcript-acquisition-revalidation-v1';
const STALE_PROCESSING_MS = 30 * 60_000;
const TARGETABLE_VERSIONS = new Set([TRANSCRIPT_ACQUISITION_VERSION, TRANSCRIPT_REVALIDATION_VERSION]);

@Injectable()
export class TranscriptAcquisitionQueueService {
  constructor(
    private readonly jobs: TranscriptAcquisitionJobRepository,
    private readonly signals: SignalRepository,
    private readonly evidence: SourceEvidenceContentRepository,
    private readonly repairs: YouTubeTranscriptRepairService,
    @Optional() private readonly log?: ResearchExecutionLogger,
  ) {}

  async enqueue(projectId: string, signalId: string) {
    const signal = await this.signals.findById(signalId);
    if (!signal || signal.projectId !== projectId || signal.sourceType !== 'youtube' || !signal.externalId.startsWith('youtube:')) return { created: false, reason: 'ineligible_signal' as const };
    const terminal = (await this.evidence.findBySignalId(signalId)).some((item) => item.contentType === 'transcript' && [SourceEvidenceContentStatus.AVAILABLE, SourceEvidenceContentStatus.UNAVAILABLE].includes(item.status as SourceEvidenceContentStatus));
    if (terminal) return { created: false, reason: 'terminal_transcript_exists' as const };
    const result = await this.jobs.createIfAbsent({ projectId, signalId, version: TRANSCRIPT_ACQUISITION_VERSION });
    this.event(projectId, 'transcript_queue.enqueue', result.created ? 'created' : 'duplicate_skipped', { signalId, jobId: result.job.id });
    return { created: result.created, reason: result.created ? null : 'logical_job_exists' as const, job: result.job };
  }

  /** Only the historical audit service may use this path after proving the legacy outcome is stale. */
  async enqueueRevalidation(projectId: string, signalId: string) {
    const signal = await this.signals.findById(signalId);
    if (!signal || signal.projectId !== projectId || signal.sourceType !== 'youtube' || !signal.externalId.startsWith('youtube:')) return { created: false, reason: 'ineligible_signal' as const };
    const result = await this.jobs.createIfAbsent({ projectId, signalId, version: TRANSCRIPT_REVALIDATION_VERSION });
    this.event(projectId, 'transcript_queue.revalidation_enqueue', result.created ? 'created' : 'duplicate_skipped', { signalId, jobId: result.job.id });
    return { created: result.created, reason: result.created ? null : 'logical_revalidation_exists' as const, job: result.job };
  }

  async reconcile(projectId: string) {
    const signals = await this.signals.findAll(projectId);
    const eligible = signals.filter((signal) => signal.sourceType === 'youtube' && signal.externalId.startsWith('youtube:'));
    let created = 0; let skipped = 0;
    for (const signal of eligible) {
      const result = await this.enqueue(projectId, signal.id);
      if (result.created) created += 1; else skipped += 1;
    }
    return { eligibleSignals: eligible.length, jobsCreated: created, skipped };
  }

  async inspect(projectId: string) {
    const jobs = await this.jobs.findAll(projectId);
    return { jobs, summary: {
      pending: jobs.filter((job) => job.status === 'pending').length,
      processing: jobs.filter((job) => job.status === 'processing').length,
      available: jobs.filter((job) => job.status === 'available').length,
      noCaptions: jobs.filter((job) => job.status === 'no_captions').length,
      retryableFailure: jobs.filter((job) => job.status === 'retryable_failure').length,
      permanentFailure: jobs.filter((job) => job.status === 'permanent_failure').length,
    } };
  }

  /** One deliberate claim only. There is no scheduler or busy polling loop in V1. */
  async processNext(projectId: string) {
    await this.jobs.recoverStaleProcessing(projectId, new Date(Date.now() - STALE_PROCESSING_MS).toISOString());
    const job = await this.jobs.claimNext(projectId);
    if (!job) return { processed: false, job: null };
    return this.processClaimedJob(job);
  }

  /** Explicit development/repair execution path. It never consults global queue order. */
  async processJob(projectId: string, jobId: string) {
    const existing = await this.jobs.findById(jobId);
    if (!existing || existing.projectId !== projectId) return { processed: false, reason: 'not_found' as const, job: null };
    if (!TARGETABLE_VERSIONS.has(existing.version)) return { processed: false, reason: 'unsupported_generation' as const, job: existing };

    const now = new Date().toISOString();
    const job = await this.jobs.claimById(projectId, jobId, now);
    if (!job) {
      const current = await this.jobs.findById(jobId);
      return { processed: false, reason: targetedClaimReason(current, now), job: current ?? null };
    }
    return this.processClaimedJob(job);
  }

  private async processClaimedJob(job: { id: string; projectId: string; signalId: string; attempts: number }) {
    this.event(job.projectId, 'transcript_queue.job', 'processing', { jobId: job.id, signalId: job.signalId, attempt: job.attempts });
    try {
      const outcome = await this.repairs.repairOne(job.projectId, job.signalId);
      return { processed: true, job: await this.persistOutcome(job.id, job.attempts, outcome), outcome };
    } catch (error) {
      const classification = 'transcript_processing_failed';
      const nextAttemptAt = backoff(job.attempts);
      const updated = await this.jobs.retryLater(job.id, classification, nextAttemptAt);
      this.event(job.projectId, 'transcript_queue.job', 'retry_scheduled', { jobId: job.id, signalId: job.signalId, classification, nextAttemptAt });
      return { processed: true, job: updated, outcome: { kind: 'retryable_failure', classification } };
    }
  }

  async retry(projectId: string, signalId: string) { return this.jobs.retryNow(projectId, signalId, TRANSCRIPT_ACQUISITION_VERSION); }

  private async persistOutcome(jobId: string, attempts: number, outcome: TranscriptRepairOneResult) {
    if (outcome.kind === 'available') return this.jobs.complete(jobId, 'available');
    if (outcome.kind === 'no_captions') return this.jobs.complete(jobId, 'no_captions', outcome.classification);
    if (outcome.kind === 'permanent_failure') return this.jobs.complete(jobId, 'permanent_failure', outcome.classification);
    return this.jobs.retryLater(jobId, outcome.classification, backoff(attempts));
  }

  private event(projectId: string, event: string, status: string, result: Record<string, unknown>) {
    this.log?.withContext({ projectId }, () => this.log?.event('info', event, status, { result }));
  }
}

function targetedClaimReason(job: { status: string; nextAttemptAt: string | null } | undefined, now: string) {
  if (!job) return 'not_found' as const;
  if (job.status === 'processing') return 'already_processing' as const;
  if (job.status !== 'pending' && job.status !== 'retryable_failure') return 'terminal_or_unclaimable' as const;
  if (job.nextAttemptAt && job.nextAttemptAt > now) return 'not_due' as const;
  return 'already_claimed' as const;
}

function backoff(attempts: number) {
  const delayMs = Math.min(24 * 60 * 60_000, 5 * 60_000 * (2 ** Math.max(0, attempts - 1)));
  return new Date(Date.now() + delayMs).toISOString();
}
