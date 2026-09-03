import { Injectable, Optional } from '@nestjs/common';
import { ResearchSourceRole, ResearchSourceType } from '@content-os/contracts';
import { ResearchSourceRepository, SignalRepository } from '@content-os/storage';

import { ResearchExecutionLogger } from './research-execution-logger.service';
import { YouTubeChannelResolver } from './youtube-channel-resolver';
import { YouTubeIngestionAdapter } from './youtube-ingestion.adapter';
import { ResearchIngestionOrchestrationService } from './research-ingestion-orchestration.service';

export const DEFAULT_COMPETITOR_YOUTUBE_RECENT_UPLOAD_LIMIT = 10;
const MAX_RECENT_UPLOAD_LIMIT = 50;

export type CompetitorYouTubeIngestionFailure = {
  sourceId: string;
  sourceName: string;
  category: string;
};

export type CompetitorYouTubeIngestionResult = {
  sourcesChecked: number;
  sourcesSucceeded: number;
  sourcesFailed: number;
  videosDiscovered: number;
  newVideosIngested: number;
  existingVideosSkipped: number;
  transcriptsStored: number;
  transcriptsUnavailable: number;
  topicsCreated: number;
  transcriptJobsCreated: number;
  transcriptJobsSkipped: number;
  failures: CompetitorYouTubeIngestionFailure[];
};

/**
 * Bounded, incremental ingestion for project-level competitor YouTube sources.
 * It intentionally has no dependency on clustering, opportunity detection, or AI.
 */
@Injectable()
export class CompetitorYouTubeIngestionService {
  constructor(
    private readonly sources: ResearchSourceRepository,
    private readonly signals: SignalRepository,
    private readonly channelResolver: YouTubeChannelResolver,
    private readonly youtube: YouTubeIngestionAdapter,
    private readonly orchestration: ResearchIngestionOrchestrationService,
    @Optional() private readonly executionLog?: ResearchExecutionLogger,
  ) {}

  async ingest(projectId: string, recentUploadLimit = configuredRecentUploadLimit()) {
    const limit = boundedRecentUploadLimit(recentUploadLimit);
    return this.executionLog?.withRun(projectId, async () =>
      this.ingestProject(projectId, limit),
    ) ?? this.ingestProject(projectId, limit);
  }

  private async ingestProject(projectId: string, recentUploadLimit: number) {
    const started = Date.now();
    const result: CompetitorYouTubeIngestionResult = {
      sourcesChecked: 0,
      sourcesSucceeded: 0,
      sourcesFailed: 0,
      videosDiscovered: 0,
      newVideosIngested: 0,
      existingVideosSkipped: 0,
      transcriptsStored: 0,
      transcriptsUnavailable: 0,
      topicsCreated: 0,
      transcriptJobsCreated: 0,
      transcriptJobsSkipped: 0,
      failures: [],
    };
    const allSources = await this.sources.findAll(projectId);
    const newSignalIds: string[] = [];
    const seenSourceUrls = new Set<string>();

    this.log(projectId, 'info', 'competitor_youtube_ingestion.started', 'started', {
      sourceCount: allSources.length,
      recentUploadLimit,
    });

    for (const source of allSources) {
      const selection = this.selectSource(source, seenSourceUrls);
      if (!selection.selected) {
        this.log(projectId, 'debug', 'competitor_youtube_ingestion.source.skipped', 'skipped', {
          sourceId: source.id,
          sourceName: source.name,
          reasonCode: selection.reason,
        });
        continue;
      }

      result.sourcesChecked += 1;
      const sourceStarted = Date.now();
      this.log(projectId, 'info', 'competitor_youtube_ingestion.source.fetch', 'started', {
        sourceId: source.id,
        sourceName: source.name,
        recentUploadLimit,
      });

      try {
        const videos = await this.youtube.fetchItems(source.url, recentUploadLimit);
        result.sourcesSucceeded += 1;
        result.videosDiscovered += videos.length;
        this.log(projectId, 'info', 'competitor_youtube_ingestion.source.fetch', 'completed', {
          sourceId: source.id,
          sourceName: source.name,
          videosDiscovered: videos.length,
        }, Date.now() - sourceStarted);

        for (const video of videos) {
          const videoId = video.externalId?.trim().replace(/^youtube:/i, '');
          if (!videoId) continue;
          const externalId = `youtube:${videoId}`;
          const existing = await this.signals.findByResearchSourceAndExternalIds(
            source.id,
            [externalId, videoId],
          );
          this.log(projectId, 'info', 'competitor_youtube_ingestion.video.decision', existing ? 'existing_skipped' : 'new', {
            sourceId: source.id,
            videoId,
            title: video.title,
            publishedAt: video.publishedAt ?? null,
            canonicalUrl: video.url,
          });

          if (existing) {
            result.existingVideosSkipped += 1;
            continue;
          }

          const outcome = await this.signals.create({
            projectId,
            researchSourceId: source.id,
            sourceType: ResearchSourceType.YOUTUBE,
            externalId,
            title: video.title,
            url: video.url,
            summary: video.summary ?? null,
            publishedAt: video.publishedAt ?? null,
            discoveredAt: new Date().toISOString(),
          });
          const signal = await this.signals.findByResearchSourceAndExternalIds(source.id, [externalId]);
          if (!signal) throw new Error('signal_persistence_lookup_failed');

          if (outcome === 'duplicate') {
            result.existingVideosSkipped += 1;
            continue;
          }
          result.newVideosIngested += 1;
          this.log(projectId, 'info', 'competitor_youtube_ingestion.video.persisted', 'created', {
            sourceId: source.id,
            signalId: signal.id,
            videoId,
          });
          newSignalIds.push(signal.id);
        }
      } catch (error) {
        result.sourcesFailed += 1;
        result.failures.push({ sourceId: source.id, sourceName: source.name, category: safeFailureCategory(error) });
        this.log(projectId, 'warn', 'competitor_youtube_ingestion.source.fetch', 'failed', {
          sourceId: source.id,
          sourceName: source.name,
          failureCategory: safeFailureCategory(error),
        }, Date.now() - sourceStarted);
      }
    }

    if (newSignalIds.length) {
      const orchestration = await this.orchestration.processNewSignals(projectId, newSignalIds);
      result.topicsCreated = orchestration.topics.topicsCreated;
      result.transcriptJobsCreated = orchestration.transcriptJobsCreated;
      result.transcriptJobsSkipped = orchestration.transcriptJobsSkipped;
      this.log(projectId, 'info', 'competitor_youtube_ingestion.orchestration', 'completed', {
        newSignalCount: newSignalIds.length,
        topicsCreated: orchestration.topics.topicsCreated,
        transcriptJobsCreated: orchestration.transcriptJobsCreated,
      });
    }
    this.log(projectId, 'info', 'competitor_youtube_ingestion.completed', 'completed', result, Date.now() - started);
    return result;
  }

  private selectSource(source: { id: string; sourceType: string; role: string; enabled: boolean; url: string }, seenSourceUrls: Set<string>) {
    if (source.sourceType !== ResearchSourceType.YOUTUBE) return { selected: false, reason: 'non_youtube_source' };
    if (!source.enabled) return { selected: false, reason: 'disabled_youtube_source' };
    if (![ResearchSourceRole.DISCOVERY, ResearchSourceRole.BOTH].includes(source.role as ResearchSourceRole)) return { selected: false, reason: 'verification_only_youtube_source' };
    try {
      const normalized = this.channelResolver.validate(source.url).toString();
      if (seenSourceUrls.has(normalized)) return { selected: false, reason: 'duplicate_youtube_source' };
      seenSourceUrls.add(normalized);
      return { selected: true, reason: null };
    } catch {
      return { selected: false, reason: 'invalid_youtube_source' };
    }
  }


  private log(projectId: string, level: 'debug' | 'info' | 'warn', event: string, status: string, result: Record<string, unknown>, durationMs?: number) {
    this.executionLog?.withContext({ projectId }, () => this.executionLog?.event(level, event, status, { result, durationMs }));
  }
}

function configuredRecentUploadLimit() {
  const configured = Number(process.env.COMPETITOR_YOUTUBE_RECENT_UPLOAD_LIMIT ?? DEFAULT_COMPETITOR_YOUTUBE_RECENT_UPLOAD_LIMIT);
  return boundedRecentUploadLimit(configured);
}

function boundedRecentUploadLimit(value: number) {
  return Number.isInteger(value) && value > 0
    ? Math.min(value, MAX_RECENT_UPLOAD_LIMIT)
    : DEFAULT_COMPETITOR_YOUTUBE_RECENT_UPLOAD_LIMIT;
}

function safeFailureCategory(error: unknown) { return error instanceof Error ? error.name.slice(0, 80) : 'unknown_failure'; }
