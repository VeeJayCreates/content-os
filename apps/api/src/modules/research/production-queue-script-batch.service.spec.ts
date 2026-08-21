jest.mock('@content-os/storage', () => ({ ProductionQueueRepository: class {} }));
jest.mock('@content-os/contracts', () => ({
  AiTask: { SCRIPT_GENERATION: 'script_generation', CONTENT_PACKAGE_GENERATION: 'content_package_generation' },
  AiBatchStatus: { COMPLETED: 'completed' },
  AiBatchItemStatus: { COMPLETED: 'completed', FAILED: 'failed' },
  AiExecutionMode: { BATCH: 'batch' },
  ProductionQueueStatus: { PROCESSING: 'processing', FAILED: 'failed' },
}));
jest.mock('../ai/ai-batch-runtime.service', () => ({ AiBatchRuntime: class {} }));

import { ProductionQueueScriptBatchService } from './production-queue-script-batch.service';

describe('ProductionQueueScriptBatchService', () => {
  const runtime = { submit: jest.fn(), syncBatchStatus: jest.fn(), completeItems: jest.fn() };
  const queue = { updateStatus: jest.fn() };
  const scripts = { prepare: jest.fn(), persistPrepared: jest.fn() };
  const bridge = { synchronize: jest.fn() };
  const service = () => new ProductionQueueScriptBatchService(runtime as never, queue as never, scripts as never, bridge);
  const prepared = (id: string, hash = `hash-${id}`) => ({ queueItemId: id, projectId: 'project-1', opportunityId: `opportunity-${id}`, researchPackageId: `package-${id}`, editorialAssessmentId: `angle-${id}`, input: { facts: [{ id: `fact-${id}` }] }, inputHash: hash, cached: null });

  beforeEach(() => jest.resetAllMocks());

  it('submits only eligible scripts with unique correlation IDs and keeps submitted queue items processing', async () => {
    scripts.prepare.mockImplementation((id: string) => id === 'ineligible' ? Promise.reject(new Error('not corroborated')) : Promise.resolve(prepared(id)));
    runtime.submit.mockResolvedValue({ id: 'batch-1' });

    await expect(service().submitScriptBatch(['one', 'ineligible', 'two'])).resolves.toEqual(expect.objectContaining({ batchId: 'batch-1', submittedItemIds: ['one', 'two'] }));
    const submitted = runtime.submit.mock.calls[0][1];
    expect(runtime.submit).toHaveBeenCalledWith('content_package_generation', expect.any(Array));
    expect(submitted.map((item: { customId: string }) => item.customId)).toEqual(['content-package:one:hash-one', 'content-package:two:hash-two']);
    expect(queue.updateStatus).toHaveBeenCalledWith('one', 'processing');
    expect(queue.updateStatus).toHaveBeenCalledWith('two', 'processing');
    expect(bridge.synchronize).toHaveBeenCalledWith('one');
    expect(bridge.synchronize).toHaveBeenCalledWith('two');
  });

  it('reconciles out-of-order batch results, uses shared script persistence, and isolates one failed sibling', async () => {
    runtime.syncBatchStatus.mockResolvedValue({ status: 'completed', items: [
      { customId: 'script:two:hash-two', entityType: 'production_queue_item', entityId: 'two', promptHash: 'hash-two', status: 'queued' },
      { customId: 'script:one:hash-one', entityType: 'production_queue_item', entityId: 'one', promptHash: 'hash-one', status: 'queued' },
    ], results: [
      { customId: 'script:one:hash-one', status: 'completed', output: { hook: 'Hook', body: 'Body', closing: 'Close', fullScript: 'All', citedFactIds: ['fact-one'], primaryTitle: 'Title', alternateTitles: ['Alternate'], description: 'Description', tags: ['tag'], hashtags: ['#tag'], keywords: ['keyword'], thumbnailText: 'Thumbnail', thumbnailCreativeBrief: 'Brief', metadataFactIds: ['fact-one'] }, usage: { inputTokens: 3, outputTokens: 2 } },
      { customId: 'script:two:hash-two', status: 'failed', errorCategory: 'provider_failure', errorCode: 'rate_limit', usage: { inputTokens: null, outputTokens: null } },
    ] });
    scripts.prepare.mockImplementation((id: string) => Promise.resolve(prepared(id)));
    scripts.persistPrepared.mockResolvedValue({ id: 'script-1' });

    await expect(service().consumeCompletedScriptBatch('batch-1')).resolves.toEqual({ batchId: 'batch-1', processed: 2, succeeded: 1, failed: 1 });
    expect(scripts.persistPrepared).toHaveBeenCalledWith(expect.objectContaining({ queueItemId: 'one' }), expect.any(Object), 'batch');
    expect(scripts.persistPrepared.mock.calls[0][1]).toEqual(expect.objectContaining({ primaryTitle: 'Title', thumbnailCreativeBrief: 'Brief' }));
    expect(queue.updateStatus).toHaveBeenCalledWith('two', 'failed');
    expect(bridge.synchronize).toHaveBeenCalledWith('two');
    expect(queue.updateStatus).not.toHaveBeenCalledWith('one', 'completed');
  });

  it('preserves a terminal batch failure when pipeline observation fails', async () => {
    runtime.syncBatchStatus.mockResolvedValue({ status: 'completed', items: [{ customId: 'one', entityType: 'production_queue_item', entityId: 'one', promptHash: 'hash-one', status: 'queued' }], results: [{ customId: 'one', status: 'failed', usage: { inputTokens: null, outputTokens: null } }] });
    bridge.synchronize.mockRejectedValue(new Error('bridge unavailable'));
    await expect(service().consumeCompletedScriptBatch('batch-1')).resolves.toEqual({ batchId: 'batch-1', processed: 1, succeeded: 0, failed: 1 });
    expect(queue.updateStatus).toHaveBeenCalledWith('one', 'failed');
  });

  it('does not reprocess a completed item during repeated reconciliation', async () => {
    runtime.syncBatchStatus.mockResolvedValue({ status: 'completed', items: [{ customId: 'script:one:hash-one', entityType: 'production_queue_item', entityId: 'one', promptHash: 'hash-one', status: 'completed' }], results: [{ customId: 'script:one:hash-one', status: 'completed', output: {}, usage: { inputTokens: 1, outputTokens: 1 } }] });
    await expect(service().consumeCompletedScriptBatch('batch-1')).resolves.toEqual({ batchId: 'batch-1', processed: 0, succeeded: 0, failed: 0 });
    expect(scripts.persistPrepared).not.toHaveBeenCalled();
  });

  it('rejects a stale batch result without overwriting the current Script', async () => {
    runtime.syncBatchStatus.mockResolvedValue({ status: 'completed', items: [{ customId: 'script:one:old-hash', entityType: 'production_queue_item', entityId: 'one', promptHash: 'old-hash', status: 'queued' }], results: [{ customId: 'script:one:old-hash', status: 'completed', output: {}, usage: { inputTokens: 1, outputTokens: 1 } }] });
    scripts.prepare.mockResolvedValue(prepared('one', 'new-hash'));
    await expect(service().consumeCompletedScriptBatch('batch-1')).resolves.toEqual({ batchId: 'batch-1', processed: 1, succeeded: 0, failed: 1 });
    expect(scripts.persistPrepared).not.toHaveBeenCalled();
    expect(queue.updateStatus).toHaveBeenCalledWith('one', 'failed');
  });
});
