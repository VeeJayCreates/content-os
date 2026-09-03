import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { OPPORTUNITY_METRICS_V2_VERSION } from '@content-os/contracts';
import type {
  Opportunity,
  OpportunityDetail,
  OpportunityMetricsV2,
  OpportunityStatus,
  TranscriptReviewStatus,
} from '@content-os/contracts';
import {
  OpportunityMetricRepository,
  OpportunityRepository,
  OpportunityWithProject,
  ProjectRepository,
  SourceEvidenceContentRepository,
  SourceTranscriptRepository,
  TranscriptAcquisitionJobRepository,
} from '@content-os/storage';

import { OpportunityDetectionService } from './opportunity-detection.service';
import { ResearchExecutionLogger } from './research-execution-logger.service';

@Injectable()
export class OpportunityService {
  constructor(
    private readonly repository: OpportunityRepository,
    private readonly metrics: OpportunityMetricRepository,
    private readonly detection: OpportunityDetectionService,
    private readonly projects: ProjectRepository,
    private readonly transcripts: SourceTranscriptRepository,
    private readonly evidence: SourceEvidenceContentRepository,
    private readonly transcriptJobs: TranscriptAcquisitionJobRepository,
    @Optional() private readonly executionLog?: ResearchExecutionLogger,
  ) {}

  async detect(projectId?: string) {
    if (projectId && !(await this.projects.findById(projectId))) {
      throw new NotFoundException('Project not found');
    }
    const startedAt = Date.now();
    const execute = async () => {
      this.executionLog?.event('info', 'trending_topics.request.started', 'started', { result: { endpoint: 'POST /opportunities/detect', projectScope: projectId ?? 'all_projects' } });
      try {
        const result = await this.detection.detect(projectId);
        this.executionLog?.event('info', 'trending_topics.request.completed', 'completed', { result, durationMs: Date.now() - startedAt });
        return result;
      } catch (error) {
        this.executionLog?.event('error', 'trending_topics.request.failed', 'failed', { result: { failureCategory: safeFailureCategory(error), endpoint: 'POST /opportunities/detect' }, durationMs: Date.now() - startedAt });
        throw error;
      }
    };
    return this.executionLog
      ? this.executionLog.withRun(projectId ?? 'all-projects', execute)
      : execute();
  }

  async findAll(projectId?: string): Promise<Opportunity[]> {
    return (await this.repository.findAll(projectId)).map((record) =>
      this.toOpportunity(record),
    );
  }

  async findOne(id: string): Promise<OpportunityDetail> {
    const record = await this.repository.findById(id);
    if (!record) {
      throw new NotFoundException('Opportunity not found');
    }

    const [signalsByOpportunity, metricsV2] = await Promise.all([
      this.repository.findSignalsByOpportunityIds([id]),
      this.metrics.findByOpportunityId(id, OPPORTUNITY_METRICS_V2_VERSION),
    ]);
    const signals = signalsByOpportunity.get(id) ?? [];
    const signalIds = signals.map((signal) => signal.id);
    const [canonicalTranscripts, evidence, jobs] = await Promise.all([
      this.transcripts.findBySignalIds(signalIds),
      this.evidence.findTranscriptBySignalIds(signalIds),
      this.transcriptJobs.findBySignalIds(signalIds),
    ]);
    const canonicalBySignal = new Map(canonicalTranscripts.map((item) => [item.signalId, item]));
    const evidenceBySignal = latestEvidenceBySignal(evidence);
    const jobsBySignal = latestJobsBySignal(jobs);

    return {
      ...this.toOpportunity(record),
      signals: signals.map((signal) => ({
        id: signal.id,
        title: signal.title,
        url: signal.url,
        summary: signal.summary,
        sourceName: signal.sourceName,
        publishedAt: signal.publishedAt,
        discoveredAt: signal.discoveredAt,
        transcript: topicSignalTranscript(canonicalBySignal.get(signal.id), evidenceBySignal.get(signal.id), jobsBySignal.get(signal.id)),
      })),
      metricsV2: metricsV2 ? this.toMetricsV2(metricsV2) : null,
    };
  }

  async updateStatus(
    id: string,
    status: OpportunityStatus,
  ): Promise<Opportunity> {
    if (!(await this.repository.findById(id))) {
      throw new NotFoundException('Opportunity not found');
    }

    try {
      const updated = await this.repository.update(id, { status });
      if (!updated) {
        throw new InternalServerErrorException(
          'Unable to update opportunity status',
        );
      }
      return this.toOpportunity(updated);
    } catch (error) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Unable to update opportunity status',
      );
    }
  }

  private toOpportunity(record: OpportunityWithProject): Opportunity {
    return {
      id: record.id,
      projectId: record.projectId,
      project: { id: record.projectId, name: record.projectName },
      title: record.title,
      representativeUrl: record.representativeUrl,
      summary: record.summary,
      status: record.status as OpportunityStatus,
      score: record.score,
      signalCount: record.signalCount,
      sourceCount: record.sourceCount,
      firstSeenAt: record.firstSeenAt,
      lastSeenAt: record.lastSeenAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  private toMetricsV2(
    metric: Awaited<
      ReturnType<OpportunityMetricRepository['findByOpportunityId']>
    >,
  ): OpportunityMetricsV2 {
    if (!metric) {
      throw new Error('Expected an Opportunity Metrics V2 record');
    }

    return {
      ...metric,
      scoreVersion: OPPORTUNITY_METRICS_V2_VERSION,
    };
  }
}

function latestEvidenceBySignal<T extends { signalId: string; status: string; acquiredAt: string; language: string | null }>(items: T[]): Map<string, T> {
  const result = new Map<string, T>();
  for (const item of items) {
    const current = result.get(item.signalId);
    if (!current || item.status === 'available' || current.status !== 'available') result.set(item.signalId, item);
  }
  return result;
}

function latestJobsBySignal<T extends { signalId: string; status: string; createdAt: string }>(items: T[]): Map<string, T> {
  const active = new Set(['pending', 'processing', 'retryable_failure']);
  const result = new Map<string, T>();
  for (const item of items) {
    const current = result.get(item.signalId);
    if (!current || (active.has(item.status) && !active.has(current.status)) || (active.has(item.status) === active.has(current.status) && item.createdAt > current.createdAt)) result.set(item.signalId, item);
  }
  return result;
}

function topicSignalTranscript(
  canonical: { id: string; language: string | null } | undefined,
  evidence: { status: string; language: string | null } | undefined,
  job: { status: string } | undefined,
): { status: TranscriptReviewStatus; hasCanonicalTranscript: boolean; language: string | null } {
  if (canonical) return { status: 'available' as const, hasCanonicalTranscript: true, language: canonical.language };
  const jobStatus = job?.status === 'pending' ? 'pending' : job?.status === 'processing' ? 'processing' : job?.status === 'retryable_failure' ? 'retry_scheduled' : job?.status === 'permanent_failure' ? 'permanent_failure' : job?.status === 'no_captions' ? 'no_captions' : undefined;
  if (jobStatus) return { status: jobStatus, hasCanonicalTranscript: false, language: evidence?.language ?? null };
  const evidenceStatus = evidence?.status === 'available' ? 'available' : evidence?.status === 'unavailable' ? 'no_captions' : evidence ? 'failed' : 'not_checked';
  return { status: evidenceStatus, hasCanonicalTranscript: false, language: evidence?.language ?? null };
}

function safeFailureCategory(error: unknown): string {
  return error && typeof error === 'object' && 'name' in error && typeof error.name === 'string'
    ? error.name.slice(0, 80)
    : 'unknown_error';
}
