jest.mock('@content-os/contracts', () => ({
  SourceEvidenceContentStatus: { AVAILABLE: 'available', UNAVAILABLE: 'unavailable', FAILED: 'failed' },
  SourceEvidenceContentType: { TRANSCRIPT: 'transcript' },
}));
jest.mock('@content-os/storage', () => ({ SourceEvidenceContentRepository: class SourceEvidenceContentRepository {} }));
import { SignalTranscriptService } from './signal-transcript.service';

const signal = { id: '11111111-1111-4111-8111-111111111111', externalId: 'youtube:video-id', sourceType: 'youtube' };
describe('SignalTranscriptService', () => {
  it('returns persisted full text only for an explicit lazy transcript read', async () => {
    const signals = { findOne: jest.fn().mockResolvedValue(signal) };
    const evidence = { findBySignalId: jest.fn().mockResolvedValue([{ contentType: 'transcript', status: 'available', language: 'en-orig', content: 'A real stored caption excerpt.', acquiredAt: '2026-01-01T00:00:00.000Z', acquisitionMethod: 'youtube_public_captions', provenance: { selectedTrack: { kind: 'automatic' } } }]) };
    const result = await new SignalTranscriptService(signals as never, evidence as never, { findBySignalId: jest.fn().mockResolvedValue(undefined) } as never).get(signal.id);
    expect(result).toMatchObject({ signalId: signal.id, videoId: 'video-id', status: 'available', language: 'en-orig', trackKind: 'auto_youtube', content: 'A real stored caption excerpt.' });
  });
  it('does not fabricate text when no transcript has been checked', async () => {
    const result = await new SignalTranscriptService({ findOne: jest.fn().mockResolvedValue(signal) } as never, { findBySignalId: jest.fn().mockResolvedValue([]) } as never, { findBySignalId: jest.fn().mockResolvedValue(undefined) } as never).get(signal.id);
    expect(result).toMatchObject({ status: 'not_checked', content: null, trackKind: null });
  });
});
