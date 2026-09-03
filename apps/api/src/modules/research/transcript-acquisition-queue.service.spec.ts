jest.mock('@content-os/contracts', () => ({ SourceEvidenceContentStatus: { AVAILABLE: 'available', UNAVAILABLE: 'unavailable' } }));
jest.mock('@content-os/storage', () => ({ SignalRepository: class {}, SourceEvidenceContentRepository: class {}, TranscriptAcquisitionJobRepository: class {} }));
jest.mock('./youtube-transcript-repair.service', () => ({ YouTubeTranscriptRepairService: class {} }));

import { TranscriptAcquisitionQueueService } from './transcript-acquisition-queue.service';

const projectId = '11111111-1111-4111-8111-111111111111';
const signalId = '22222222-2222-4222-8222-222222222222';

describe('TranscriptAcquisitionQueueService', () => {
  const jobs = { createIfAbsent: jest.fn(), recoverStaleProcessing: jest.fn(), claimNext: jest.fn(), claimById: jest.fn(), complete: jest.fn(), retryLater: jest.fn(), retryNow: jest.fn(), findAll: jest.fn(), findById: jest.fn() };
  const signals = { findById: jest.fn(), findAll: jest.fn() };
  const evidence = { findBySignalId: jest.fn() };
  const repairs = { repairOne: jest.fn() };
  const service = new TranscriptAcquisitionQueueService(jobs as never, signals as never, evidence as never, repairs as never);

  beforeEach(() => {
    jest.resetAllMocks();
    signals.findById.mockResolvedValue({ id: signalId, projectId, sourceType: 'youtube', externalId: 'youtube:video-1' });
    evidence.findBySignalId.mockResolvedValue([]);
    jobs.createIfAbsent.mockResolvedValue({ created: true, job: { id: 'job-1', signalId, projectId, status: 'pending' } });
  });

  it('creates one durable logical job and keeps repeated orchestration idempotent', async () => {
    const first = await service.enqueue(projectId, signalId);
    jobs.createIfAbsent.mockResolvedValue({ created: false, job: { id: 'job-1', signalId, projectId, status: 'pending' } });
    const second = await service.enqueue(projectId, signalId);
    expect(first.created).toBe(true);
    expect(second).toMatchObject({ created: false, reason: 'logical_job_exists' });
    expect(jobs.createIfAbsent).toHaveBeenCalledWith({ projectId, signalId, version: 'transcript-acquisition-queue-v1' });
  });

  it('does not queue a signal that already has a terminal stored transcript', async () => {
    evidence.findBySignalId.mockResolvedValue([{ contentType: 'transcript', status: 'available' }]);
    await expect(service.enqueue(projectId, signalId)).resolves.toMatchObject({ created: false, reason: 'terminal_transcript_exists' });
    expect(jobs.createIfAbsent).not.toHaveBeenCalled();
  });

  it('creates a separate versioned revalidation job only when the historical audit explicitly requests it', async () => {
    evidence.findBySignalId.mockResolvedValue([{ contentType: 'transcript', status: 'unavailable' }]);
    await expect(service.enqueueRevalidation(projectId, signalId)).resolves.toMatchObject({ created: true });
    expect(jobs.createIfAbsent).toHaveBeenCalledWith({ projectId, signalId, version: 'transcript-acquisition-revalidation-v1' });
  });

  it('claims exactly one pending job and persists an available outcome', async () => {
    jobs.claimNext.mockResolvedValue({ id: 'job-1', projectId, signalId, attempts: 1 });
    repairs.repairOne.mockResolvedValue({ kind: 'available', classification: 'automatic_caption_downloaded' });
    jobs.complete.mockResolvedValue({ id: 'job-1', status: 'available' });
    await expect(service.processNext(projectId)).resolves.toMatchObject({ processed: true, job: { status: 'available' } });
    expect(jobs.claimNext).toHaveBeenCalledTimes(1);
    expect(jobs.complete).toHaveBeenCalledWith('job-1', 'available');
  });

  it('schedules a retryable provider outcome without losing the logical job', async () => {
    jobs.claimNext.mockResolvedValue({ id: 'job-1', projectId, signalId, attempts: 2 });
    repairs.repairOne.mockResolvedValue({ kind: 'retryable_failure', classification: 'yt_dlp_rate_limited' });
    jobs.retryLater.mockResolvedValue({ id: 'job-1', status: 'retryable_failure' });
    const result = await service.processNext(projectId);
    expect(result).toMatchObject({ processed: true, job: { status: 'retryable_failure' } });
    expect(jobs.retryLater).toHaveBeenCalledWith('job-1', 'yt_dlp_rate_limited', expect.any(String));
  });

  it('does not process a second item when the queue has no due claim', async () => {
    jobs.claimNext.mockResolvedValue(undefined);
    await expect(service.processNext(projectId)).resolves.toEqual({ processed: false, job: null });
    expect(repairs.repairOne).not.toHaveBeenCalled();
  });

  it('claims and processes only the explicitly requested due pending job', async () => {
    const requestedJob = { id: 'job-requested', projectId, signalId, version: 'transcript-acquisition-revalidation-v1', status: 'pending', attempts: 0, nextAttemptAt: '2026-01-01T00:00:00.000Z' };
    jobs.findById.mockResolvedValue(requestedJob);
    jobs.claimById.mockResolvedValue({ ...requestedJob, status: 'processing', attempts: 1, nextAttemptAt: null });
    repairs.repairOne.mockResolvedValue({ kind: 'available', classification: 'automatic_caption_downloaded' });
    jobs.complete.mockResolvedValue({ ...requestedJob, status: 'available', attempts: 1 });

    await expect(service.processJob(projectId, requestedJob.id)).resolves.toMatchObject({ processed: true, job: { id: requestedJob.id, status: 'available' } });
    expect(jobs.claimById).toHaveBeenCalledWith(projectId, requestedJob.id, expect.any(String));
    expect(jobs.claimNext).not.toHaveBeenCalled();
    expect(repairs.repairOne).toHaveBeenCalledWith(projectId, signalId);
  });

  it('processes a due retryable target without consulting an earlier global job', async () => {
    const requestedJob = { id: 'job-retryable', projectId, signalId, version: 'transcript-acquisition-revalidation-v1', status: 'retryable_failure', attempts: 1, nextAttemptAt: '2020-01-01T00:00:00.000Z' };
    jobs.findById.mockResolvedValue(requestedJob);
    jobs.claimById.mockResolvedValue({ ...requestedJob, status: 'processing', attempts: 2, nextAttemptAt: null });
    repairs.repairOne.mockResolvedValue({ kind: 'retryable_failure', classification: 'provider_timeout' });
    jobs.retryLater.mockResolvedValue({ ...requestedJob, status: 'retryable_failure', attempts: 2 });

    await expect(service.processJob(projectId, requestedJob.id)).resolves.toMatchObject({ processed: true, outcome: { classification: 'provider_timeout' } });
    expect(jobs.claimNext).not.toHaveBeenCalled();
    expect(jobs.retryLater).toHaveBeenCalledWith(requestedJob.id, 'provider_timeout', expect.any(String));
  });

  it('does not claim a requested job that is not yet due', async () => {
    const job = { id: 'job-not-due', projectId, signalId, version: 'transcript-acquisition-revalidation-v1', status: 'retryable_failure', attempts: 1, nextAttemptAt: '2999-01-01T00:00:00.000Z' };
    jobs.findById.mockResolvedValue(job);
    jobs.claimById.mockResolvedValue(undefined);

    await expect(service.processJob(projectId, job.id)).resolves.toMatchObject({ processed: false, reason: 'not_due', job });
    expect(repairs.repairOne).not.toHaveBeenCalled();
  });

  it('does not double-process a target when a concurrent claimant already owns it', async () => {
    const job = { id: 'job-processing', projectId, signalId, version: 'transcript-acquisition-revalidation-v1', status: 'processing', attempts: 1, nextAttemptAt: null };
    jobs.findById.mockResolvedValueOnce({ ...job, status: 'pending' }).mockResolvedValueOnce(job);
    jobs.claimById.mockResolvedValue(undefined);

    await expect(service.processJob(projectId, job.id)).resolves.toMatchObject({ processed: false, reason: 'already_processing' });
    expect(repairs.repairOne).not.toHaveBeenCalled();
  });

  it('does not process terminal or unknown requested jobs', async () => {
    const terminal = { id: 'job-terminal', projectId, signalId, version: 'transcript-acquisition-revalidation-v1', status: 'available', attempts: 2, nextAttemptAt: null };
    jobs.findById.mockResolvedValue(terminal);
    jobs.claimById.mockResolvedValue(undefined);
    await expect(service.processJob(projectId, terminal.id)).resolves.toMatchObject({ processed: false, reason: 'terminal_or_unclaimable' });

    jobs.findById.mockResolvedValue(undefined);
    await expect(service.processJob(projectId, 'missing-job')).resolves.toEqual({ processed: false, reason: 'not_found', job: null });
    expect(repairs.repairOne).not.toHaveBeenCalled();
  });
});
