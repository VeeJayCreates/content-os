import { index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/** A deterministic, candidate-level evidence fragment extracted from one Signal. */
export const topicCandidates = sqliteTable('topic_candidates', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  signalId: text('signal_id').notNull(),
  text: text('text').notNull(),
  normalizedText: text('normalized_text').notNull(),
  candidateHash: text('candidate_hash').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('topic_candidates_project_signal_hash_unique').on(table.projectId, table.signalId, table.candidateHash),
  index('topic_candidates_signal_idx').on(table.signalId),
  index('topic_candidates_project_idx').on(table.projectId),
]);

/** Additive V2 membership. Legacy opportunity_signals remains unchanged. */
export const opportunityTopicCandidates = sqliteTable('opportunity_topic_candidates', {
  opportunityId: text('opportunity_id').notNull(),
  topicCandidateId: text('topic_candidate_id').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [
  uniqueIndex('opportunity_topic_candidates_opportunity_candidate_unique').on(table.opportunityId, table.topicCandidateId),
  index('opportunity_topic_candidates_candidate_idx').on(table.topicCandidateId),
  index('opportunity_topic_candidates_opportunity_idx').on(table.opportunityId),
]);

export type TopicCandidate = typeof topicCandidates.$inferSelect;
export type NewTopicCandidate = typeof topicCandidates.$inferInsert;
