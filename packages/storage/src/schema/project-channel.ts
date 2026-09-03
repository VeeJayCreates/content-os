import { index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const productProfiles = sqliteTable('product_profiles', {
  projectId: text('project_id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  targetAudience: text('target_audience'),
  valueProposition: text('value_proposition'),
  primaryUrl: text('primary_url'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const contentChannels = sqliteTable(
  'content_channels',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    niche: text('niche'),
    status: text('status').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('content_channels_project_slug_unique').on(
      table.projectId,
      table.slug,
    ),
    index('content_channels_project_idx').on(table.projectId),
  ],
);

export type ProductProfile = typeof productProfiles.$inferSelect;
export type NewProductProfile = typeof productProfiles.$inferInsert;
export type ContentChannel = typeof contentChannels.$inferSelect;
export type NewContentChannel = typeof contentChannels.$inferInsert;
