jest.mock('@content-os/contracts', () => ({
  ResearchSourceRole: { DISCOVERY: 'discovery', BOTH: 'both' },
  ResearchSourceType: { YOUTUBE: 'youtube' },
}));
jest.mock('@content-os/storage', () => ({
  ProjectRepository: class ProjectRepository {},
  ResearchSourceRepository: class ResearchSourceRepository {},
}));
jest.mock('./competitor-youtube-ingestion.service', () => ({ CompetitorYouTubeIngestionService: class {} }));
jest.mock('./transcript-acquisition-queue.service', () => ({ TranscriptAcquisitionQueueService: class {} }));

import { nextDiscoveryTriggerAt, ResearchSchedulerService } from './research-scheduler.service';

const projectOne = { id: '11111111-1111-4111-8111-111111111111' };
const projectTwo = { id: '22222222-2222-4222-8222-222222222222' };
const successfulIngestion = {
  sourcesFailed: 0,
  videosDiscovered: 3,
  newVideosIngested: 2,
  topicsCreated: 2,
  transcriptJobsCreated: 2,
};

describe('ResearchSchedulerService', () => {
  const projects = { findAll: jest.fn() };
  const sources = { findAll: jest.fn() };
  const ingestion = { ingest: jest.fn() };
  const queue = { processNext: jest.fn() };
  const log = { event: jest.fn() };
  const configuration = { value: { enabled: true, transcriptIntervalMs: 1_000, transcriptsPerRun: 1, manualRunEnabled: true } };
  const service = new ResearchSchedulerService(projects as never, sources as never, ingestion as never, queue as never, configuration as never, log as never);

  beforeEach(() => {
    jest.resetAllMocks();
    projects.findAll.mockResolvedValue([projectOne, projectTwo]);
    sources.findAll.mockResolvedValue([
      { projectId: projectOne.id, enabled: true, sourceType: 'youtube', role: 'discovery' },
      { projectId: projectTwo.id, enabled: true, sourceType: 'youtube', role: 'both' },
      { projectId: projectTwo.id, enabled: false, sourceType: 'youtube', role: 'discovery' },
    ]);
    ingestion.ingest.mockResolvedValue(successfulIngestion);
    queue.processNext.mockResolvedValue({ processed: false, job: null });
  });

  afterEach(() => service.onModuleDestroy());

  it('orchestrates the established competitor ingestion path for every eligible project and aggregates downstream work', async () => {
    const result = await service.runDiscovery('manual');

    expect(ingestion.ingest).toHaveBeenCalledWith(projectOne.id);
    expect(ingestion.ingest).toHaveBeenCalledWith(projectTwo.id);
    expect(result).toMatchObject({ projectsAttempted: 2, sourcesAttempted: 2, videosDiscovered: 6, newSignalsCreated: 4, topicsCreated: 4, transcriptJobsEnqueued: 4 });
  });

  it('remains idempotent by reporting existing-service no-op results on repeated discovery', async () => {
    const noOp = { ...successfulIngestion, videosDiscovered: 2, newVideosIngested: 0, topicsCreated: 0, transcriptJobsCreated: 0 };
    ingestion.ingest.mockResolvedValueOnce(successfulIngestion).mockResolvedValueOnce(successfulIngestion).mockResolvedValueOnce(noOp).mockResolvedValueOnce(noOp);

    await service.runDiscovery('manual');
    const repeated = await service.runDiscovery('manual');

    expect(repeated).toMatchObject({ newSignalsCreated: 0, topicsCreated: 0, transcriptJobsEnqueued: 0 });
  });

  it('isolates a project-level ingestion failure and continues remaining projects', async () => {
    ingestion.ingest.mockRejectedValueOnce(new Error('source runtime')).mockResolvedValueOnce(successfulIngestion);

    const result = await service.runDiscovery('manual');

    expect(ingestion.ingest).toHaveBeenCalledTimes(2);
    expect(result.failures).toEqual([{ projectId: projectOne.id, category: 'Error' }]);
    expect(result.newSignalsCreated).toBe(2);
  });

  it('processes at most one durable queue job per execution and preserves queue eligibility as authority', async () => {
    queue.processNext.mockResolvedValueOnce({ processed: true, job: { id: 'job-1', signalId: 'signal-1', status: 'available', failureClassification: null }, outcome: { kind: 'available', classification: 'automatic_caption_downloaded' } });

    const result = await service.runTranscriptWorker('manual');

    expect(queue.processNext).toHaveBeenCalledTimes(1);
    expect(queue.processNext).toHaveBeenCalledWith(projectOne.id);
    expect(result).toMatchObject({ processed: true, jobId: 'job-1', signalId: 'signal-1', outcome: 'available' });
  });

  it('stops after a rate-limited outcome without attempting another project job', async () => {
    queue.processNext.mockResolvedValueOnce({ processed: true, job: { id: 'job-1', signalId: 'signal-1', status: 'retryable_failure', failureClassification: 'youtube_transcript_api_rate_limited' }, outcome: { kind: 'retryable_failure', classification: 'youtube_transcript_api_rate_limited' } });

    const result = await service.runTranscriptWorker('manual');

    expect(queue.processNext).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ rateLimitStop: true, failureClassification: 'youtube_transcript_api_rate_limited' });
  });

  it('skips an overlapping discovery execution', async () => {
    let release!: () => void;
    ingestion.ingest.mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve(successfulIngestion); }));

    const first = service.runDiscovery('manual');
    await Promise.resolve();
    await expect(service.runDiscovery('manual')).resolves.toMatchObject({ skipped: true, reason: 'overlap' });
    release();
    await first;
  });

  it('does not schedule or process work on startup while disabled', () => {
    configuration.value.enabled = false;
    service.onModuleInit();
    expect(ingestion.ingest).not.toHaveBeenCalled();
    expect(queue.processNext).not.toHaveBeenCalled();
    configuration.value.enabled = true;
  });
});

describe('nextDiscoveryTriggerAt', () => {
  it.each([
    ['before midnight IST', '2026-09-01T18:29:59.000Z', '2026-09-01T18:30:00.000Z'],
    ['after midnight IST', '2026-09-01T18:30:00.000Z', '2026-09-02T00:30:00.000Z'],
    ['between morning slots', '2026-09-02T02:45:00.000Z', '2026-09-02T06:30:00.000Z'],
    ['after the final slot', '2026-09-02T13:00:00.000Z', '2026-09-02T18:30:00.000Z'],
  ])('aligns %s to the next IST wall-clock slot', (_label, now, expected) => {
    expect(nextDiscoveryTriggerAt(new Date(now)).toISOString()).toBe(expected);
  });
});
