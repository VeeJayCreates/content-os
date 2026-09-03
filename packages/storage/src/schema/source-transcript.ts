import { index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/** The complete, immutable transcript is authoritative; evidence windows are derived. */
export const sourceTranscripts = sqliteTable('source_transcripts', {
  id: text('id').primaryKey(),
  signalId: text('signal_id').notNull(),
  researchSourceId: text('research_source_id').notNull(),
  sourceUrl: text('source_url').notNull(),
  content: text('content').notNull(),
  segments: text('segments_json', { mode: 'json' }).$type<Array<{ text: string; startMs: number; endMs: number }>>().notNull(),
  language: text('language'),
  durationMs: text('duration_ms'),
  firstTimestampMs: text('first_timestamp_ms'),
  lastTimestampMs: text('last_timestamp_ms'),
  segmentCount: text('segment_count').notNull(),
  contentHash: text('content_hash').notNull(),
  provider: text('provider').notNull(),
  acquisitionMethod: text('acquisition_method').notNull(),
  status: text('status').notNull(),
  version: text('version').notNull(),
  acquiredAt: text('acquired_at').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('source_transcripts_signal_version_unique').on(table.signalId, table.version),
  index('source_transcripts_signal_idx').on(table.signalId),
]);

export type SourceTranscript = typeof sourceTranscripts.$inferSelect;
export type NewSourceTranscript = typeof sourceTranscripts.$inferInsert;
