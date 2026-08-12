import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/** Persistent guard against repeating an unchanged bounded expansion plan. */
export const researchExpansionStates = sqliteTable('research_expansion_states', {
  id: text('id').primaryKey(),
  opportunityId: text('opportunity_id').notNull(),
  inputHash: text('input_hash').notNull(),
  attemptCount: integer('attempt_count').notNull(),
  lastStatus: text('last_status').notNull(),
  lastRunAt: text('last_run_at').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [uniqueIndex('research_expansion_states_opportunity_unique').on(table.opportunityId)]);
export type ResearchExpansionState = typeof researchExpansionStates.$inferSelect;
