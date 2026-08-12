jest.mock('@content-os/storage', () => ({ AiBatchRepository: class {} }));
jest.mock('@content-os/contracts', () => ({
  AiTask: { CONTENT_ANGLE: 'content_angle', SEMANTIC_EMBEDDING: 'semantic_embedding' },
  AiBatchStatus: { QUEUED: 'queued', SUBMITTED: 'submitted', PROCESSING: 'processing', COMPLETED: 'completed', FAILED: 'failed', CANCELLED: 'cancelled', EXPIRED: 'expired' },
  AiBatchItemStatus: { QUEUED: 'queued', SUBMITTED: 'submitted', COMPLETED: 'completed', FAILED: 'failed' },
  AiExecutionMode: { BATCH: 'batch' },
}));

import { AiTask } from '@content-os/contracts';
import { AiBatchRuntime } from './ai-batch-runtime.service';

describe('AiBatchRuntime', () => {
  const router = { route: jest.fn(() => ({ task: AiTask.CONTENT_ANGLE, provider: 'openai-cloud', model: 'gpt-5.4-mini' })) };
  const batches = { create: jest.fn(), updateBatch: jest.fn(), findById: jest.fn(), updateItems: jest.fn() };
  const provider = { name: 'openai-cloud', submitBatch: jest.fn(), getBatchStatus: jest.fn(), getBatchResults: jest.fn() };
  const costs = { pricing: jest.fn(() => ({ version: 'batch-v1', currency: 'USD', inputMicrounitsPerMillionTokens: 375_000, outputMicrounitsPerMillionTokens: 2_250_000 })), estimate: jest.fn(() => 6) };
  const runtime = () => new AiBatchRuntime(router as never, [provider] as never, batches as never, costs as never);
  const item = (customId = 'angle-1') => ({ customId, projectId: 'project-1', entityType: 'production_queue_item', entityId: customId, systemPrompt: 'private', input: { research: 'private' } });

  beforeEach(() => { jest.resetAllMocks(); router.route.mockReturnValue({ task: AiTask.CONTENT_ANGLE, provider: 'openai-cloud', model: 'gpt-5.4-mini' }); batches.create.mockResolvedValue({ id: 'batch-1', items: [] }); batches.updateBatch.mockResolvedValue({ id: 'batch-1', providerBatchId: 'provider-1', status: 'submitted', items: [] }); provider.submitBatch.mockResolvedValue({ providerBatchId: 'provider-1' }); costs.pricing.mockReturnValue({ version: 'batch-v1', currency: 'USD', inputMicrounitsPerMillionTokens: 375_000, outputMicrounitsPerMillionTokens: 2_250_000 }); costs.estimate.mockReturnValue(6); });

  it('submits provider-neutral items with deterministic request order and no prompt persistence', async () => {
    await runtime().submit(AiTask.CONTENT_ANGLE, [item('b'), item('a')]);
    expect(provider.submitBatch).toHaveBeenCalledWith(expect.objectContaining({ task: AiTask.CONTENT_ANGLE, model: 'gpt-5.4-mini', items: expect.arrayContaining([expect.objectContaining({ customId: 'b', promptHash: expect.any(String) })]) }));
    expect(batches.create).toHaveBeenCalledWith(expect.anything(), expect.arrayContaining([expect.objectContaining({ customId: 'b', requestIndex: 0 })]));
    expect(JSON.stringify(batches.create.mock.calls)).not.toContain('private');
  });

  it('rejects duplicate custom IDs and over-cap batches before provider submission', async () => {
    await expect(runtime().submit(AiTask.CONTENT_ANGLE, [item('same'), item('same')])).rejects.toThrow('unique');
    await expect(runtime().submit(AiTask.CONTENT_ANGLE, Array.from({ length: 11 }, (_, index) => item(`id-${index}`)))).rejects.toThrow('between 1 and 10');
    expect(provider.submitBatch).not.toHaveBeenCalled();
  });

  it('maps an out-of-order provider result by custom ID and isolates item failures', async () => {
    batches.findById.mockResolvedValue({ id: 'batch-1', provider: 'openai-cloud', providerBatchId: 'provider-1', items: [{ customId: 'first' }, { customId: 'second' }] });
    batches.updateBatch.mockResolvedValue({ id: 'batch-1', items: [{ customId: 'first' }, { customId: 'second' }] });
    provider.getBatchStatus.mockResolvedValue({ status: 'completed' });
    provider.getBatchResults.mockResolvedValue([{ customId: 'second', status: 'failed', errorCategory: 'malformed_response', usage: { inputTokens: null, outputTokens: null } }, { customId: 'first', status: 'completed', usage: { inputTokens: 4, outputTokens: 2 } }]);
    await runtime().syncBatchStatus('batch-1');
    expect(batches.updateItems).toHaveBeenCalledWith('batch-1', expect.arrayContaining([expect.objectContaining({ customId: 'second', status: 'failed' })]));
    expect(batches.updateItems).not.toHaveBeenCalledWith('batch-1', expect.arrayContaining([expect.objectContaining({ customId: 'first', status: 'completed' })]));
  });

  it('uses bounded configurable formation defaults', () => {
    expect(runtime().formationPolicy()).toEqual({ maxItems: 10, maxWaitMs: 1_800_000 });
  });

  it('persists centralized batch pricing only for successful items with complete token counts', async () => {
    batches.findById.mockResolvedValue({ id: 'batch-1', provider: 'openai-cloud', providerBatchId: 'provider-1', model: 'gpt-5.4-mini', items: [{ customId: 'mini' }, { customId: 'failed' }] });
    batches.updateBatch.mockResolvedValue({ id: 'batch-1', items: [] });
    provider.getBatchStatus.mockResolvedValue({ status: 'completed' });
    provider.getBatchResults.mockResolvedValue([{ customId: 'failed', status: 'failed', usage: { inputTokens: 9, outputTokens: 3 } }, { customId: 'mini', status: 'completed', usage: { inputTokens: 4, outputTokens: 2 } }]);
    await runtime().syncBatchStatus('batch-1');
    expect(costs.pricing).toHaveBeenCalledWith('gpt-5.4-mini', 'batch');
    expect(batches.updateItems).toHaveBeenCalledWith('batch-1', expect.arrayContaining([expect.objectContaining({ customId: 'mini', estimatedCostMicrounits: 6, pricingVersion: 'batch-v1' }), expect.objectContaining({ customId: 'failed', estimatedCostMicrounits: null, pricingVersion: null })]));
  });

  it('keeps an already finalized item cost stable on repeated reconciliation', async () => {
    const batch = { id: 'batch-1', provider: 'openai-cloud', providerBatchId: 'provider-1', model: 'gpt-5.4-nano', items: [{ customId: 'nano', status: 'completed', estimatedCostMicrounits: 2, pricingVersion: 'batch-v1' }] };
    batches.findById.mockResolvedValue(batch); batches.updateBatch.mockResolvedValue(batch); batches.updateItems.mockResolvedValue(batch);
    provider.getBatchStatus.mockResolvedValue({ status: 'completed' }); provider.getBatchResults.mockResolvedValue([{ customId: 'nano', status: 'completed', usage: { inputTokens: 4, outputTokens: 2 } }]);
    costs.estimate.mockReturnValue(2);
    await runtime().syncBatchStatus('batch-1'); await runtime().syncBatchStatus('batch-1');
    expect(batches.updateItems).toHaveBeenLastCalledWith('batch-1', [expect.objectContaining({ customId: 'nano', estimatedCostMicrounits: 2, pricingVersion: 'batch-v1' })]);
  });
});
