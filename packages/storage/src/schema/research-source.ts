import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const researchSources = sqliteTable('research_sources', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  name: text('name').notNull(),
  sourceType: text('source_type').notNull(),
  role: text('role').notNull().default('both'),
  url: text('url').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export type ResearchSource = typeof researchSources.$inferSelect;
export type NewResearchSource = typeof researchSources.$inferInsert;
