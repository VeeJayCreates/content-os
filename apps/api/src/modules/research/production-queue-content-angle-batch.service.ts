import { Injectable } from '@nestjs/common';
import { AiBatchItemStatus, AiBatchStatus, AiTask, ProductionQueueStatus } from '@content-os/contracts';
import { ProductionQueueRepository } from '@content-os/storage';
import { AiBatchRuntime } from '../ai/ai-batch-runtime.service';
import { EDITORIAL_ASSESSMENT_SYSTEM_PROMPT } from './editorial-assessment.evaluator';
import { EditorialAssessmentService, type PreparedEditorialAssessment } from './editorial-assessment.service';
import { ProductionQueueContentAngleService } from './production-queue-content-angle.service';

type PreparedItem = { queueItemId: string; customId: string; prepared: PreparedEditorialAssessment };

@Injectable()
export class ProductionQueueContentAngleBatchService {
  constructor(private readonly runtime: AiBatchRuntime, private readonly queue: ProductionQueueRepository, private readonly angles: ProductionQueueContentAngleService, private readonly editorial: EditorialAssessmentService) {}

  async prepareContentAngleBatch(queueItemIds: readonly string[]) {
    const prepared: PreparedItem[] = [];
    const skipped: { queueItemId: string; reason: string }[] = [];
    for (const queueItemId of queueItemIds) {
      try {
        const context = await this.angles.resolveEligibleContext(queueItemId);
        const assessment = await this.editorial.prepareWithPackage(context.opportunity, context.item.researchPackageId);
        if (assessment.cached) { skipped.push({ queueItemId, reason: 'Content Angle is already current' }); continue; }
        prepared.push({ queueItemId, customId: `content-angle:${queueItemId}:${assessment.inputHash.slice(0, 16)}`, prepared: assessment });
      } catch (error) { skipped.push({ queueItemId, reason: error instanceof Error ? error.message : 'Queue item is not eligible for Content Angle generation' }); }
    }
    return { prepared, skipped };
  }

  async submitContentAngleBatch(queueItemIds: readonly string[]) {
    const { prepared, skipped } = await this.prepareContentAngleBatch(queueItemIds);
    if (!prepared.length) return { batchId: null, submittedItemIds: [], skipped };
    const batch = await this.runtime.submit(AiTask.CONTENT_ANGLE, prepared.map((item) => ({
      customId: item.customId,
      projectId: item.prepared.opportunity.projectId,
      entityType: 'production_queue_item',
      entityId: item.queueItemId,
      systemPrompt: EDITORIAL_ASSESSMENT_SYSTEM_PROMPT,
      input: item.prepared.input,
      promptHash: item.prepared.inputHash,
    })));
    if (!batch) throw new Error('Unable to submit Content Angle batch');
    await Promise.all(prepared.map((item) => this.queue.updateStatus(item.queueItemId, ProductionQueueStatus.PROCESSING)));
    return { batchId: batch.id, submittedItemIds: prepared.map((item) => item.queueItemId), skipped };
  }

  async consumeCompletedContentAngleBatch(batchId: string) {
    const synced = await this.runtime.syncBatchStatus(batchId);
    const results = synced && 'results' in synced ? synced.results : undefined;
    if (!synced || synced.status !== AiBatchStatus.COMPLETED || !results) return { batchId, processed: 0, succeeded: 0, failed: 0 };
    const itemsByCustomId = new Map((synced.items ?? []).filter((item) => item.entityType === 'production_queue_item').map((item) => [item.customId, item]));
    let succeeded = 0; let failed = 0;
    for (const result of results) {
      const item = itemsByCustomId.get(result.customId);
      if (!item || item.status === AiBatchItemStatus.COMPLETED || item.status === AiBatchItemStatus.FAILED) continue;
      if (result.status === 'failed') {
        await this.fail(batchId, item.customId, item.entityId, result.errorCategory ?? 'provider_failure', result.errorCode ?? null, result.usage.inputTokens, result.usage.outputTokens); failed++; continue;
      }
      try {
        const context = await this.angles.resolveEligibleContext(item.entityId);
        const prepared = await this.editorial.prepareWithPackage(context.opportunity, context.item.researchPackageId);
        if (prepared.inputHash !== item.promptHash) throw new Error('Queued Content Angle input changed before batch completion');
        await this.editorial.persistPreparedAssessment(prepared, result.output);
        await this.runtime.completeItems(batchId, [{ customId: item.customId, status: AiBatchItemStatus.COMPLETED, inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens }]);
        succeeded++;
      } catch (error) {
        await this.fail(batchId, item.customId, item.entityId, 'output_validation', null, result.usage.inputTokens, result.usage.outputTokens);
        failed++;
      }
    }
    return { batchId, processed: succeeded + failed, succeeded, failed };
  }

  private async fail(batchId: string, customId: string, queueItemId: string, category: string, code: string | null, inputTokens: number | null, outputTokens: number | null) {
    await this.runtime.completeItems(batchId, [{ customId, status: AiBatchItemStatus.FAILED, errorCategory: category, errorCode: code, inputTokens, outputTokens }]);
    await this.queue.updateStatus(queueItemId, ProductionQueueStatus.FAILED);
  }
}
