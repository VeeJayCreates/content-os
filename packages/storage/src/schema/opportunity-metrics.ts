import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const opportunityMetrics = sqliteTable(
  'opportunity_metrics',
  {
    id: text('id').primaryKey(),
    opportunityId: text('opportunity_id').notNull(),
    scoreVersion: text('score_version').notNull(),
    opportunityScore: integer('opportunity_score').notNull(),
    freshnessScore: integer('freshness_score').notNull(),
    supportScore: integer('support_score').notNull(),
    sourceDiversityScore: integer('source_diversity_score').notNull(),
    confirmationScore: integer('confirmation_score').notNull(),
    momentumScore: integer('momentum_score').notNull(),
    persistenceScore: integer('persistence_score').notNull(),
    signalCount: integer('signal_count').notNull(),
    independentSourceCount: integer('independent_source_count').notNull(),
    sourceTypeCount: integer('source_type_count').notNull(),
    firstSeenAt: text('first_seen_at').notNull(),
    lastSeenAt: text('last_seen_at').notNull(),
    calculatedAt: text('calculated_at').notNull(),
    inputHash: text('input_hash').notNull(),
  },
  (table) => [
    uniqueIndex('opportunity_metrics_opportunity_version_unique').on(
      table.opportunityId,
      table.scoreVersion,
    ),
  ],
);

export type OpportunityMetric = typeof opportunityMetrics.$inferSelect;
export type NewOpportunityMetric = typeof opportunityMetrics.$inferInsert;
