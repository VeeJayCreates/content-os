import { Test } from '@nestjs/testing';
jest.mock('./transcript-acquisition-queue.service', () => ({ TranscriptAcquisitionQueueService: class {} }));
import { TranscriptAcquisitionQueueController } from './transcript-acquisition-queue.controller';
import { TranscriptAcquisitionQueueService } from './transcript-acquisition-queue.service';

describe('TranscriptAcquisitionQueueController', () => {
  const queue = { inspect: jest.fn(), reconcile: jest.fn(), processNext: jest.fn(), processJob: jest.fn(), retry: jest.fn() };
  const projectId = '11111111-1111-4111-8111-111111111111';
  const signalId = '22222222-2222-4222-8222-222222222222';

  beforeEach(() => jest.resetAllMocks());

  it('exposes inspection, generic processing, exact-job processing, and retry controls without provider selection', async () => {
    const module = await Test.createTestingModule({ controllers: [TranscriptAcquisitionQueueController], providers: [{ provide: TranscriptAcquisitionQueueService, useValue: queue }] }).compile();
    const controller = module.get(TranscriptAcquisitionQueueController);
    queue.inspect.mockResolvedValue({ summary: { pending: 1 } });
    queue.reconcile.mockResolvedValue({ jobsCreated: 1 });
    queue.processNext.mockResolvedValue({ processed: false });
    queue.processJob.mockResolvedValue({ processed: false, reason: 'not_due' });
    queue.retry.mockResolvedValue({ id: 'job' });
    await expect(controller.inspect(projectId)).resolves.toMatchObject({ summary: { pending: 1 } });
    await expect(controller.reconcile(projectId)).resolves.toEqual({ jobsCreated: 1 });
    await expect(controller.processNext(projectId)).resolves.toEqual({ processed: false });
    await expect(controller.processJob(projectId, signalId)).resolves.toEqual({ processed: false, reason: 'not_due' });
    await expect(controller.retry(projectId, { signalId })).resolves.toEqual({ id: 'job' });
    expect(queue.retry).toHaveBeenCalledWith(projectId, signalId);
    expect(queue.processJob).toHaveBeenCalledWith(projectId, signalId);
    await module.close();
  });
});
