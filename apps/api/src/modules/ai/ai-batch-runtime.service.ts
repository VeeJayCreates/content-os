import { createHash } from 'node:crypto';
import { Injectable, Inject } from '@nestjs/common';
import { AiBatchItemStatus, AiBatchStatus, AiExecutionMode, AiTask } from '@content-os/contracts';
import { AiBatchRepository } from '@content-os/storage';
import { AI_PROVIDER } from './ai-runtime.service';
import { ModelRouter } from './model-router';
import type { AiBatchItemRequest, AiBatchProvider, AiProvider } from './ai-runtime.types';
import { AiRuntimeConfigurationError, AiRuntimeRequestError } from './ai-runtime.types';
import { AiCostCalculator } from './ai-cost-calculator';

export type BatchSubmissionItem = Omit<AiBatchItemRequest, 'task' | 'promptHash'> & { promptHash?: string };

@Injectable()
export class AiBatchRuntime {
  constructor(private readonly router: ModelRouter, @Inject(AI_PROVIDER) private readonly providers: AiProvider[], private readonly batches: AiBatchRepository, private readonly costs: AiCostCalculator) {}
  formationPolicy() { return { maxItems: this.bounded('AI_BATCH_MAX_ITEMS', 10, 1, 100), maxWaitMs: this.bounded('AI_BATCH_MAX_WAIT_MS', 1_800_000, 60_000, 86_400_000) }; }
  async submit(task: AiTask, items: readonly BatchSubmissionItem[]) {
    const route = this.router.route(task); if (route.provider !== 'openai-cloud' || !route.model) throw new AiRuntimeConfigurationError('Batch execution is not configured for this task');
    const policy = this.formationPolicy(); if (!items.length || items.length > policy.maxItems) throw new AiRuntimeRequestError(`Batch must contain between 1 and ${policy.maxItems} items`);
    const ids = new Set(items.map((item) => item.customId)); if (ids.size !== items.length) throw new AiRuntimeRequestError('Batch custom IDs must be unique');
    const provider = this.batchProvider(route.provider);
    const prepared = items.map((item) => ({ ...item, task, promptHash: item.promptHash ?? createHash('sha256').update(JSON.stringify({ systemPrompt: item.systemPrompt, input: item.input })).digest('hex') }));
    const batch = await this.batches.create({ provider: route.provider, providerBatchId: null, task, model: route.model, executionMode: AiExecutionMode.BATCH, status: AiBatchStatus.QUEUED, requestCount: items.length, submittedAt: null, completedAt: null, failedAt: null }, prepared.map((item, requestIndex) => ({ customId: item.customId, projectId: item.projectId, entityType: item.entityType, entityId: item.entityId, requestIndex, promptHash: item.promptHash, status: AiBatchItemStatus.QUEUED, errorCategory: null, errorCode: null, inputTokens: null, outputTokens: null, estimatedCostMicrounits: null, costCurrency: null, pricingVersion: null })));
    if (!batch) throw new AiRuntimeRequestError('Unable to persist batch');
    try { const submitted = await provider.submitBatch({ task, model: route.model, items: prepared, completionWindow: '24h' }); await this.batches.updateItems(batch.id, prepared.map((item) => ({ customId: item.customId, status: AiBatchItemStatus.SUBMITTED }))); return await this.batches.updateBatch(batch.id, { providerBatchId: submitted.providerBatchId, status: AiBatchStatus.SUBMITTED, submittedAt: new Date().toISOString() }); }
    catch (error) { await this.batches.updateBatch(batch.id, { status: AiBatchStatus.FAILED, failedAt: new Date().toISOString() }); throw error; }
  }
  async syncBatchStatus(batchId: string) {
    const batch = await this.batches.findById(batchId); if (!batch) throw new AiRuntimeRequestError('Batch not found'); if (!batch.providerBatchId) return batch;
    const provider = this.batchProvider(batch.provider); const status = await provider.getBatchStatus(batch.providerBatchId); let next = await this.batches.updateBatch(batch.id, { status: status.status, completedAt: status.status === AiBatchStatus.COMPLETED ? new Date().toISOString() : null, failedAt: status.status === AiBatchStatus.FAILED ? new Date().toISOString() : null });
    if (status.status !== AiBatchStatus.COMPLETED || !next) return next;
    const results = await provider.getBatchResults(batch.providerBatchId); const known = new Map(batch.items.map((item) => [item.customId, item])); const pricing = this.costs.pricing(batch.model ?? undefined, 'batch'); const updates = results.filter((result) => known.has(result.customId)).map((result) => result.status === 'failed' ? ({ customId: result.customId, status: AiBatchItemStatus.FAILED, errorCategory: result.errorCategory ?? null, errorCode: result.errorCode ?? null, inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens, estimatedCostMicrounits: null, costCurrency: null, pricingVersion: null }) : ({ customId: result.customId, inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens, estimatedCostMicrounits: this.costs.estimate(result.usage, pricing), costCurrency: pricing.currency, pricingVersion: pricing.version }));
    if (updates.length) next = await this.batches.updateItems(batch.id, updates); return { ...next, results };
  }
  async completeItems(batchId: string, updates: { customId: string; status: AiBatchItemStatus; errorCategory?: string | null; errorCode?: string | null; inputTokens?: number | null; outputTokens?: number | null }[]) { return this.batches.updateItems(batchId, updates); }
  private batchProvider(name: string): AiBatchProvider { const provider = this.providers.find((candidate) => candidate.name === name); if (!provider || !('submitBatch' in provider) || typeof provider.submitBatch !== 'function') throw new AiRuntimeConfigurationError('Batch provider is not configured'); return provider as AiBatchProvider; }
  private bounded(name: string, fallback: number, min: number, max: number) { const value = Number(process.env[name]); return Number.isSafeInteger(value) && value >= min && value <= max ? value : fallback; }
}
