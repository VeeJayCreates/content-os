import { Injectable, NotFoundException } from '@nestjs/common';
import { AiBatchItemStatus, AiBatchStatus, AiExecutionMode, AiTask } from '@content-os/contracts';

import { AiBatchRuntime } from '../ai/ai-batch-runtime.service';
import { SCENE_PLANNING_SYSTEM_PROMPT, ScenePlanningService, type PreparedScenePlan } from './scene-planning.service';

type PreparedItem = { contentScriptId: string; customId: string; prepared: PreparedScenePlan };

@Injectable()
export class ScenePlanningBatchService {
  private readonly inFlightContentScripts = new Set<string>();
  constructor(private readonly runtime: AiBatchRuntime, private readonly planning: ScenePlanningService) {}

  async prepareScenePlanBatch(contentScriptIds: readonly string[]) {
    const prepared: PreparedItem[] = [];
    const skipped: { contentScriptId: string; reason: string }[] = [];
    for (const contentScriptId of contentScriptIds) {
      if (this.inFlightContentScripts.has(contentScriptId)) { skipped.push({ contentScriptId, reason: 'Scene Plan batch generation is already in progress' }); continue; }
      try {
        const scenePlan = await this.planning.prepare(contentScriptId);
        if (scenePlan.cached) skipped.push({ contentScriptId, reason: 'Scene Plan is already current' });
        else prepared.push({ contentScriptId, customId: `scene-plan:${contentScriptId}:${scenePlan.inputHash.slice(0, 16)}`, prepared: scenePlan });
      } catch (error) {
        skipped.push({ contentScriptId, reason: error instanceof Error ? error.message : 'Content Package is not eligible for Scene Planning' });
      }
    }
    return { prepared, skipped };
  }

  async submitScenePlanBatch(contentScriptIds: readonly string[]) {
    const { prepared, skipped } = await this.prepareScenePlanBatch(contentScriptIds);
    if (!prepared.length) return { batchId: null, submittedItemIds: [], skipped };
    const batch = await this.runtime.submit(AiTask.SCENE_PLANNING, prepared.map((item) => ({
      customId: item.customId, projectId: item.prepared.projectId, entityType: 'content_script', entityId: item.contentScriptId,
      systemPrompt: SCENE_PLANNING_SYSTEM_PROMPT, input: this.planning.runtimeInput(item.prepared), promptHash: item.prepared.inputHash,
    })));
    if (!batch) throw new Error('Unable to submit Scene Planning batch');
    prepared.forEach((item) => this.inFlightContentScripts.add(item.contentScriptId));
    return { batchId: batch.id, submittedItemIds: prepared.map((item) => item.contentScriptId), skipped };
  }

  async consumeCompletedScenePlanBatch(batchId: string) {
    let synced: Awaited<ReturnType<AiBatchRuntime['syncBatchStatus']>>;
    try { synced = await this.runtime.syncBatchStatus(batchId); }
    catch (error) { if (error instanceof Error && error.message === 'Batch not found') throw new NotFoundException('Scene Planning batch not found'); throw error; }
    const results = synced && 'results' in synced ? synced.results : undefined;
    if (!synced || synced.status !== AiBatchStatus.COMPLETED || !results) return { batchId, processed: 0, succeeded: 0, failed: 0 };
    const items = new Map((synced.items ?? []).filter((item) => item.entityType === 'content_script').map((item) => [item.customId, item]));
    let succeeded = 0; let failed = 0;
    for (const result of results) {
      const item = items.get(result.customId);
      if (!item || item.status === AiBatchItemStatus.COMPLETED || item.status === AiBatchItemStatus.FAILED) continue;
      try {
        const prepared = await this.planning.prepare(item.entityId);
        if (prepared.cached || prepared.inputHash !== item.promptHash || result.status === 'failed') throw new Error('Scene Plan batch item cannot be completed');
        await this.planning.persistPrepared(prepared, result.output, AiExecutionMode.BATCH);
        await this.runtime.completeItems(batchId, [{ customId: item.customId, status: AiBatchItemStatus.COMPLETED, inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens }]);
        this.inFlightContentScripts.delete(item.entityId);
        succeeded++;
      } catch {
        await this.runtime.completeItems(batchId, [{ customId: item.customId, status: AiBatchItemStatus.FAILED, errorCategory: result.status === 'failed' ? result.errorCategory ?? 'provider_failure' : 'output_validation', errorCode: result.status === 'failed' ? result.errorCode ?? null : null, inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens }]);
        const prepared = await this.safePrepare(item.entityId);
        if (prepared) await this.planning.persistBatchFailure(prepared, result.status === 'failed' ? 'provider_failure' : 'output_validation');
        this.inFlightContentScripts.delete(item.entityId);
        failed++;
      }
    }
    return { batchId, processed: succeeded + failed, succeeded, failed };
  }

  private async safePrepare(contentScriptId: string) { try { return await this.planning.prepare(contentScriptId); } catch { return null; } }
}
