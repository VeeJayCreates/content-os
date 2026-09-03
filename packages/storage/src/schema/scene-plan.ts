import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const scenePlans = sqliteTable('scene_plans', {
  id: text('id').primaryKey(), projectId: text('project_id').notNull(), contentScriptId: text('content_script_id').notNull(),
  status: text('status').notNull(), version: text('version').notNull(), totalEstimatedDurationMs: integer('total_estimated_duration_ms').notNull(), sceneCount: integer('scene_count').notNull(),
  provider: text('provider'), model: text('model'), executionMode: text('execution_mode').notNull(), promptVersion: text('prompt_version').notNull(), inputHash: text('input_hash').notNull(),
  failureCode: text('failure_code'), failureReason: text('failure_reason'), createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(),
}, (table) => [uniqueIndex('scene_plans_content_script_unique').on(table.contentScriptId)]);

export const plannedScenes = sqliteTable('planned_scenes', {
  id: text('id').primaryKey(), scenePlanId: text('scene_plan_id').notNull(), sceneIndex: integer('scene_index').notNull(), narration: text('narration').notNull(), narrationWordCount: integer('narration_word_count').notNull(),
  estimatedDurationMs: integer('estimated_duration_ms').notNull(), startEstimateMs: integer('start_estimate_ms').notNull(), endEstimateMs: integer('end_estimate_ms').notNull(), sceneType: text('scene_type').notNull(),
  mediaStrategy: text('media_strategy').notNull(), visualDescription: text('visual_description').notNull(), primarySearchQuery: text('primary_search_query'), alternateSearchQueries: text('alternate_search_queries', { mode: 'json' }).$type<string[]>().notNull(),
  generatedMediaPrompt: text('generated_media_prompt'), onScreenText: text('on_screen_text'), subtitleText: text('subtitle_text').notNull(), citedFactIds: text('cited_fact_ids', { mode: 'json' }).$type<string[]>().notNull(), geographicEntityIds: text('geographic_entity_ids_json', { mode: 'json' }).$type<string[]>().notNull().default([]),
  transitionRecommendation: text('transition_recommendation'), continuityNotes: text('continuity_notes'), manualReview: integer('manual_review', { mode: 'boolean' }).notNull(), manualReviewReason: text('manual_review_reason'),
  createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(),
}, (table) => [uniqueIndex('planned_scenes_plan_index_unique').on(table.scenePlanId, table.sceneIndex)]);

export type ScenePlanRecord = typeof scenePlans.$inferSelect;
export type NewScenePlan = typeof scenePlans.$inferInsert;
export type PlannedSceneRecord = typeof plannedScenes.$inferSelect;
export type NewPlannedScene = typeof plannedScenes.$inferInsert;
