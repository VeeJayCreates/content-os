import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const opportunities = sqliteTable('opportunities', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  clusterKey: text('cluster_key').notNull(),
  title: text('title').notNull(),
  representativeUrl: text('representative_url').notNull(),
  summary: text('summary'),
  status: text('status').notNull(),
  score: integer('score').notNull(),
  signalCount: integer('signal_count').notNull(),
  sourceCount: integer('source_count').notNull(),
  firstSeenAt: text('first_seen_at').notNull(),
  lastSeenAt: text('last_seen_at').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [uniqueIndex('opportunities_project_cluster_key_unique').on(table.projectId, table.clusterKey)]);

export type Opportunity = typeof opportunities.$inferSelect;
export type NewOpportunity = typeof opportunities.$inferInsert;

export const opportunitySignals = sqliteTable('opportunity_signals', {
  opportunityId: text('opportunity_id').notNull(),
  signalId: text('signal_id').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [uniqueIndex('opportunity_signals_opportunity_signal_unique').on(table.opportunityId, table.signalId)]);
