jest.mock('@content-os/contracts', () => ({
  AiTask: { SCENE_PLANNING: 'scene_planning' }, AiBatchItemStatus: { COMPLETED: 'completed', FAILED: 'failed' }, AiBatchStatus: { COMPLETED: 'completed' }, AiExecutionMode: { BATCH: 'batch' },
}));
jest.mock('@content-os/storage', () => ({ ContentScriptRepository: class {}, ScenePlanRepository: class {} }));
jest.mock('../ai/ai-batch-runtime.service', () => ({ AiBatchRuntime: class {} }));
jest.mock('../ai/ai-runtime.service', () => ({ AiRuntime: class {} }));

import { ScenePlanningBatchService } from './scene-planning-batch.service';

describe('ScenePlanningBatchService', () => {
  const runtime = { submit: jest.fn(), syncBatchStatus: jest.fn(), completeItems: jest.fn() };
  const planning = { prepare: jest.fn(), runtimeInput: jest.fn(), persistPrepared: jest.fn(), persistBatchFailure: jest.fn() };
  const service = () => new ScenePlanningBatchService(runtime as never, planning as never);
  const prepared = { contentScriptId: '11111111-1111-4111-8111-111111111111', projectId: 'project-1', inputHash: 'abcdef0123456789fedcba', language: 'English', factIds: ['fact-1'], segments: [], cached: null };

  beforeEach(() => {
    jest.resetAllMocks();
    planning.prepare.mockResolvedValue(prepared);
    planning.runtimeInput.mockReturnValue({ segments: [] });
    runtime.submit.mockResolvedValue({ id: 'batch-1' });
    runtime.completeItems.mockResolvedValue(undefined);
  });

  it('submits one deterministic request per eligible Content Package and skips current packages', async () => {
    planning.prepare.mockResolvedValueOnce(prepared).mockResolvedValueOnce({ ...prepared, contentScriptId: '22222222-2222-4222-8222-222222222222', cached: { id: 'current-plan' } });
    const result = await service().submitScenePlanBatch([prepared.contentScriptId, '22222222-2222-4222-8222-222222222222']);
    expect(runtime.submit).toHaveBeenCalledWith('scene_planning', [expect.objectContaining({ entityType: 'content_script', entityId: prepared.contentScriptId, customId: expect.stringContaining(`scene-plan:${prepared.contentScriptId}:abcdef0123456789`) })]);
    expect(result).toEqual(expect.objectContaining({ batchId: 'batch-1', submittedItemIds: [prepared.contentScriptId], skipped: [{ contentScriptId: '22222222-2222-4222-8222-222222222222', reason: 'Scene Plan is already current' }] }));
  });

  it('isolates ineligible package failures during preparation', async () => {
    planning.prepare.mockRejectedValueOnce(new Error('Content Script is not ready')).mockResolvedValueOnce(prepared);
    const result = await service().submitScenePlanBatch(['bad', prepared.contentScriptId]);
    expect(result.submittedItemIds).toEqual([prepared.contentScriptId]);
    expect(result.skipped).toEqual([{ contentScriptId: 'bad', reason: 'Content Script is not ready' }]);
  });

  it('prevents duplicate in-flight submission for the same Content Package', async () => {
    const instance = service();
    await instance.submitScenePlanBatch([prepared.contentScriptId]);
    const repeated = await instance.submitScenePlanBatch([prepared.contentScriptId]);
    expect(repeated).toEqual(expect.objectContaining({ batchId: null, submittedItemIds: [], skipped: [{ contentScriptId: prepared.contentScriptId, reason: 'Scene Plan batch generation is already in progress' }] }));
    expect(runtime.submit).toHaveBeenCalledTimes(1);
  });

  it('correlates out-of-order completed results and isolates an invalid sibling', async () => {
    const second = { ...prepared, contentScriptId: '22222222-2222-4222-8222-222222222222', inputHash: '0123456789abcdef' };
    planning.prepare.mockImplementation(async (id: string) => id === second.contentScriptId ? second : prepared);
    runtime.syncBatchStatus.mockResolvedValue({ status: 'completed', items: [
      { customId: 'scene-plan:one', entityType: 'content_script', entityId: prepared.contentScriptId, promptHash: prepared.inputHash, status: 'submitted' },
      { customId: 'scene-plan:two', entityType: 'content_script', entityId: second.contentScriptId, promptHash: second.inputHash, status: 'submitted' },
    ], results: [
      { customId: 'scene-plan:two', status: 'failed', errorCategory: 'provider_failure', errorCode: 'bad', usage: { inputTokens: 1, outputTokens: null } },
      { customId: 'scene-plan:one', status: 'succeeded', output: { scenes: [] }, usage: { inputTokens: 2, outputTokens: 3 } },
    ] });
    const result = await service().consumeCompletedScenePlanBatch('batch-1');
    expect(planning.persistPrepared).toHaveBeenCalledWith(prepared, { scenes: [] }, 'batch');
    expect(planning.persistBatchFailure).toHaveBeenCalledWith(second, 'provider_failure');
    expect(result).toEqual({ batchId: 'batch-1', processed: 2, succeeded: 1, failed: 1 });
  });

  it('does not call a direct provider; it only uses the shared batch runtime', async () => {
    await service().submitScenePlanBatch([prepared.contentScriptId]);
    expect(runtime.submit).toHaveBeenCalledTimes(1);
    expect(planning).not.toHaveProperty('structuredGeneration');
  });
});
