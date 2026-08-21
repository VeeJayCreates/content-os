import { index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const agentTasks = sqliteTable('agent_tasks', {
  id: text('id').primaryKey(), projectId: text('project_id').notNull(), stage: text('stage').notNull(),
  agentKey: text('agent_key').notNull(), sourceType: text('source_type').notNull(), sourceId: text('source_id').notNull(),
  status: text('status').notNull(), sourceStatus: text('source_status').notNull(), createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(),
}, (table) => [uniqueIndex('agent_tasks_stage_source_uq').on(table.stage, table.sourceType, table.sourceId), index('agent_tasks_project_stage_idx').on(table.projectId, table.stage)]);

export const agentTaskEvents = sqliteTable('agent_task_events', {
  id: text('id').primaryKey(), taskId: text('task_id').notNull().references(() => agentTasks.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), sourceType: text('source_type').notNull(), sourceId: text('source_id').notNull(),
  sourceStatus: text('source_status').notNull(), occurredAt: text('occurred_at').notNull(),
}, (table) => [uniqueIndex('agent_task_events_source_status_uq').on(table.taskId, table.type, table.sourceType, table.sourceId, table.sourceStatus, table.occurredAt), index('agent_task_events_task_idx').on(table.taskId, table.occurredAt)]);

export const agentHandoffs = sqliteTable('agent_handoffs', {
  id: text('id').primaryKey(), fromTaskId: text('from_task_id').notNull().references(() => agentTasks.id, { onDelete: 'cascade' }),
  toTaskId: text('to_task_id').notNull().references(() => agentTasks.id, { onDelete: 'cascade' }), sourceType: text('source_type').notNull(),
  sourceId: text('source_id').notNull(), createdAt: text('created_at').notNull(),
}, (table) => [uniqueIndex('agent_handoffs_tasks_source_uq').on(table.fromTaskId, table.toTaskId, table.sourceType, table.sourceId)]);

export type AgentTaskRecord = typeof agentTasks.$inferSelect;
export type AgentTaskEventRecord = typeof agentTaskEvents.$inferSelect;
export type AgentHandoffRecord = typeof agentHandoffs.$inferSelect;
