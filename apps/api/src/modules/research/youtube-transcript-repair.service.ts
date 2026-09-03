import { createHash } from 'node:crypto';
import { Injectable, Optional } from '@nestjs/common';
import { ResearchSourceType, SourceEvidenceContentStatus, SourceEvidenceContentType } from '@content-os/contracts';
import { SignalRepository, SourceEvidenceContentRepository, SourceTranscriptRepository } from '@content-os/storage';
import { ResearchExecutionLogger } from './research-execution-logger.service';
import { YouTubeSourceEvidenceAcquirer } from './youtube-source-evidence.acquirer';
import { YOUTUBE_TRANSCRIPT_COMPLETENESS_VERSION } from './youtube-transcript-completeness';

export type TranscriptRepairOneResult = { kind: 'available' | 'no_captions' | 'retryable_failure' | 'permanent_failure'; classification: string };

const CANONICAL_TRANSCRIPT_VERSION = 'youtube-canonical-transcript-v1';

@Injectable()
export class YouTubeTranscriptRepairService {
  constructor(private readonly signals: SignalRepository, private readonly evidence: SourceEvidenceContentRepository, private readonly transcripts: SourceTranscriptRepository, private readonly acquirer: YouTubeSourceEvidenceAcquirer, @Optional() private readonly log?: ResearchExecutionLogger) {}
  async repair(projectId: string, signalIds: string[]) {
    const ids = [...new Set(signalIds)]; const result = { videosRequested: ids.length, transcriptsAlreadyStored: 0, transcriptsRecovered: 0, genuinelyNoCaptions: 0, retryableFailures: 0, permanentFailures: 0, failures: [] as Array<{ signalId: string; videoId: string | null; classification: string; retryable: boolean; reason: string }> };
    return this.log?.withRun(projectId, async () => this.repairAll(projectId, ids, result)) ?? this.repairAll(projectId, ids, result);
  }
  async repairOne(projectId: string, signalId: string): Promise<TranscriptRepairOneResult> {
    if (await this.transcripts.findBySignalId(signalId)) return { kind: 'available', classification: 'already_stored' };
    const signal = await this.signals.findById(signalId);
    if (!signal || signal.projectId !== projectId || signal.sourceType !== ResearchSourceType.YOUTUBE || !signal.externalId.startsWith('youtube:')) return { kind: 'permanent_failure', classification: 'ineligible_youtube_signal' };
    try {
      const acquired = await this.acquirer.acquireTranscript(signal.url);
      const diagnostic = acquired.transcriptDiagnostic;
      if (acquired.segments?.length) {
        await this.persistCanonical(signal, acquired.segments, acquired.language, diagnostic, acquired.transcriptCompleteness);
        return { kind: 'available', classification: diagnostic.code };
      }
      const status = diagnostic.code === 'no_captions_available' ? SourceEvidenceContentStatus.UNAVAILABLE : SourceEvidenceContentStatus.FAILED;
      await this.persist(signal, null, acquired.language, null, status, diagnostic, acquired.transcriptCompleteness);
      return { kind: diagnostic.code === 'no_captions_available' ? 'no_captions' : diagnostic.retryable ? 'retryable_failure' : 'permanent_failure', classification: diagnostic.code };
    } catch {
      return { kind: 'retryable_failure', classification: 'repair_processing_failed' };
    }
  }
  private async repairAll(projectId: string, ids: string[], result: { videosRequested: number; transcriptsAlreadyStored: number; transcriptsRecovered: number; genuinelyNoCaptions: number; retryableFailures: number; permanentFailures: number; failures: Array<{ signalId: string; videoId: string | null; classification: string; retryable: boolean; reason: string }> }) {
    for (const signalId of ids) try {
      if (await this.transcripts.findBySignalId(signalId)) { result.transcriptsAlreadyStored++; continue; }
      const signal = await this.signals.findById(signalId);
      if (!signal || signal.projectId !== projectId || signal.sourceType !== ResearchSourceType.YOUTUBE || !signal.externalId.startsWith('youtube:')) throw new Error('ineligible_youtube_signal');
      const acquired = await this.acquirer.acquireTranscript(signal.url); const diagnostic = acquired.transcriptDiagnostic;
      if (acquired.segments?.length) { await this.persistCanonical(signal, acquired.segments, acquired.language, diagnostic, acquired.transcriptCompleteness); result.transcriptsRecovered++; }
      else {
        const status = diagnostic.code === 'no_captions_available' ? SourceEvidenceContentStatus.UNAVAILABLE : SourceEvidenceContentStatus.FAILED;
        await this.persist(signal, null, acquired.language, null, status, diagnostic, acquired.transcriptCompleteness);
        if (diagnostic.code === 'no_captions_available') result.genuinelyNoCaptions++; else if (diagnostic.retryable) result.retryableFailures++; else result.permanentFailures++;
        if (diagnostic.code !== 'no_captions_available') result.failures.push({ signalId, videoId: signal.externalId.slice('youtube:'.length), classification: diagnostic.code, retryable: diagnostic.retryable, reason: diagnostic.reason ?? 'youtube_caption_acquisition_failed' });
      }
      this.log?.withContext({ projectId, signalId, sourceId: signal.researchSourceId }, () => this.log?.event('info', 'youtube_transcript_repair.completed', diagnostic.code, { result: { retryable: diagnostic.retryable, selectedTrack: diagnostic.selectedTrack, availableTracks: diagnostic.availableTracks, poProvider: diagnostic.provider } }));
    } catch (error) { result.failures.push({ signalId, videoId: null, classification: 'repair_processing_failed', retryable: true, reason: error instanceof Error && error.message === 'ineligible_youtube_signal' ? 'ineligible_youtube_signal' : 'repair_processing_failed' }); result.retryableFailures++; }
    return result;
  }
  private async persistCanonical(signal: Awaited<ReturnType<SignalRepository['findById']>> & {}, segments: Array<{ text: string; startMs: number; endMs: number }>, language: string | null, diagnostic: { code: string; retryable: boolean; selectedTrack: unknown; availableTracks: unknown[]; provider: unknown }, transcriptCompleteness: unknown) {
    const content = segments.map((segment) => segment.text.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    const contentHash = createHash('sha256').update(content).digest('hex');
    if (!content) throw new Error('canonical_transcript_empty');
    const canonical = await this.transcripts.create({
      signalId: signal.id, researchSourceId: signal.researchSourceId, sourceUrl: signal.url, content, segments, language,
      durationMs: transcriptDuration(transcriptCompleteness), firstTimestampMs: String(segments[0]!.startMs), lastTimestampMs: String(segments.at(-1)!.endMs), segmentCount: String(segments.length), contentHash,
      provider: providerName(diagnostic), acquisitionMethod: 'youtube_public_captions', status: 'available', version: CANONICAL_TRANSCRIPT_VERSION, acquiredAt: new Date().toISOString(),
    });
    if (canonical.contentHash !== contentHash || canonical.content.length !== content.length) throw new Error('canonical_transcript_readback_mismatch');
    this.log?.withContext({ signalId: signal.id, sourceId: signal.researchSourceId }, () => this.log?.event('info', 'youtube_transcript.canonical_verified', 'available', { result: { canonicalTranscriptId: canonical.id, segmentCount: segments.length, characterCount: content.length, contentHash, dbCharacterCount: canonical.content.length, dbContentHash: canonical.contentHash } }));
    this.log?.withContext({ signalId: signal.id, sourceId: signal.researchSourceId }, () => this.log?.event('info', 'youtube_transcript.canonical_available', 'available', { result: { canonicalTranscriptId: canonical.id, persistedChunkCount: 0, queueFinalStatus: 'available' } }));
  }
  private async persist(signal: Awaited<ReturnType<SignalRepository['findById']>> & {}, content: string | null, language: string | null, locator: Record<string, unknown> | null, status: SourceEvidenceContentStatus, diagnostic: { code: string; retryable: boolean; selectedTrack: unknown; availableTracks: unknown[]; provider: unknown }, transcriptCompleteness: unknown = null) {
    await this.evidence.createIfAbsent({ signalId: signal.id, researchSourceId: signal.researchSourceId, sourceUrl: signal.url, contentType: SourceEvidenceContentType.TRANSCRIPT, content, language, locator, sourcePublishedAt: signal.publishedAt, acquiredAt: new Date().toISOString(), contentHash: createHash('sha256').update(`${content ?? diagnostic.code}:${JSON.stringify(locator)}:youtube-transcript-reliability-v1`).digest('hex'), acquisitionMethod: 'youtube_public_captions', provenance: { transcriptOutcome: diagnostic.code, retryable: diagnostic.retryable, selectedTrack: diagnostic.selectedTrack, availableTracks: diagnostic.availableTracks, poProvider: diagnostic.provider, validationVersion: YOUTUBE_TRANSCRIPT_COMPLETENESS_VERSION, transcriptCompleteness }, status, version: 'youtube-transcript-reliability-v1' });
  }
}
function transcriptDuration(value: unknown) { const source = value && typeof value === 'object' ? value as { videoDurationMs?: unknown } : {}; return Number.isFinite(source.videoDurationMs) ? String(source.videoDurationMs) : null; }
function providerName(diagnostic: { provider: unknown }) { const source = diagnostic.provider && typeof diagnostic.provider === 'object' ? diagnostic.provider as { mode?: unknown } : {}; return typeof source.mode === 'string' ? source.mode : 'youtube-public-captions'; }
