jest.mock('@content-os/contracts', () => ({ SourceEvidenceContentStatus: { AVAILABLE: 'available', UNAVAILABLE: 'unavailable' } }));
jest.mock('@content-os/storage', () => ({ SignalRepository: class {}, SourceEvidenceContentRepository: class {}, OpportunityRepository: class {}, TranscriptAcquisitionJobRepository: class {} }));

import { SignalService } from './signal.service';

describe('SignalService transcript projection', () => {
  const signals = { findAll: jest.fn() };
  const evidence = { findTranscriptBySignalIds: jest.fn() };
  const opportunities = { findBySignalIds: jest.fn() };
  const jobs = { findBySignalIds: jest.fn() };
  const service = new SignalService(signals as never, evidence as never, opportunities as never, jobs as never);

  beforeEach(() => {
    jest.resetAllMocks();
    signals.findAll.mockResolvedValue([{ id: 'signal-1', projectId: 'project-1', researchSourceId: 'source-1', sourceType: 'youtube', externalId: 'youtube:video-1', title: 'Source video title', url: 'https://youtube.test', summary: null, publishedAt: null, discoveredAt: '2026-09-01T00:00:00.000Z', createdAt: '2026-09-01T00:00:00.000Z', projectName: 'Project', sourceName: 'Channel' }]);
    evidence.findTranscriptBySignalIds.mockResolvedValue([{ signalId: 'signal-1', status: 'unavailable', language: 'hi', provenance: {} }]);
    opportunities.findBySignalIds.mockResolvedValue(new Map([['signal-1', { title: 'Research topic subject' }]]));
  });

  it('shows a newer pending revalidation job instead of a legacy no-caption state while keeping source title and research topic distinct', async () => {
    jobs.findBySignalIds.mockResolvedValue([{ id: 'old-job', signalId: 'signal-1', status: 'no_captions', createdAt: '2026-08-31T00:00:00.000Z' }, { id: 'new-job', signalId: 'signal-1', status: 'pending', createdAt: '2026-09-01T00:00:00.000Z' }]);
    const [signal] = await service.findAll({ projectId: 'project-1' });
    expect(signal).toMatchObject({ title: 'Source video title', researchTopic: 'Research topic subject', transcript: { status: 'pending', language: 'hi' } });
  });
});
