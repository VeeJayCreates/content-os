import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const projectEditorialProfiles = sqliteTable(
  'project_editorial_profiles',
  {
    projectId: text('project_id').primaryKey(),
    mission: text('mission').notNull(),
    targetAudience: text('target_audience').notNull(),
    primaryLanguage: text('primary_language').notNull(),
    primaryGeography: text('primary_geography').notNull(),
    topicThemes: text('topic_themes', { mode: 'json' }).$type<string[]>().notNull(),
    excludedTopics: text('excluded_topics', { mode: 'json' }).$type<string[]>().notNull(),
    contentGoals: text('content_goals', { mode: 'json' }).$type<string[]>().notNull(),
    preferredFormats: text('preferred_formats', { mode: 'json' }).$type<string[]>().notNull(),
    timelinessPreference: text('timeliness_preference').notNull(),
    revision: integer('revision').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
);

export type ProjectEditorialProfile =
  typeof projectEditorialProfiles.$inferSelect;
export type NewProjectEditorialProfile =
  typeof projectEditorialProfiles.$inferInsert;
