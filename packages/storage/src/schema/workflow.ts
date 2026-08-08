import { sqliteTable,text } from 'drizzle-orm/sqlite-core';

export const workflows = sqliteTable('workflows',{
  id:text('id').primaryKey(),
  projectId:text('project_id').notNull(),
  status:text('status').notNull(),
  createdAt:text('created_at').notNull(),
});
