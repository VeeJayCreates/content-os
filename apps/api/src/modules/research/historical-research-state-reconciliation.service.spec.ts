jest.mock('@content-os/contracts', () => ({ SourceEvidenceContentStatus: { AVAILABLE: 'available', UNAVAILABLE: 'unavailable', FAILED: 'failed' } }));
jest.mock('@content-os/storage', () => ({ SignalRepository: class {}, SourceEvidenceContentRepository: class {}, TranscriptAcquisitionJobRepository: class {}, OpportunityRepository: class {} }));
jest.mock('./new-video-topic.service', () => ({ NewVideoTopicService: class {} }));
jest.mock('./transcript-acquisition-queue.service', () => ({ TranscriptAcquisitionQueueService: class {} }));

import { HistoricalResearchStateReconciliationService } from './historical-research-state-reconciliation.service';

const projectId = '11111111-1111-4111-8111-111111111111';
const staleNoCaptions = '22222222-2222-4222-8222-222222222222';
const staleFailed = '33333333-3333-4333-8333-333333333333';
const complete = '44444444-4444-4444-8444-444444444444';

describe('HistoricalResearchStateReconciliationService', () => {
  const signals = { findAll: jest.fn() };
  const evidence = { findTranscriptBySignalIds: jest.fn() };
  const jobs = { findBySignalIds: jest.fn() };
  const opportunities = { findBySignalIds: jest.fn() };
  const topics = { process: jest.fn() };
  const queue = { enqueue: jest.fn(), enqueueRevalidation: jest.fn() };
  const service = new HistoricalResearchStateReconciliationService(signals as never, evidence as never, jobs as never, opportunities as never, topics as never, queue as never);

  beforeEach(() => {
    jest.resetAllMocks();
    signals.findAll.mockResolvedValue([
      { id: staleNoCaptions, sourceType: 'youtube', externalId: 'youtube:legacy-no-captions' },
      { id: staleFailed, sourceType: 'youtube', externalId: 'youtube:legacy-failed' },
      { id: complete, sourceType: 'youtube', externalId: 'youtube:complete' },
      { id: 'non-youtube', sourceType: 'rss', externalId: 'https://example.test' },
    ]);
    evidence.findTranscriptBySignalIds.mockResolvedValue([
      { id: 'e-no-captions', signalId: staleNoCaptions, status: 'unavailable', provenance: {} },
      { id: 'e-failed', signalId: staleFailed, status: 'failed', provenance: { transcriptOutcome: 'network_failed' } },
      { id: 'e-complete', signalId: complete, status: 'available', provenance: { validationVersion: 'youtube-transcript-completeness-v1', transcriptCompleteness: { classification: 'complete' } } },
    ]);
    jobs.findBySignalIds.mockResolvedValue([]);
    opportunities.findBySignalIds.mockResolvedValue(new Map([[complete, { id: 'topic-complete' }]]));
    topics.process.mockResolvedValue({ topicsCreated: 2, topicsJoined: 0, failed: 0, mappings: [{ signalId: staleNoCaptions, decision: 'created' }, { signalId: staleFailed, decision: 'created' }] });
    queue.enqueueRevalidation.mockResolvedValue({ created: true, job: { id: 'revalidation-job' } });
  });

  it('audits legacy no-caption and failed records as recoverable without touching a current complete transcript', async () => {
    const audit = await service.audit(projectId);
    expect(audit.summary).toMatchObject({ staleRecoverable: 2, trustedAvailable: 1, topicsMissing: 2 });
    expect(audit.records).toEqual(expect.arrayContaining([
      expect.objectContaining({ signalId: staleNoCaptions, transcriptState: 'stale_unavailable', reason: 'historical_no_caption_without_current_validation' }),
      expect.objectContaining({ signalId: staleFailed, transcriptState: 'stale_failed' }),
      expect.objectContaining({ signalId: complete, transcriptState: 'trusted_available', topicState: 'present' }),
    ]));
  });

  it('creates one versioned revalidation job and reuses Topic Creation V1 only for selected missing topics', async () => {
    const result = await service.repair(projectId, [staleNoCaptions, staleFailed]);
    expect(topics.process).toHaveBeenCalledWith(projectId, [staleNoCaptions, staleFailed]);
    expect(queue.enqueueRevalidation).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ transcriptJobsReopened: 2, topicsCreated: 2, topicsJoined: 0 });
  });

  it('is idempotent when an active revalidation already exists', async () => {
    jobs.findBySignalIds.mockResolvedValue([{ id: 'existing-job', signalId: staleNoCaptions, status: 'pending', createdAt: '2026-09-01T00:00:00.000Z' }]);
    const audit = await service.audit(projectId, [staleNoCaptions]);
    expect(audit.records[0]).toMatchObject({ transcriptState: 'in_flight', jobId: 'existing-job' });
    const result = await service.repair(projectId, [staleNoCaptions]);
    expect(queue.enqueueRevalidation).not.toHaveBeenCalled();
    expect(result.transcriptJobsSkipped).toBe(1);
  });

  it('does not let transcript repair failure block independent topic repair', async () => {
    queue.enqueueRevalidation.mockRejectedValue(new Error('queue unavailable'));
    await expect(service.repair(projectId, [staleNoCaptions])).resolves.toMatchObject({ records: [expect.objectContaining({ transcriptAction: 'queue_repair_failed', topicAction: 'created' })] });
    expect(topics.process).toHaveBeenCalledWith(projectId, [staleNoCaptions]);
  });

  it('does not let topic processing failure prevent a stale transcript from entering the durable queue', async () => {
    topics.process.mockRejectedValue(new Error('topic service unavailable'));
    await expect(service.repair(projectId, [staleNoCaptions])).resolves.toMatchObject({ transcriptJobsReopened: 1, topicFailures: 1 });
    expect(queue.enqueueRevalidation).toHaveBeenCalledWith(projectId, staleNoCaptions);
  });
});
