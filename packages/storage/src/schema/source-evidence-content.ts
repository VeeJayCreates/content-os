import { sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const sourceEvidenceContents = sqliteTable('source_evidence_contents', {
  id: text('id').primaryKey(), signalId: text('signal_id').notNull(), researchSourceId: text('research_source_id').notNull(), sourceUrl: text('source_url').notNull(), contentType: text('content_type').notNull(), content: text('content'), language: text('language'), locator: text('locator_json', { mode: 'json' }).$type<Record<string, unknown> | null>(), sourcePublishedAt: text('source_published_at'), acquiredAt: text('acquired_at').notNull(), contentHash: text('content_hash').notNull(), acquisitionMethod: text('acquisition_method').notNull(), provenance: text('provenance_json', { mode: 'json' }).$type<Record<string, unknown>>().notNull().default({}), status: text('status').notNull(), version: text('version').notNull(), createdAt: text('created_at').notNull(),
}, (table) => [uniqueIndex('source_evidence_contents_signal_type_hash_version_unique').on(table.signalId, table.contentType, table.contentHash, table.version)]);

export type SourceEvidenceContent = typeof sourceEvidenceContents.$inferSelect;
export type NewSourceEvidenceContent = typeof sourceEvidenceContents.$inferInsert;
