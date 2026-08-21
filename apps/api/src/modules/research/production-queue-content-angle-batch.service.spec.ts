jest.mock('@content-os/storage', () => ({ ProductionQueueRepository: class {} }));
jest.mock('@content-os/contracts', () => ({
  AiTask: { CONTENT_ANGLE: 'content_angle' }, AiBatchStatus: { COMPLETED: 'completed' }, AiBatchItemStatus: { COMPLETED: 'completed', FAILED: 'failed' }, ProductionQueueStatus: { PROCESSING: 'processing', FAILED: 'failed' },
}));
jest.mock('../ai/ai-batch-runtime.service', () => ({ AiBatchRuntime: class {} }));

import { ProductionQueueContentAngleBatchService } from './production-queue-content-angle-batch.service';

describe('ProductionQueueContentAngleBatchService', () => {
  const runtime = { submit: jest.fn(), syncBatchStatus: jest.fn(), completeItems: jest.fn() };
  const queue = { updateStatus: jest.fn() };
  const angles = { resolveEligibleContext: jest.fn() };
  const editorial = { prepareWithPackage: jest.fn(), persistPreparedAssessment: jest.fn() };
  const bridge = { synchronize: jest.fn() };
  const service = () => new ProductionQueueContentAngleBatchService(runtime as never, queue as never, angles as never, editorial as never, bridge);
  const prepared = (id: string, hash = `hash-${id}`) => ({ opportunity: { id: `opportunity-${id}`, projectId: 'project-1' }, researchPackageId: `package-${id}`, input: { researchPackage: { facts: [], signals: [] } }, inputHash: hash, cached: null });

  beforeEach(() => { jest.resetAllMocks(); });

  it('submits eligible queue items while skipping an ineligible item and moves only submitted items to processing', async () => {
    angles.resolveEligibleContext.mockImplementation((id: string) => id === 'bad' ? Promise.reject(new Error('not corroborated')) : Promise.resolve({ item: { researchPackageId: `package-${id}` }, opportunity: { id: `opportunity-${id}`, projectId: 'project-1' } }));
    editorial.prepareWithPackage.mockImplementation((_opportunity: unknown, packageId: string) => Promise.resolve(prepared(packageId.replace('package-', ''))));
    runtime.submit.mockResolvedValue({ id: 'batch-1' });
    const result = await service().submitContentAngleBatch(['one', 'bad', 'two']);
    expect(result).toEqual(expect.objectContaining({ batchId: 'batch-1', submittedItemIds: ['one', 'two'], skipped: [expect.objectContaining({ queueItemId: 'bad' })] }));
    expect(queue.updateStatus).toHaveBeenCalledWith('one', 'processing');
    expect(queue.updateStatus).toHaveBeenCalledWith('two', 'processing');
    expect(queue.updateStatus).not.toHaveBeenCalledWith('bad', 'processing');
    expect(bridge.synchronize).toHaveBeenCalledWith('one');
    expect(bridge.synchronize).toHaveBeenCalledWith('two');
  });

  it('does not alter queue lifecycle if provider submission fails', async () => {
    angles.resolveEligibleContext.mockResolvedValue({ item: { researchPackageId: 'package-one' }, opportunity: { id: 'opportunity-one', projectId: 'project-1' } });
    editorial.prepareWithPackage.mockResolvedValue(prepared('one'));
    runtime.submit.mockRejectedValue(new Error('provider unavailable'));
    await expect(service().submitContentAngleBatch(['one'])).rejects.toThrow('provider unavailable');
    expect(queue.updateStatus).not.toHaveBeenCalled();
  });

  it('reconciles out-of-order results, validates through EditorialAssessmentService, and isolates one invalid item', async () => {
    runtime.syncBatchStatus.mockResolvedValue({ status: 'completed', items: [{ customId: 'two', entityType: 'production_queue_item', entityId: 'two', promptHash: 'hash-two', status: 'queued' }, { customId: 'one', entityType: 'production_queue_item', entityId: 'one', promptHash: 'hash-one', status: 'queued' }], results: [{ customId: 'one', status: 'completed', output: { value: 1 }, usage: { inputTokens: 3, outputTokens: 2 } }, { customId: 'two', status: 'completed', output: { value: 2 }, usage: { inputTokens: 4, outputTokens: 3 } }] });
    angles.resolveEligibleContext.mockImplementation((id: string) => Promise.resolve({ item: { researchPackageId: `package-${id}` }, opportunity: { id: `opportunity-${id}`, projectId: 'project-1' } }));
    editorial.prepareWithPackage.mockImplementation((_opportunity: unknown, packageId: string) => Promise.resolve(prepared(packageId.replace('package-', ''))));
    editorial.persistPreparedAssessment.mockImplementation((value: { researchPackageId: string }) => value.researchPackageId === 'package-one' ? Promise.resolve({ id: 'assessment-one' }) : Promise.reject(new Error('invalid citation')));
    await expect(service().consumeCompletedContentAngleBatch('batch-1')).resolves.toEqual({ batchId: 'batch-1', processed: 2, succeeded: 1, failed: 1 });
    expect(runtime.completeItems).toHaveBeenCalledWith('batch-1', expect.arrayContaining([expect.objectContaining({ customId: 'one', status: 'completed' })]));
    expect(runtime.completeItems).toHaveBeenCalledWith('batch-1', expect.arrayContaining([expect.objectContaining({ customId: 'two', status: 'failed', errorCategory: 'output_validation' })]));
    expect(queue.updateStatus).toHaveBeenCalledWith('two', 'failed');
    expect(bridge.synchronize).toHaveBeenCalledWith('two');
    expect(queue.updateStatus).not.toHaveBeenCalledWith('one', 'completed');
  });

  it('preserves a terminal batch failure when pipeline observation fails', async () => {
    runtime.syncBatchStatus.mockResolvedValue({ status: 'completed', items: [{ customId: 'one', entityType: 'production_queue_item', entityId: 'one', promptHash: 'hash-one', status: 'queued' }], results: [{ customId: 'one', status: 'failed', usage: { inputTokens: null, outputTokens: null } }] });
    bridge.synchronize.mockRejectedValue(new Error('bridge unavailable'));
    await expect(service().consumeCompletedContentAngleBatch('batch-1')).resolves.toEqual({ batchId: 'batch-1', processed: 1, succeeded: 0, failed: 1 });
    expect(queue.updateStatus).toHaveBeenCalledWith('one', 'failed');
  });

  it('does not reprocess completed items during repeated reconciliation', async () => {
    runtime.syncBatchStatus.mockResolvedValue({ status: 'completed', items: [{ customId: 'one', entityType: 'production_queue_item', entityId: 'one', promptHash: 'hash-one', status: 'completed' }], results: [{ customId: 'one', status: 'completed', output: {}, usage: { inputTokens: 1, outputTokens: 1 } }] });
    await expect(service().consumeCompletedContentAngleBatch('batch-1')).resolves.toEqual({ batchId: 'batch-1', processed: 0, succeeded: 0, failed: 0 });
    expect(editorial.persistPreparedAssessment).not.toHaveBeenCalled();
  });
});
