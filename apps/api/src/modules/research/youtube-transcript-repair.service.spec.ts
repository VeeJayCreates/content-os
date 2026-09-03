jest.mock('@content-os/contracts', () => ({ ResearchSourceType: { YOUTUBE: 'youtube' }, SourceEvidenceContentStatus: { AVAILABLE: 'available', UNAVAILABLE: 'unavailable', FAILED: 'failed' }, SourceEvidenceContentType: { TRANSCRIPT: 'transcript' } }));
jest.mock('@content-os/storage', () => ({ SignalRepository: class SignalRepository {}, SourceEvidenceContentRepository: class SourceEvidenceContentRepository {} }));
import { YouTubeTranscriptRepairService } from './youtube-transcript-repair.service';
import { createHash } from 'node:crypto';
const projectId = '11111111-1111-4111-8111-111111111111';
const signal = { id: '22222222-2222-4222-8222-222222222222', projectId, researchSourceId: 'source', sourceType: 'youtube', externalId: 'youtube:video', url: 'https://www.youtube.com/watch?v=video', publishedAt: null };
describe('YouTubeTranscriptRepairService', () => {
  it('only repairs supplied unresolved YouTube signals and persists a recovered transcript once', async () => {
    const signals = { findById: jest.fn().mockResolvedValue(signal) }; const evidence = { findAvailableBySignalIds: jest.fn().mockResolvedValue(new Map()), createIfAbsent: jest.fn() };
    const content = 'A sufficiently long recovered caption segment for source evidence.';
    const acquirer = { acquireTranscript: jest.fn().mockResolvedValue({ language: 'hi', transcript: [{ content, language: 'hi', locator: { chunkIndex: 0, startMs: 0, endMs: 2000 } }], segments: [{ text: content, startMs: 0, endMs: 2000 }], transcriptDiagnostic: { code: 'transcript_stored', retryable: false, selectedTrack: { language: 'hi', kind: 'automatic', format: 'vtt' }, availableTracks: [] } }) };
    const transcripts = { findBySignalId: jest.fn().mockResolvedValue(undefined), create: jest.fn().mockResolvedValue({ id: 'canonical', content, contentHash: createHash('sha256').update(content).digest('hex') }) };
    const service = new YouTubeTranscriptRepairService(signals as never, evidence as never, transcripts as never, acquirer as never);
    await expect(service.repair(projectId, [signal.id])).resolves.toMatchObject({ transcriptsRecovered: 1, retryableFailures: 0 });
    expect(signals.findById).toHaveBeenCalledTimes(1); expect(evidence.createIfAbsent).not.toHaveBeenCalled();
  });
  it('skips an already persisted transcript without invoking yt-dlp', async () => {
    const signals = { findById: jest.fn() }; const evidence = { findAvailableBySignalIds: jest.fn().mockResolvedValue(new Map([[signal.id, [{ contentType: 'transcript' }]]])), createIfAbsent: jest.fn() }; const acquirer = { acquireTranscript: jest.fn() };
    const service = new YouTubeTranscriptRepairService(signals as never, evidence as never, { findBySignalId: jest.fn().mockResolvedValue({ id: 'canonical' }) } as never, acquirer as never);
    await expect(service.repair(projectId, [signal.id])).resolves.toMatchObject({ transcriptsAlreadyStored: 1 }); expect(acquirer.acquireTranscript).not.toHaveBeenCalled();
  });

  it('returns a safe per-video diagnostic when automatic captions cannot be acquired', async () => {
    const signals = { findById: jest.fn().mockResolvedValue(signal) }; const evidence = { findAvailableBySignalIds: jest.fn().mockResolvedValue(new Map()), createIfAbsent: jest.fn() };
    const acquirer = { acquireTranscript: jest.fn().mockResolvedValue({ language: 'en', transcript: [], transcriptDiagnostic: { code: 'network_failed', retryable: true, reason: 'network_access_denied_by_process_environment', selectedTrack: { language: 'en-orig', kind: 'automatic', format: 'vtt' }, availableTracks: [] } }) };
    const service = new YouTubeTranscriptRepairService(signals as never, evidence as never, { findBySignalId: jest.fn().mockResolvedValue(undefined) } as never, acquirer as never);
    await expect(service.repair(projectId, [signal.id])).resolves.toMatchObject({ retryableFailures: 1, failures: [{ signalId: signal.id, videoId: 'video', classification: 'network_failed', retryable: true, reason: 'network_access_denied_by_process_environment' }] });
  });

  it('never persists an incomplete provider result as available evidence', async () => {
    const signals = { findById: jest.fn().mockResolvedValue(signal) }; const evidence = { findAvailableBySignalIds: jest.fn().mockResolvedValue(new Map()), createIfAbsent: jest.fn() };
    const acquirer = { acquireTranscript: jest.fn().mockResolvedValue({ language: 'en-orig', transcript: [], transcriptDiagnostic: { code: 'transcript_incomplete', retryable: true, reason: 'transcript_starts_too_late', selectedTrack: { language: 'en-orig', kind: 'automatic', format: 'vtt' }, availableTracks: [] } }) };
    const service = new YouTubeTranscriptRepairService(signals as never, evidence as never, { findBySignalId: jest.fn().mockResolvedValue(undefined) } as never, acquirer as never);
    await expect(service.repairOne(projectId, signal.id)).resolves.toEqual({ kind: 'retryable_failure', classification: 'transcript_incomplete' });
    expect(evidence.createIfAbsent).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed', content: null }));
  });
});
