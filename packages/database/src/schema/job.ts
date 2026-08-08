import { sqliteTable,text,integer,real } from 'drizzle-orm/sqlite-core';

export const jobs = sqliteTable('jobs',{
  id:text('id').primaryKey(),
  workflowId:text('workflow_id').notNull(),
  type:text('type').notNull(),
  status:text('status').notNull(),
  retries:integer('retries').default(0).notNull(),
  cost:real('cost'),
});
