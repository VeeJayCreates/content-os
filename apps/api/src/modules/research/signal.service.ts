import { Injectable, NotFoundException } from '@nestjs/common';
import { SourceEvidenceContentStatus, type ResearchSourceType, type Signal, type SignalTranscriptSummary } from '@content-os/contracts';
import { OpportunityRepository, SignalRepository, SignalWithContext, SourceEvidenceContentRepository, TranscriptAcquisitionJobRepository } from '@content-os/storage';

import { ListSignalsDto } from './dto/list-signals.dto';

@Injectable()
export class SignalService {
  constructor(private readonly signalRepository: SignalRepository, private readonly evidence: SourceEvidenceContentRepository, private readonly opportunities: OpportunityRepository, private readonly transcriptJobs: TranscriptAcquisitionJobRepository) {}

  async findAll(query: ListSignalsDto): Promise<Signal[]> {
    const records = await this.signalRepository.findAll(
      query.projectId,
      query.researchSourceId,
    );

    const transcripts = await this.evidence.findTranscriptBySignalIds(records.map((record) => record.id));
    const summaries = new Map<string, SignalTranscriptSummary>();
    for (const item of transcripts) {
      const existing = summaries.get(item.signalId);
      // A later failed retry must never hide an already persisted, reviewable
      // transcript. AVAILABLE remains authoritative for list presentation.
      if (!existing || item.status === SourceEvidenceContentStatus.AVAILABLE) summaries.set(item.signalId, transcriptSummary(item));
    }
    const [topics, jobs] = await Promise.all([this.opportunities.findBySignalIds(records.map((record) => record.id)), this.transcriptJobs.findBySignalIds(records.map((record) => record.id))]);
    const jobsBySignal = latestJobsBySignal(jobs);
    return records.map((record) => this.toSignal(record, summaries.get(record.id), topics.get(record.id)?.title ?? null, jobsBySignal.get(record.id)));
  }

  async findOne(id: string): Promise<Signal> {
    const record = await this.signalRepository.findById(id);

    if (!record) {
      throw new NotFoundException('Signal not found');
    }

    const transcripts = await this.evidence.findTranscriptBySignalIds([record.id]);
    const [topics, jobs] = await Promise.all([this.opportunities.findBySignalIds([record.id]), this.transcriptJobs.findBySignalIds([record.id])]);
    return this.toSignal(record, transcripts.length ? transcriptSummary(transcripts[0]) : undefined, topics.get(record.id)?.title ?? null, latestJobsBySignal(jobs).get(record.id));
  }

  private toSignal(record: SignalWithContext, transcript: SignalTranscriptSummary = { status: 'not_checked', language: null, trackKind: null }, researchTopic: string | null = null, job?: { status: string }): Signal {
    return {
      id: record.id,
      projectId: record.projectId,
      researchSourceId: record.researchSourceId,
      sourceType: record.sourceType as ResearchSourceType,
      externalId: record.externalId,
      title: record.title,
      url: record.url,
      summary: record.summary,
      publishedAt: record.publishedAt,
      discoveredAt: record.discoveredAt,
      createdAt: record.createdAt,
      project: {
        id: record.projectId,
        name: record.projectName,
      },
      sourceName: record.sourceName,
      researchTopic,
      transcript: transcript.status === 'available' ? transcript : job ? jobSummary(job.status, transcript) : transcript,
    };
  }
}

function latestJobsBySignal<T extends { signalId: string; status: string; createdAt?: string }>(jobs: T[]): Map<string, T> {
  const active = new Set(['pending', 'processing', 'retryable_failure']);
  const result = new Map<string, T>();
  for (const job of jobs) {
    const existing = result.get(job.signalId);
    if (!existing || (active.has(job.status) && !active.has(existing.status)) || (active.has(job.status) === active.has(existing.status) && (job.createdAt ?? '') > (existing.createdAt ?? ''))) result.set(job.signalId, job);
  }
  return result;
}

function jobSummary(status: string, fallback: SignalTranscriptSummary): SignalTranscriptSummary {
  const mapped = status === 'pending' ? 'pending' : status === 'processing' ? 'processing' : status === 'retryable_failure' ? 'retry_scheduled' : status === 'permanent_failure' ? 'permanent_failure' : status === 'no_captions' ? 'no_captions' : status === 'available' ? 'available' : fallback.status;
  return { ...fallback, status: mapped };
}

function transcriptSummary(item: { status: string; language: string | null; provenance: Record<string, unknown> }): SignalTranscriptSummary {
  const selectedTrack = item.provenance.selectedTrack;
  const trackKind = selectedTrack && typeof selectedTrack === 'object' && (selectedTrack as { kind?: unknown }).kind === 'manual'
    ? 'manual_youtube'
    : item.status === SourceEvidenceContentStatus.AVAILABLE ? 'auto_youtube' : null;
  return { status: item.status === SourceEvidenceContentStatus.AVAILABLE ? 'available' : item.status === SourceEvidenceContentStatus.UNAVAILABLE ? 'no_captions' : 'failed', language: item.language, trackKind };
}
