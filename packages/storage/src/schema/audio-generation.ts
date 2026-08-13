import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const audioGenerations = sqliteTable('audio_generations', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  contentScriptId: text('content_script_id').notNull(),
  scenePlanId: text('scene_plan_id').notNull(),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  modelVersion: text('model_version').notNull(),
  voiceId: text('voice_id').notNull(),
  language: text('language').notNull(),
  status: text('status').notNull(),
  inputHash: text('input_hash').notNull(),
  totalDurationMs: integer('total_duration_ms'),
  outputPath: text('output_path'),
  outputMetadata: text('output_metadata', { mode: 'json' }).$type<Record<string, unknown> | null>(),
  failureCode: text('failure_code'),
  failureReason: text('failure_reason'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('audio_generations_content_script_unique').on(table.contentScriptId),
  uniqueIndex('audio_generations_project_input_unique').on(table.projectId, table.inputHash),
]);

export const audioSegments = sqliteTable('audio_segments', {
  id: text('id').primaryKey(),
  audioGenerationId: text('audio_generation_id').notNull(),
  sceneId: text('scene_id').notNull(),
  sceneIndex: integer('scene_index').notNull(),
  narration: text('narration').notNull(),
  language: text('language').notNull(),
  actualDurationMs: integer('actual_duration_ms'),
  startMs: integer('start_ms'),
  endMs: integer('end_ms'),
  audioPath: text('audio_path'),
  voiceDirection: text('voice_direction', { mode: 'json' }).$type<object>().notNull(),
  status: text('status').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [uniqueIndex('audio_segments_generation_scene_unique').on(table.audioGenerationId, table.sceneIndex)]);

export type AudioGenerationRecord = typeof audioGenerations.$inferSelect;
export type NewAudioGeneration = typeof audioGenerations.$inferInsert;
export type AudioSegmentRecord = typeof audioSegments.$inferSelect;
export type NewAudioSegment = typeof audioSegments.$inferInsert;
