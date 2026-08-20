import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const mediaAssets = sqliteTable('media_assets', {
  id: text('id').primaryKey(), mediaType: text('media_type').notNull(), mimeType: text('mime_type').notNull(),
  checksum: text('checksum').notNull(), sizeBytes: integer('size_bytes').notNull(), sourceType: text('source_type').notNull(),
  sourceId: text('source_id').notNull(), requirementId: text('requirement_id').notNull(), sourceIdentity: text('source_identity').notNull(),
  storageProvider: text('storage_provider').notNull(), storageKey: text('storage_key').notNull(), status: text('status').notNull(),
  createdAt: text('created_at').notNull(),
}, (t) => [
  uniqueIndex('media_assets_source_checksum_unique').on(t.sourceType, t.sourceIdentity, t.checksum),
]);
