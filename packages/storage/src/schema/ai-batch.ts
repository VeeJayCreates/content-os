import { integer, sqliteTable, text, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

export const aiBatches = sqliteTable('ai_batches', {
  id: text('id').primaryKey(),
  provider: text('provider').notNull(),
  providerBatchId: text('provider_batch_id'),
  task: text('task').notNull(),
  model: text('model'),
  executionMode: text('execution_mode').notNull(),
  status: text('status').notNull(),
  requestCount: integer('request_count').notNull(),
  submittedAt: text('submitted_at'),
  completedAt: text('completed_at'),
  failedAt: text('failed_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [uniqueIndex('ai_batches_provider_batch_unique').on(table.provider, table.providerBatchId), index('ai_batches_status_idx').on(table.status)]);

export const aiBatchItems = sqliteTable('ai_batch_items', {
  id: text('id').primaryKey(),
  batchId: text('batch_id').notNull(),
  customId: text('custom_id').notNull(),
  projectId: text('project_id'),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  requestIndex: integer('request_index').notNull(),
  promptHash: text('prompt_hash').notNull(),
  status: text('status').notNull(),
  errorCategory: text('error_category'),
  errorCode: text('error_code'),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  estimatedCostMicrounits: integer('estimated_cost_microunits'),
  costCurrency: text('cost_currency'),
  pricingVersion: text('pricing_version'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [uniqueIndex('ai_batch_items_batch_custom_unique').on(table.batchId, table.customId), index('ai_batch_items_project_idx').on(table.projectId)]);

export type AiBatch = typeof aiBatches.$inferSelect;
export type AiBatchItem = typeof aiBatchItems.$inferSelect;
