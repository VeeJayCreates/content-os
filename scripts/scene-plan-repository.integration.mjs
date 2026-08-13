import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const requireFromStorage = createRequire(new URL('../packages/storage/package.json', import.meta.url));
const Database = requireFromStorage('better-sqlite3');

let temporaryDirectory;
let closeStorageConnection;

const plan = (contentScriptId, projectId, inputHash, status = 'ready') => ({
  projectId, contentScriptId, status, version: 'scene-plan-v1', totalEstimatedDurationMs: 5_000, sceneCount: status === 'ready' ? 2 : 0,
  provider: 'test-provider', model: 'test-model', executionMode: 'synchronous', promptVersion: 'scene-planning-v1', inputHash, failureCode: status === 'failed' ? 'generation_failed' : null, failureReason: status === 'failed' ? 'Scene Plan generation failed' : null,
});
const scene = (id, narration, startEstimateMs) => ({
  id, narration, narrationWordCount: 3, estimatedDurationMs: 2_500, startEstimateMs, endEstimateMs: startEstimateMs + 2_500,
  sceneType: 'b_roll', mediaStrategy: 'stock_or_source_footage', visualDescription: 'Grounded visual.', primarySearchQuery: null, alternateSearchQueries: [], generatedMediaPrompt: null, onScreenText: null, subtitleText: narration, citedFactIds: ['fact-1'], transitionRecommendation: null, continuityNotes: null, manualReview: false, manualReviewReason: null,
});

try {
  temporaryDirectory = await mkdtemp(join(tmpdir(), 'content-os-scene-plan-'));
  const databasePath = join(temporaryDirectory, 'scene-plan.db');
  process.env.DATABASE_URL = databasePath;
  const bootstrap = new Database(databasePath);
  bootstrap.exec(`
    CREATE TABLE scene_plans (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, content_script_id TEXT NOT NULL, status TEXT NOT NULL, version TEXT NOT NULL, total_estimated_duration_ms INTEGER NOT NULL, scene_count INTEGER NOT NULL, provider TEXT, model TEXT, execution_mode TEXT NOT NULL, prompt_version TEXT NOT NULL, input_hash TEXT NOT NULL, failure_code TEXT, failure_reason TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE UNIQUE INDEX scene_plans_content_script_unique ON scene_plans(content_script_id);
    CREATE TABLE planned_scenes (id TEXT PRIMARY KEY, scene_plan_id TEXT NOT NULL, scene_index INTEGER NOT NULL, narration TEXT NOT NULL, narration_word_count INTEGER NOT NULL, estimated_duration_ms INTEGER NOT NULL, start_estimate_ms INTEGER NOT NULL, end_estimate_ms INTEGER NOT NULL, scene_type TEXT NOT NULL, media_strategy TEXT NOT NULL, visual_description TEXT NOT NULL, primary_search_query TEXT, alternate_search_queries TEXT NOT NULL, generated_media_prompt TEXT, on_screen_text TEXT, subtitle_text TEXT NOT NULL, cited_fact_ids TEXT NOT NULL, transition_recommendation TEXT, continuity_notes TEXT, manual_review INTEGER NOT NULL, manual_review_reason TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE UNIQUE INDEX planned_scenes_plan_index_unique ON planned_scenes(scene_plan_id, scene_index);
  `);
  bootstrap.close();

  const { ScenePlanRepository } = await import('../packages/storage/dist/repositories/scene-plan.repository.js');
  ({ closeStorageConnection } = await import('../packages/storage/dist/db.js'));
  const repository = new ScenePlanRepository();

  await repository.upsert(plan('script-a', 'project-a', 'hash-one'), [scene('scene-two', 'Second scene.', 2_500), scene('scene-one', 'First scene.', 0)]);
  const initial = await repository.findByContentScriptId('script-a');
  assert.equal(initial?.status, 'ready');
  assert.deepEqual(initial?.scenes.map((item) => item.narration), ['Second scene.', 'First scene.']);
  assert.equal(initial?.scenes[0]?.startEstimateMs, 2500);
  assert.equal(initial?.projectId, 'project-a');
  assert.equal(initial?.inputHash, 'hash-one');
  assert.notEqual(initial?.inputHash, 'hash-two');

  await repository.upsert(plan('script-a', 'project-a', 'hash-two'), [scene('scene-replacement', 'Replacement scene.', 0)]);
  const replaced = await repository.findByContentScriptId('script-a');
  assert.deepEqual(replaced?.scenes.map((item) => item.id), ['scene-replacement']);
  assert.equal(replaced?.inputHash, 'hash-two');

  await repository.upsert(plan('script-a', 'project-a', 'hash-failed', 'failed'), []);
  assert.equal((await repository.findByContentScriptId('script-a'))?.scenes.length, 0);
  await repository.upsert(plan('script-a', 'project-a', 'hash-retry'), [scene('scene-retry', 'Retry succeeds.', 0)]);
  assert.equal((await repository.findByContentScriptId('script-a'))?.status, 'ready');

  await repository.upsert(plan('script-b', 'project-b', 'hash-project-b'), [scene('scene-b', 'Other project.', 0)]);
  assert.equal((await repository.findByContentScriptId('script-b'))?.projectId, 'project-b');
  assert.equal(await repository.findByContentScriptId('missing-script'), undefined);

  const beforeRollback = await repository.findByContentScriptId('script-a');
  await assert.rejects(repository.upsert(plan('script-a', 'project-a', 'hash-broken'), [scene('duplicate-scene', 'One.', 0), scene('duplicate-scene', 'Two.', 1_000)]));
  const afterRollback = await repository.findByContentScriptId('script-a');
  assert.equal(afterRollback?.inputHash, beforeRollback?.inputHash);
  assert.deepEqual(afterRollback?.scenes.map((item) => item.id), beforeRollback?.scenes.map((item) => item.id));

  console.log('SCENE_PLAN_REPOSITORY_INTEGRATION=PASS');
} finally {
  closeStorageConnection?.();
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
