jest.mock('@content-os/contracts', () => ({
  ResearchSourceRole: { DISCOVERY: 'discovery', BOTH: 'both', VERIFICATION: 'verification' },
  ResearchSourceType: { YOUTUBE: 'youtube', WEBSITE: 'website' },
}));

jest.mock('@content-os/storage', () => ({
  ResearchSourceRepository: class ResearchSourceRepository {},
  SignalRepository: class SignalRepository {},
}));

import {
  CompetitorYouTubeIngestionService,
  DEFAULT_COMPETITOR_YOUTUBE_RECENT_UPLOAD_LIMIT,
} from './competitor-youtube-ingestion.service';

const ResearchSourceRole = { DISCOVERY: 'discovery', BOTH: 'both', VERIFICATION: 'verification' } as const;
const ResearchSourceType = { YOUTUBE: 'youtube', WEBSITE: 'website' } as const;

const projectId = '11111111-1111-4111-8111-111111111111';
const source = (overrides: Record<string, unknown> = {}) => ({
  id: 'source-1', projectId, name: 'Competitor', sourceType: ResearchSourceType.YOUTUBE,
  role: ResearchSourceRole.DISCOVERY, url: 'https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv', enabled: true,
  ...overrides,
});
const video = { externalId: 'video-1', title: 'A new video', url: 'https://www.youtube.com/watch?v=video-1', summary: 'summary', publishedAt: '2026-08-31T00:00:00.000Z' };

describe('CompetitorYouTubeIngestionService', () => {
  const sources = { findAll: jest.fn() };
  const signals = { findByResearchSourceAndExternalIds: jest.fn(), create: jest.fn() };
  const resolver = { validate: jest.fn() };
  const youtube = { fetchItems: jest.fn() };
  const orchestration = { processNewSignals: jest.fn() };
  const executionLog = { withRun: jest.fn(async (_id, callback) => callback('run-1')), withContext: jest.fn((_context, callback) => callback()), event: jest.fn() };
  const service = new CompetitorYouTubeIngestionService(sources as never, signals as never, resolver as never, youtube as never, orchestration as never, executionLog as never);

  beforeEach(() => {
    jest.resetAllMocks();
    resolver.validate.mockImplementation((url: string) => new URL(url));
    sources.findAll.mockResolvedValue([source()]);
    youtube.fetchItems.mockResolvedValue([video]);
    signals.findByResearchSourceAndExternalIds.mockResolvedValueOnce(undefined).mockResolvedValueOnce({ id: 'signal-1' });
    signals.create.mockResolvedValue('created');
    orchestration.processNewSignals.mockResolvedValue({ topics: { topicsCreated: 1 }, transcriptJobsCreated: 1, transcriptJobsSkipped: 0 });
  });

  it('selects only enabled discovery/both YouTube sources and isolates malformed or duplicate sources', async () => {
    sources.findAll.mockResolvedValue([
      source(),
      source({ id: 'source-duplicate', url: source().url }),
      source({ id: 'source-disabled', enabled: false }),
      source({ id: 'source-verification', role: ResearchSourceRole.VERIFICATION }),
      source({ id: 'source-web', sourceType: ResearchSourceType.WEBSITE }),
      source({ id: 'source-invalid', url: 'not-a-url' }),
    ]);
    resolver.validate.mockImplementation((url: string) => {
      if (url === 'not-a-url') throw new Error('invalid');
      return new URL(url);
    });

    const result = await service.ingest(projectId);

    expect(result.sourcesChecked).toBe(1);
    expect(youtube.fetchItems).toHaveBeenCalledTimes(1);
    expect(youtube.fetchItems).toHaveBeenCalledWith(source().url, DEFAULT_COMPETITOR_YOUTUBE_RECENT_UPLOAD_LIMIT);
  });

  it('persists a new video under the provider-aware YouTube identity, then reuses orchestration for topics and durable transcript work', async () => {
    const result = await service.ingest(projectId);

    expect(signals.create).toHaveBeenCalledWith(expect.objectContaining({ externalId: 'youtube:video-1', sourceType: ResearchSourceType.YOUTUBE }));
    expect(orchestration.processNewSignals).toHaveBeenCalledWith(projectId, ['signal-1']);
    expect(result).toMatchObject({ sourcesSucceeded: 1, newVideosIngested: 1, transcriptsStored: 0, transcriptsUnavailable: 0 });
  });

  it('skips an existing video before orchestration', async () => {
    signals.findByResearchSourceAndExternalIds.mockReset().mockResolvedValue({ id: 'existing-signal' });

    const result = await service.ingest(projectId);

    expect(result).toMatchObject({ newVideosIngested: 0, existingVideosSkipped: 1 });
    expect(orchestration.processNewSignals).not.toHaveBeenCalled();
  });

  it('recognizes the legacy raw videoId identity to avoid re-importing history', async () => {
    signals.findByResearchSourceAndExternalIds.mockReset().mockResolvedValue({ id: 'legacy-signal' });

    await service.ingest(projectId);

    expect(signals.findByResearchSourceAndExternalIds).toHaveBeenCalledWith(
      'source-1',
      ['youtube:video-1', 'video-1'],
    );
    expect(signals.create).not.toHaveBeenCalled();
    expect(orchestration.processNewSignals).not.toHaveBeenCalled();
  });

  it('keeps a persisted video when orchestration reports isolated topic or enqueue failures', async () => {
    orchestration.processNewSignals.mockResolvedValue({ topics: { topicsCreated: 0, failures: [{ signalId: 'signal-1' }] }, transcriptJobsCreated: 0, transcriptJobsSkipped: 1 });
    const result = await service.ingest(projectId);
    expect(result.newVideosIngested).toBe(1);
    expect(orchestration.processNewSignals).toHaveBeenCalledTimes(1);
  });

  it('isolates one source failure while another source succeeds', async () => {
    sources.findAll.mockResolvedValue([source({ id: 'source-fails' }), source({ id: 'source-succeeds', url: 'https://www.youtube.com/channel/UCabcdefghijklmnopqrstuw' })]);
    youtube.fetchItems.mockRejectedValueOnce(new Error('feed failure')).mockResolvedValueOnce([video]);
    signals.findByResearchSourceAndExternalIds.mockResolvedValueOnce(undefined).mockResolvedValueOnce({ id: 'signal-1' });

    const result = await service.ingest(projectId);

    expect(result).toMatchObject({ sourcesChecked: 2, sourcesSucceeded: 1, sourcesFailed: 1, newVideosIngested: 1 });
    expect(result.failures).toHaveLength(1);
  });

  it('is immediately idempotent when the next run finds the persisted video identity', async () => {
    signals.findByResearchSourceAndExternalIds.mockReset().mockResolvedValue({ id: 'signal-1' });

    const result = await service.ingest(projectId);

    expect(result.newVideosIngested).toBe(0);
    expect(result.existingVideosSkipped).toBe(1);
    expect(signals.create).not.toHaveBeenCalled();
    expect(orchestration.processNewSignals).not.toHaveBeenCalled();
  });
});
