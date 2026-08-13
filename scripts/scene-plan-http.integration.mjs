import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const apiRequire = createRequire(new URL('../apps/api/package.json', import.meta.url));
const Database = apiRequire('better-sqlite3');
const request = apiRequire('supertest');
let temporaryDirectory;
let app;
let control;

const id = (suffix) => `11111111-1111-4111-8111-${suffix.padStart(12, '0')}`;
const now = () => new Date().toISOString();

try {
  temporaryDirectory = await mkdtemp(join(tmpdir(), 'content-os-scene-http-'));
  const databasePath = join(temporaryDirectory, 'scene-http.db');
  process.env.DATABASE_URL = databasePath;
  const bootstrap = new Database(databasePath);
  bootstrap.exec(`
    CREATE TABLE content_scripts (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, opportunity_id TEXT NOT NULL, production_queue_item_id TEXT NOT NULL, research_package_id TEXT NOT NULL, editorial_assessment_id TEXT NOT NULL, format TEXT NOT NULL, language TEXT NOT NULL, target_duration_seconds INTEGER NOT NULL, target_word_count INTEGER NOT NULL, hook TEXT NOT NULL, body TEXT NOT NULL, closing TEXT NOT NULL, full_script TEXT NOT NULL, cited_fact_ids TEXT NOT NULL, primary_title TEXT NOT NULL, alternate_titles TEXT NOT NULL, description TEXT NOT NULL, tags TEXT NOT NULL, hashtags TEXT NOT NULL, keywords TEXT NOT NULL, thumbnail_text TEXT NOT NULL, thumbnail_creative_brief TEXT NOT NULL, status TEXT NOT NULL, provider TEXT, model TEXT, execution_mode TEXT NOT NULL, prompt_version TEXT NOT NULL, input_hash TEXT NOT NULL, generated_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE UNIQUE INDEX content_scripts_queue_item_unique ON content_scripts(production_queue_item_id);
    CREATE TABLE scene_plans (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, content_script_id TEXT NOT NULL, status TEXT NOT NULL, version TEXT NOT NULL, total_estimated_duration_ms INTEGER NOT NULL, scene_count INTEGER NOT NULL, provider TEXT, model TEXT, execution_mode TEXT NOT NULL, prompt_version TEXT NOT NULL, input_hash TEXT NOT NULL, failure_code TEXT, failure_reason TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE UNIQUE INDEX scene_plans_content_script_unique ON scene_plans(content_script_id);
    CREATE TABLE planned_scenes (id TEXT PRIMARY KEY, scene_plan_id TEXT NOT NULL, scene_index INTEGER NOT NULL, narration TEXT NOT NULL, narration_word_count INTEGER NOT NULL, estimated_duration_ms INTEGER NOT NULL, start_estimate_ms INTEGER NOT NULL, end_estimate_ms INTEGER NOT NULL, scene_type TEXT NOT NULL, media_strategy TEXT NOT NULL, visual_description TEXT NOT NULL, primary_search_query TEXT, alternate_search_queries TEXT NOT NULL, generated_media_prompt TEXT, on_screen_text TEXT, subtitle_text TEXT NOT NULL, cited_fact_ids TEXT NOT NULL, transition_recommendation TEXT, continuity_notes TEXT, manual_review INTEGER NOT NULL, manual_review_reason TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE UNIQUE INDEX planned_scenes_plan_index_unique ON planned_scenes(scene_plan_id, scene_index);
  `);
  const insert = bootstrap.prepare(`INSERT INTO content_scripts VALUES (@id,@projectId,@opportunityId,@queueId,@packageId,@assessmentId,@format,@language,@duration,@wordCount,@hook,@body,@closing,@fullScript,@facts,@title,@alternates,@description,@tags,@hashtags,@keywords,@thumbnailText,@thumbnailBrief,@status,@provider,@model,@executionMode,@promptVersion,@inputHash,@generatedAt,@createdAt,@updatedAt)`);
  const writeScript = (scriptId, status = 'ready', inputHash = 'input-v1') => insert.run({ id: scriptId, projectId: id('101'), opportunityId: id('201'), queueId: id(`3${scriptId.slice(-11)}`), packageId: id('401'), assessmentId: id('501'), format: 'youtube_short', language: 'English', duration: 60, wordCount: 135, hook: 'A grounded hook.', body: 'A grounded body.', closing: 'A grounded close.', fullScript: 'India and France are discussing FCAS. This development matters for future fighter cooperation.', facts: '["fact-1"]', title: 'FCAS explained', alternates: '[]', description: 'Grounded description', tags: '[]', hashtags: '[]', keywords: '[]', thumbnailText: 'FCAS', thumbnailBrief: 'Brief', status, provider: 'test', model: 'test', executionMode: 'synchronous', promptVersion: 'content-package-v1', inputHash, generatedAt: now(), createdAt: now(), updatedAt: now() });
  const readyId = id('1'); const failedId = id('2'); const malformedId = id('3'); const retryId = id('4'); const staleId = id('5'); const batchOneId = id('6'); const batchTwoId = id('7'); const deferredId = id('8');
  [readyId, malformedId, retryId, staleId, batchOneId, batchTwoId, deferredId].forEach((scriptId) => writeScript(scriptId)); writeScript(failedId, 'failed'); bootstrap.close(); control = new Database(databasePath);

  const { Test } = await import('../apps/api/node_modules/@nestjs/testing/index.js');
  const { ValidationPipe } = await import('../apps/api/node_modules/@nestjs/common/index.js');
  const { AppModule } = await import('../apps/api/dist/app.module.js');
  const { AiRuntime } = await import('../apps/api/dist/modules/ai/ai-runtime.service.js');
  const { AiBatchRuntime } = await import('../apps/api/dist/modules/ai/ai-batch-runtime.service.js');
  let mode = 'valid'; let structuredCalls = 0; let resolveDeferred;
  const validOutput = (payload) => ({ scenes: payload.input.segments.map((segment, index) => ({ id: segment.id, index, narration: segment.narration, subtitleText: segment.narration, sceneType: 'b_roll', mediaStrategy: 'stock_or_source_footage', visualDescription: 'Grounded visual.', primarySearchQuery: null, alternateSearchQueries: [], generatedMediaPrompt: null, onScreenText: null, citedFactIds: ['fact-1'], transitionRecommendation: null, continuityNotes: null, manualReview: false, manualReviewReason: null })) });
  const runtime = {
    route: () => ({ provider: 'test-provider', model: 'test-model' }),
    structuredGeneration: async (payload) => { structuredCalls++; if (mode === 'providerFailure') throw new Error('secret-api-key=never-return-this'); if (mode === 'deferred') return new Promise((resolve) => { resolveDeferred = () => resolve(validOutput(payload)); }); const output = validOutput(payload); if (mode === 'malformed') output.scenes = []; if (mode === 'mutated') output.scenes[0].narration = 'rewritten'; if (mode === 'reordered') output.scenes.reverse(); return output; },
  };
  let batchItems = []; let batchResults = [];
  const batches = { submit: async (_task, items) => { batchItems = items.map((item) => ({ ...item, status: 'submitted' })); return { id: id('901') }; }, syncBatchStatus: async (batchId) => { if (batchId !== id('901')) throw new Error('Batch not found'); return { status: 'completed', items: batchItems, results: batchResults }; }, completeItems: async () => undefined };
  const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(AiRuntime).useValue(runtime).overrideProvider(AiBatchRuntime).useValue(batches).compile();
  app = module.createNestApplication(); app.setGlobalPrefix('api'); app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true })); await app.init();
  const server = app.getHttpServer();

  const generated = await request(server).post(`/api/content-scripts/${readyId}/scene-plan`).expect(201);
  assert.equal(generated.body.status, 'ready'); assert.ok(generated.body.scenes.length >= 1);
  const read = await request(server).get(`/api/content-scripts/${readyId}/scene-plan`).expect(200);
  assert.equal(read.body.inputHash, generated.body.inputHash);
  const reused = await request(server).post(`/api/content-scripts/${readyId}/scene-plan`).expect(201);
  assert.equal(reused.body.id, generated.body.id);
  const beforeStale = structuredCalls; control.prepare('UPDATE content_scripts SET input_hash = ? WHERE id = ?').run('input-v2', staleId); await request(server).post(`/api/content-scripts/${staleId}/scene-plan`).expect(201); control.prepare('UPDATE content_scripts SET input_hash = ? WHERE id = ?').run('input-v3', staleId); await request(server).post(`/api/content-scripts/${staleId}/scene-plan`).expect(201); assert.equal(structuredCalls, beforeStale + 2);
  mode = 'malformed'; const malformed = await request(server).post(`/api/content-scripts/${malformedId}/scene-plan`).expect(409); assert.equal(malformed.body.message.includes('Scene Plan output'), true); assert.equal(control.prepare('SELECT count(*) AS count FROM planned_scenes WHERE scene_plan_id = (SELECT id FROM scene_plans WHERE content_script_id = ?)').get(malformedId).count, 0);
  mode = 'mutated'; await request(server).post(`/api/content-scripts/${retryId}/scene-plan`).expect(409); mode = 'valid'; const retried = await request(server).post(`/api/content-scripts/${retryId}/scene-plan`).expect(201); assert.equal(retried.body.status, 'ready');
  mode = 'deferred'; const first = new Promise((resolve, reject) => request(server).post(`/api/content-scripts/${deferredId}/scene-plan`).end((error, response) => error ? reject(error) : resolve(response))); await new Promise((resolve) => setImmediate(resolve)); await request(server).post(`/api/content-scripts/${deferredId}/scene-plan`).expect(409); resolveDeferred(); const firstResponse = await first; assert.equal(firstResponse.status, 201); mode = 'valid';
  mode = 'providerFailure'; const providerFailure = await request(server).post(`/api/content-scripts/${id('3')}/scene-plan`).expect(500); assert.equal(JSON.stringify(providerFailure.body).includes('secret-api-key'), false); mode = 'valid';
  await request(server).post(`/api/content-scripts/${failedId}/scene-plan`).expect(409);
  await request(server).post(`/api/content-scripts/${id('999')}/scene-plan`).expect(404);
  await request(server).post('/api/content-scripts/not-a-uuid/scene-plan').expect(400);
  const batch = await request(server).post('/api/content-scripts/scene-plans/batch').send({ contentScriptIds: [readyId, failedId] }).expect(201);
  assert.deepEqual(batch.body.submittedItemIds, []); assert.equal(batch.body.skipped.length, 2);
  const submitted = await request(server).post('/api/content-scripts/scene-plans/batch').send({ contentScriptIds: [batchOneId, batchTwoId] }).expect(201); assert.equal(submitted.body.submittedItemIds.length, 2); assert.equal(new Set(batchItems.map((item) => item.customId)).size, 2);
  batchResults = [...batchItems].reverse().map((item, index) => index === 0 ? { customId: item.customId, status: 'failed', errorCategory: 'provider_failure', errorCode: 'bad', usage: { inputTokens: 1, outputTokens: null } } : { customId: item.customId, status: 'succeeded', output: validOutput({ input: item.input }), usage: { inputTokens: 2, outputTokens: 3 } });
  const reconciled = await request(server).post(`/api/content-scripts/scene-plans/batch/${id('901')}/reconcile`).expect(201); assert.equal(reconciled.body.processed, 2); assert.equal(control.prepare('SELECT status FROM scene_plans WHERE content_script_id = ?').get(batchOneId)?.status === 'ready' || control.prepare('SELECT status FROM scene_plans WHERE content_script_id = ?').get(batchTwoId)?.status === 'ready', true);
  await request(server).post(`/api/content-scripts/scene-plans/batch/${id('999')}/reconcile`).expect(404);
  console.log('SCENE_PLAN_HTTP_INTEGRATION=PASS');
} finally {
  await app?.close();
  control?.close();
  const { closeStorageConnection } = await import('../packages/storage/dist/db.js').catch(() => ({ closeStorageConnection: undefined }));
  closeStorageConnection?.();
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
