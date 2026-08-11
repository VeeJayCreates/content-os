import { integer, sqliteTable, text, index } from 'drizzle-orm/sqlite-core';

export const aiExecutions = sqliteTable('ai_executions', {
  id: text('id').primaryKey(),
  projectId: text('project_id'),
  task: text('task').notNull(),
  provider: text('provider').notNull(),
  model: text('model'),
  capability: text('capability').notNull(),
  status: text('status').notNull(),
  startedAt: text('started_at').notNull(),
  completedAt: text('completed_at'),
  latencyMs: integer('latency_ms'),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  totalTokens: integer('total_tokens'),
  estimatedCostMicrounits: integer('estimated_cost_microunits'),
  costCurrency: text('cost_currency'),
  pricingVersion: text('pricing_version'),
  cacheHit: integer('cache_hit', { mode: 'boolean' }).notNull().default(false),
  providerCallMade: integer('provider_call_made', { mode: 'boolean' }).notNull().default(true),
  failureCategory: text('failure_category'),
  failureCode: text('failure_code'),
  providerRequestId: text('provider_request_id'),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('ai_executions_project_created_at_idx').on(table.projectId, table.createdAt),
  index('ai_executions_task_created_at_idx').on(table.task, table.createdAt),
  index('ai_executions_provider_model_created_at_idx').on(table.provider, table.model, table.createdAt),
]);

export type AiExecution = typeof aiExecutions.$inferSelect;
export type NewAiExecution = typeof aiExecutions.$inferInsert;
