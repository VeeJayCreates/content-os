import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** One bounded, project-scoped research-loop checkpoint. */
export const researchAutomationRuns = sqliteTable('research_automation_runs', {
  projectId: text('project_id').primaryKey(),
  status: text('status').$type<'idle' | 'running' | 'completed' | 'failed'>().notNull(),
  lastRunAt: text('last_run_at'),
  nextRunAt: text('next_run_at'),
  opportunitiesProcessed: integer('opportunities_processed').notNull().default(0),
  providerFailures: integer('provider_failures').notNull().default(0),
  warnings: text('warnings_json', { mode: 'json' }).$type<string[]>().notNull().default([]),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});
export type ResearchAutomationRun = typeof researchAutomationRuns.$inferSelect;
