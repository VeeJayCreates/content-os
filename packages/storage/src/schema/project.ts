import { sqliteTable,text } from 'drizzle-orm/sqlite-core';

export const projects = sqliteTable('projects',{
  id:text('id').primaryKey(),
  name:text('name').notNull(),
  contentType:text('content_type').notNull(),
  status:text('status').notNull(),
  createdAt:text('created_at').notNull(),
  updatedAt:text('updated_at').notNull(),
});
