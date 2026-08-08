import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const content = sqliteTable('content', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  title: text('title').notNull(),
  contentType: text('content_type').notNull(),
  status: text('status').notNull(),
  body: text('body').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export type Content = typeof content.$inferSelect;
export type NewContent = typeof content.$inferInsert;
