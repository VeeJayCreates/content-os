import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const agentRuns = sqliteTable('agent_runs', {
  id: text('id').primaryKey(),
  agentKey: text('agent_key').notNull(),
  projectId: text('project_id'),
  subjectType: text('subject_type'),
  subjectId: text('subject_id'),
  status: text('status').notNull(),
  currentActivity: text('current_activity'),
  stateJson: text('state_json').notNull().default('{}'),
  startedAt: text('started_at'),
  completedAt: text('completed_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('agent_runs_project_updated_at_idx').on(table.projectId, table.updatedAt),
  index('agent_runs_agent_status_updated_at_idx').on(table.agentKey, table.status, table.updatedAt),
  index('agent_runs_subject_idx').on(table.subjectType, table.subjectId),
]);

export const agentActivities = sqliteTable('agent_activities', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull().references(() => agentRuns.id, { onDelete: 'cascade' }),
  sequence: integer('sequence').notNull(),
  type: text('type').notNull(),
  message: text('message').notNull(),
  stateJson: text('state_json'),
  createdAt: text('created_at').notNull(),
}, (table) => [
  uniqueIndex('agent_activities_run_sequence_uq').on(table.runId, table.sequence),
  index('agent_activities_run_created_at_idx').on(table.runId, table.createdAt),
]);

export type AgentRunRecord = typeof agentRuns.$inferSelect;
export type AgentActivityRecord = typeof agentActivities.$inferSelect;
