import { Injectable, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { ResearchSourceRole, ResearchSourceType } from '@content-os/contracts';
import { ProjectRepository, ResearchSourceRepository } from '@content-os/storage';

import { CompetitorYouTubeIngestionService } from './competitor-youtube-ingestion.service';
import { ResearchExecutionLogger } from './research-execution-logger.service';
import { ResearchSchedulerConfigurationService } from './research-scheduler.configuration';
import { TranscriptAcquisitionQueueService } from './transcript-acquisition-queue.service';

type SchedulerRunSource = 'scheduled' | 'manual';
export const RESEARCH_DISCOVERY_TIME_ZONE = 'Asia/Kolkata';
const DISCOVERY_HOURS_IST = [0, 6, 12, 18] as const;
const IST_OFFSET_MS = 5.5 * 60 * 60_000;

export type DiscoverySchedulerResult = {
  skipped: boolean;
  reason?: 'disabled' | 'overlap';
  projectsAttempted: number;
  sourcesAttempted: number;
  videosDiscovered: number;
  newSignalsCreated: number;
  topicsCreated: number;
  transcriptJobsEnqueued: number;
  sourceFailures: number;
  failures: Array<{ projectId: string; category: string }>;
};

export type TranscriptSchedulerResult = {
  skipped: boolean;
  reason?: 'disabled' | 'overlap';
  projectsChecked: number;
  processed: boolean;
  jobId: string | null;
  signalId: string | null;
  outcome: string | null;
  failureClassification: string | null;
  rateLimitStop: boolean;
};

/**
 * V1 uses timers only to orchestrate established durable services. It does not
 * implement a second queue or provider path, and never runs work on startup.
 */
@Injectable()
export class ResearchSchedulerService implements OnModuleInit, OnModuleDestroy {
  private discoveryTimer?: NodeJS.Timeout;
  private transcriptTimer?: NodeJS.Timeout;
  private discoveryRunning = false;
  private transcriptRunning = false;

  constructor(
    private readonly projects: ProjectRepository,
    private readonly sources: ResearchSourceRepository,
    private readonly ingestion: CompetitorYouTubeIngestionService,
    private readonly queue: TranscriptAcquisitionQueueService,
    private readonly configuration: ResearchSchedulerConfigurationService,
    @Optional() private readonly log?: ResearchExecutionLogger,
  ) {}

  onModuleInit() {
    if (!this.configuration.value.enabled) {
      this.event('info', 'research_scheduler.registration', 'disabled', { schedulerEnabled: false });
      return;
    }

    this.scheduleNextDiscovery();
    this.transcriptTimer = setInterval(() => { void this.runTranscriptWorker('scheduled'); }, this.configuration.value.transcriptIntervalMs);
    this.event('info', 'research_scheduler.registration', 'registered', {
      discoveryTimeZone: RESEARCH_DISCOVERY_TIME_ZONE,
      discoveryHours: DISCOVERY_HOURS_IST,
      nextDiscoveryAt: nextDiscoveryTriggerAt(new Date()).toISOString(),
      transcriptIntervalMs: this.configuration.value.transcriptIntervalMs,
      transcriptsPerRun: this.configuration.value.transcriptsPerRun,
    });
  }

  onModuleDestroy() {
    if (this.discoveryTimer) clearInterval(this.discoveryTimer);
    if (this.transcriptTimer) clearInterval(this.transcriptTimer);
  }

  private scheduleNextDiscovery() {
    const next = nextDiscoveryTriggerAt(new Date());
    this.discoveryTimer = setTimeout(() => {
      // Schedule the next wall-clock trigger before executing. If a prior run
      // is still active, runDiscovery records the overlap skip without moving
      // the following 00:00/06:00/12:00/18:00 IST trigger.
      this.scheduleNextDiscovery();
      void this.runDiscovery('scheduled');
    }, next.getTime() - Date.now());
  }

  async runDiscovery(source: SchedulerRunSource = 'manual'): Promise<DiscoverySchedulerResult> {
    if (source === 'scheduled' && !this.configuration.value.enabled) return this.discoverySkipped('disabled');
    if (this.discoveryRunning) return this.discoverySkipped('overlap');
    this.discoveryRunning = true;
    const startedAt = Date.now();
    const result: DiscoverySchedulerResult = {
      skipped: false,
      projectsAttempted: 0,
      sourcesAttempted: 0,
      videosDiscovered: 0,
      newSignalsCreated: 0,
      topicsCreated: 0,
      transcriptJobsEnqueued: 0,
      sourceFailures: 0,
      failures: [],
    };
    this.event('info', 'research_scheduler.discovery', 'started', { source, startedAt: new Date().toISOString() });

    try {
      const configuredSources = await this.sources.findAll();
      const eligibleProjectIds = [...new Set(configuredSources
        .filter((item) => item.enabled && item.sourceType === ResearchSourceType.YOUTUBE && [ResearchSourceRole.DISCOVERY, ResearchSourceRole.BOTH].includes(item.role as ResearchSourceRole))
        .map((item) => item.projectId))];

      for (const projectId of eligibleProjectIds) {
        result.projectsAttempted += 1;
        result.sourcesAttempted += configuredSources.filter((item) => item.projectId === projectId && item.enabled && item.sourceType === ResearchSourceType.YOUTUBE && [ResearchSourceRole.DISCOVERY, ResearchSourceRole.BOTH].includes(item.role as ResearchSourceRole)).length;
        try {
          const ingestion = await this.ingestion.ingest(projectId);
          result.videosDiscovered += ingestion.videosDiscovered;
          result.newSignalsCreated += ingestion.newVideosIngested;
          result.topicsCreated += ingestion.topicsCreated;
          result.transcriptJobsEnqueued += ingestion.transcriptJobsCreated;
          result.sourceFailures += ingestion.sourcesFailed;
        } catch (error) {
          result.failures.push({ projectId, category: safeFailureCategory(error) });
          this.event('warn', 'research_scheduler.discovery.project', 'failed', { projectId, failureCategory: safeFailureCategory(error) });
        }
      }
      return result;
    } finally {
      this.discoveryRunning = false;
      this.event('info', 'research_scheduler.discovery', 'completed', { source, completedAt: new Date().toISOString(), ...result }, Date.now() - startedAt);
    }
  }

  async runTranscriptWorker(source: SchedulerRunSource = 'manual'): Promise<TranscriptSchedulerResult> {
    if (source === 'scheduled' && !this.configuration.value.enabled) return this.transcriptSkipped('disabled');
    if (this.transcriptRunning) return this.transcriptSkipped('overlap');
    this.transcriptRunning = true;
    const startedAt = Date.now();
    const result: TranscriptSchedulerResult = {
      skipped: false,
      projectsChecked: 0,
      processed: false,
      jobId: null,
      signalId: null,
      outcome: null,
      failureClassification: null,
      rateLimitStop: false,
    };
    this.event('info', 'research_scheduler.transcript', 'started', { source, startedAt: new Date().toISOString() });

    try {
      for (const project of await this.projects.findAll()) {
        result.projectsChecked += 1;
        const processed = await this.queue.processNext(project.id);
        if (!processed.processed) continue;
        const outcome = 'outcome' in processed ? processed.outcome : undefined;
        result.processed = true;
        result.jobId = processed.job?.id ?? null;
        result.signalId = processed.job?.signalId ?? null;
        result.outcome = outcome?.kind ?? processed.job?.status ?? null;
        result.failureClassification = outcome?.classification ?? processed.job?.failureClassification ?? null;
        result.rateLimitStop = isRateLimited(result.failureClassification);
        return result;
      }
      return result;
    } finally {
      this.transcriptRunning = false;
      this.event('info', 'research_scheduler.transcript', 'completed', { source, completedAt: new Date().toISOString(), ...result }, Date.now() - startedAt);
    }
  }

  private discoverySkipped(reason: 'disabled' | 'overlap'): DiscoverySchedulerResult {
    const result: DiscoverySchedulerResult = { skipped: true, reason, projectsAttempted: 0, sourcesAttempted: 0, videosDiscovered: 0, newSignalsCreated: 0, topicsCreated: 0, transcriptJobsEnqueued: 0, sourceFailures: 0, failures: [] };
    this.event('warn', 'research_scheduler.discovery', 'skipped', { reason });
    return result;
  }

  private transcriptSkipped(reason: 'disabled' | 'overlap'): TranscriptSchedulerResult {
    const result: TranscriptSchedulerResult = { skipped: true, reason, projectsChecked: 0, processed: false, jobId: null, signalId: null, outcome: null, failureClassification: null, rateLimitStop: false };
    this.event('warn', 'research_scheduler.transcript', 'skipped', { reason });
    return result;
  }

  private event(level: 'info' | 'warn', event: string, status: string, result: Record<string, unknown>, durationMs?: number) {
    this.log?.event(level, event, status, { result, durationMs });
  }
}

/** Returns the next fixed 00:00/06:00/12:00/18:00 Asia/Kolkata wall-clock instant. */
export function nextDiscoveryTriggerAt(now: Date): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: RESEARCH_DISCOVERY_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const year = Number(values.year);
  const month = Number(values.month);
  const day = Number(values.day);
  const hour = Number(values.hour);
  for (const candidateHour of DISCOVERY_HOURS_IST) {
    const candidate = new Date(Date.UTC(year, month - 1, day, candidateHour) - IST_OFFSET_MS);
    if (candidate.getTime() > now.getTime()) return candidate;
  }
  return new Date(Date.UTC(year, month - 1, day + 1, DISCOVERY_HOURS_IST[0]) - IST_OFFSET_MS);
}

function isRateLimited(classification: string | null) {
  return classification?.toLowerCase().includes('rate_limited') ?? false;
}

function safeFailureCategory(error: unknown) {
  return error instanceof Error ? error.name.slice(0, 80) : 'unknown_failure';
}
