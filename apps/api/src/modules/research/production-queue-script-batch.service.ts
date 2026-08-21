import { Inject, Injectable, Optional } from '@nestjs/common';
import { AiBatchItemStatus, AiBatchStatus, AiExecutionMode, AiTask, ProductionQueueStatus } from '@content-os/contracts';
import { ProductionQueueRepository } from '@content-os/storage';
import { AiBatchRuntime } from '../ai/ai-batch-runtime.service';
import { AGENT_PIPELINE_BRIDGE, observeAgentPipeline, type AgentPipelineBridge } from '../agent-runtime/agent-pipeline-bridge.token';
import { SCRIPT_GENERATION_SYSTEM_PROMPT, ScriptGenerationService, type PreparedScriptGeneration } from './script-generation.service';

type PreparedItem = { queueItemId: string; customId: string; prepared: PreparedScriptGeneration };

@Injectable()
export class ProductionQueueScriptBatchService {
  constructor(private readonly runtime: AiBatchRuntime, private readonly queue: ProductionQueueRepository, private readonly scripts: ScriptGenerationService, @Optional() @Inject(AGENT_PIPELINE_BRIDGE) private readonly agentPipeline?: AgentPipelineBridge) {}

  async prepareScriptBatch(queueItemIds: readonly string[]) {
    const prepared: PreparedItem[] = [];
    const skipped: { queueItemId: string; reason: string }[] = [];
    for (const queueItemId of queueItemIds) {
      try {
        const script = await this.scripts.prepare(queueItemId);
        if (script.cached) skipped.push({ queueItemId, reason: 'Script is already current' });
        else prepared.push({ queueItemId, customId: `content-package:${queueItemId}:${script.inputHash.slice(0, 16)}`, prepared: script });
      } catch (error) {
        skipped.push({ queueItemId, reason: error instanceof Error ? error.message : 'Queue item is not eligible for script generation' });
      }
    }
    return { prepared, skipped };
  }

  async submitScriptBatch(queueItemIds: readonly string[]) {
    const { prepared, skipped } = await this.prepareScriptBatch(queueItemIds);
    if (!prepared.length) return { batchId: null, submittedItemIds: [], skipped };
    const batch = await this.runtime.submit(AiTask.CONTENT_PACKAGE_GENERATION, prepared.map((item) => ({
      customId: item.customId,
      projectId: item.prepared.projectId,
      entityType: 'production_queue_item',
      entityId: item.queueItemId,
      systemPrompt: SCRIPT_GENERATION_SYSTEM_PROMPT,
      input: item.prepared.input,
      promptHash: item.prepared.inputHash,
    })));
    if (!batch) throw new Error('Unable to submit script batch');
    await Promise.all(prepared.map(async (item) => {
      await this.queue.updateStatus(item.queueItemId, ProductionQueueStatus.PROCESSING);
      await observeAgentPipeline(this.agentPipeline?.synchronize(item.queueItemId));
    }));
    return { batchId: batch.id, submittedItemIds: prepared.map((item) => item.queueItemId), skipped };
  }

  async consumeCompletedScriptBatch(batchId: string) {
    const synced = await this.runtime.syncBatchStatus(batchId);
    const results = synced && 'results' in synced ? synced.results : undefined;
    if (!synced || synced.status !== AiBatchStatus.COMPLETED || !results) return { batchId, processed: 0, succeeded: 0, failed: 0 };
    const items = new Map((synced.items ?? []).filter((item) => item.entityType === 'production_queue_item').map((item) => [item.customId, item]));
    let succeeded = 0;
    let failed = 0;
    for (const result of results) {
      const item = items.get(result.customId);
      if (!item || item.status === AiBatchItemStatus.COMPLETED || item.status === AiBatchItemStatus.FAILED) continue;
      if (result.status === 'failed') {
        await this.fail(batchId, item.customId, item.entityId, result.errorCategory ?? 'provider_failure', result.errorCode ?? null, result.usage.inputTokens, result.usage.outputTokens);
        failed++;
        continue;
      }
      try {
        const prepared = await this.scripts.prepare(item.entityId);
        if (prepared.cached || prepared.inputHash !== item.promptHash) throw new Error('Queued script input changed before batch completion');
        await this.scripts.persistPrepared(prepared, result.output, AiExecutionMode.BATCH);
        await this.runtime.completeItems(batchId, [{ customId: item.customId, status: AiBatchItemStatus.COMPLETED, inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens }]);
        succeeded++;
      } catch {
        await this.fail(batchId, item.customId, item.entityId, 'output_validation', null, result.usage.inputTokens, result.usage.outputTokens);
        failed++;
      }
    }
    return { batchId, processed: succeeded + failed, succeeded, failed };
  }

  private async fail(batchId: string, customId: string, queueItemId: string, category: string, code: string | null, inputTokens: number | null, outputTokens: number | null) {
    await this.runtime.completeItems(batchId, [{ customId, status: AiBatchItemStatus.FAILED, errorCategory: category, errorCode: code, inputTokens, outputTokens }]);
    await this.queue.updateStatus(queueItemId, ProductionQueueStatus.FAILED);
    await observeAgentPipeline(this.agentPipeline?.synchronize(queueItemId));
  }
}
