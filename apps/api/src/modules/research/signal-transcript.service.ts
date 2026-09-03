import { Injectable } from '@nestjs/common';
import { SourceEvidenceContentStatus, SourceEvidenceContentType, type SignalTranscript, type TranscriptReviewStatus } from '@content-os/contracts';
import { SourceEvidenceContentRepository, SourceTranscriptRepository } from '@content-os/storage';
import { SignalService } from './signal.service';

@Injectable()
export class SignalTranscriptService {
  constructor(private readonly signals: SignalService, private readonly evidence: SourceEvidenceContentRepository, private readonly transcripts: SourceTranscriptRepository) {}

  async get(signalId: string): Promise<SignalTranscript> {
    const signal = await this.signals.findOne(signalId);
    const canonical = await this.transcripts.findBySignalId(signalId);
    if (canonical) return { signalId, videoId: videoId(signal.externalId), sourceType: signal.sourceType, status: 'available', language: canonical.language, trackKind: 'auto_youtube', content: canonical.content, metadata: { acquiredAt: canonical.acquiredAt, acquisitionMethod: canonical.acquisitionMethod, canonicalTranscriptId: canonical.id, contentHash: canonical.contentHash, segmentCount: Number(canonical.segmentCount) } };
    const rows = (await this.evidence.findBySignalId(signalId)).filter((item) => item.contentType === SourceEvidenceContentType.TRANSCRIPT);
    const row = rows.find((item) => item.status === SourceEvidenceContentStatus.AVAILABLE) ?? rows[0];
    if (!row) return { signalId, videoId: videoId(signal.externalId), sourceType: signal.sourceType, status: 'not_checked', language: null, trackKind: null, content: null, metadata: {} };
    const selectedTrack = row.provenance.selectedTrack;
    const trackKind = selectedTrack && typeof selectedTrack === 'object' && (selectedTrack as { kind?: unknown }).kind === 'manual'
      ? 'manual_youtube'
      : row.status === SourceEvidenceContentStatus.AVAILABLE ? 'auto_youtube' : null;
    const status: TranscriptReviewStatus = row.status === SourceEvidenceContentStatus.AVAILABLE ? 'available' : row.status === SourceEvidenceContentStatus.UNAVAILABLE ? 'no_captions' : 'failed';
    return { signalId, videoId: videoId(signal.externalId), sourceType: signal.sourceType, status, language: row.language, trackKind, content: row.status === SourceEvidenceContentStatus.AVAILABLE ? row.content : null, metadata: { acquiredAt: row.acquiredAt, acquisitionMethod: row.acquisitionMethod } };
  }
}
function videoId(externalId: string) { return externalId.startsWith('youtube:') ? externalId.slice('youtube:'.length) : null; }
