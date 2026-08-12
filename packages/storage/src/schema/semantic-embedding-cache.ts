import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/** Exact deterministic candidate embeddings, scoped by project and model identity. */
export const semanticEmbeddingCache = sqliteTable('semantic_embedding_cache', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  candidateHash: text('candidate_hash').notNull(),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  modelVersion: text('model_version').notNull(),
  dimensions: integer('dimensions').notNull(),
  vectorJson: text('vector_json').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('semantic_embedding_cache_identity_unique').on(
    table.projectId,
    table.candidateHash,
    table.provider,
    table.model,
    table.modelVersion,
    table.dimensions,
  ),
  index('semantic_embedding_cache_project_idx').on(table.projectId),
]);

export type SemanticEmbeddingCacheEntry = typeof semanticEmbeddingCache.$inferSelect;
export type NewSemanticEmbeddingCacheEntry = typeof semanticEmbeddingCache.$inferInsert;
