import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const storageRequire = createRequire(new URL('../packages/storage/package.json', import.meta.url));
const apiRequire = createRequire(new URL('../apps/api/package.json', import.meta.url));
const Database = storageRequire('better-sqlite3');
const { drizzle } = storageRequire('drizzle-orm/better-sqlite3');
const { migrate } = storageRequire('drizzle-orm/better-sqlite3/migrator');
const request = apiRequire('supertest');
const run = (binary, args) => {
  const result = spawnSync(binary, args, { encoding: 'utf8', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${binary}_failed: ${(result.stderr || '').slice(0, 500)}`);
  return result.stdout;
};

let directory;
let app;
let control;
let closeStorageConnection;
try {
  directory = await mkdtemp(join(tmpdir(), 'content-os-render-api-'));
  const databasePath = join(directory, 'test.db');
  const mediaRoot = join(directory, 'media');
  const workRoot = join(directory, 'work');
  process.env.DATABASE_URL = databasePath;
  process.env.MEDIA_STORAGE_ROOT = mediaRoot;
  process.env.VIDEO_RENDER_WORK_ROOT = workRoot;
  process.env.AUDIO_DEFAULT_PROVIDER = 'sarvam-bulbul-v3';

  control = new Database(databasePath);
  migrate(drizzle(control), {
    migrationsFolder: fileURLToPath(new URL('../packages/storage/migrations', import.meta.url)),
  });
  const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
  const ffprobe = process.env.FFPROBE_PATH || 'ffprobe';
  run(ffmpeg, ['-version']);
  run(ffprobe, ['-version']);
  const audioPath = join(directory, 'audio.wav');
  const imagePath = join(directory, 'frame.png');
  run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-c:a', 'pcm_s16le', audioPath]);
  run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=blue:s=1080x1920:d=0.04', '-frames:v', '1', imagePath]);

  const storageModule = await import('../packages/storage/dist/index.js');
  closeStorageConnection = storageModule.closeStorageConnection;
  const { VideoRenderInputRepository } = storageModule;
  const { LocalMediaStorageProvider } = await import('../apps/api/dist/modules/media/local-media-storage.provider.js');
  const storage = new LocalMediaStorageProvider(mediaRoot);
  const imageBytes = await readFile(imagePath);
  const imageChecksum = createHash('sha256').update(imageBytes).digest('hex');
  assert.equal(await storage.materializeFile('fixtures/frame.png', imagePath, 10 * 1024 * 1024), true);

  const ids = Object.fromEntries(['project', 'script', 'plan', 'visual', 'audio', 'composition', 'scene', 'planned', 'segment', 'candidate', 'asset'].map((key) => [key, randomUUID()]));
  const now = new Date().toISOString();
  control.prepare('INSERT INTO visual_asset_manifests (id,project_id,content_script_id,scene_plan_id,scene_plan_input_hash,manifest_version,input_hash,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run(ids.visual, ids.project, ids.script, ids.plan, 'plan-hash', 'v1', 'visual-hash', 'ready', now, now);
  control.prepare('INSERT INTO audio_generations (id,project_id,content_script_id,scene_plan_id,provider,model,model_version,voice_id,language,status,input_hash,total_duration_ms,output_path,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(ids.audio, ids.project, ids.script, ids.plan, 'test', 'test', 'v1', 'voice', 'en', 'ready', 'audio-hash', 1000, audioPath, now, now);
  control.prepare('INSERT INTO video_composition_plans (id,project_id,content_script_id,scene_plan_id,scene_plan_input_hash,audio_generation_id,audio_input_hash,visual_asset_manifest_id,visual_manifest_input_hash,version,input_hash,status,total_duration_ms,scene_count,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(ids.composition, ids.project, ids.script, ids.plan, 'plan-hash', ids.audio, 'audio-hash', ids.visual, 'visual-hash', 'v1', 'composition-hash', 'ready', 1000, 1, now, now);
  const manifest = await new VideoRenderInputRepository().upsert({ projectId: ids.project, contentScriptId: ids.script, compositionPlanId: ids.composition, compositionInputHash: 'composition-hash', audioGenerationId: ids.audio, audioInputHash: 'audio-hash', visualAssetManifestId: ids.visual, visualManifestInputHash: 'visual-hash', version: 'v1', inputHash: 'render-input-hash', status: 'ready', audioOutputPath: audioPath, totalDurationMs: 1000, sceneCount: 1, failureCode: null, failureReason: null }, [{ compositionSceneId: ids.scene, plannedSceneId: ids.planned, startMs: 0, endMs: 1000, durationMs: 1000, audioSegmentId: ids.segment, audioPath, assetStrategy: 'selected_candidate', selectedCandidateId: ids.candidate, candidateIdentityHash: 'candidate-hash', mediaAssetId: ids.asset, mediaType: 'image', mimeType: 'image/png', storageProvider: 'local', storageKey: 'fixtures/frame.png', checksum: imageChecksum }]);

  const { Test } = await import('../apps/api/node_modules/@nestjs/testing/index.js');
  const { ValidationPipe } = await import('../apps/api/node_modules/@nestjs/common/index.js');
  const { AppModule } = await import('../apps/api/dist/app.module.js');
  const { VideoRenderWorkerService } = await import('../apps/api/dist/modules/production/video-render-worker.service.js');
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = module.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  await app.init();

  const server = app.getHttpServer();
  const queued = await request(server).post(`/api/content-scripts/${ids.script}/video-render-jobs`).expect(201);
  assert.equal(queued.body.status, 'queued');
  assert.equal(queued.body.renderInputManifestId, manifest.id);
  assert.equal(queued.body.renderInputHash, manifest.inputHash);
  assert.equal(control.prepare('SELECT count(*) count FROM video_render_jobs').get().count, 1);
  assert.equal(control.prepare('SELECT count(*) count FROM video_render_job_attempts').get().count, 1);

  const completed = await app.get(VideoRenderWorkerService).runNext();
  assert.equal(completed.id, queued.body.id);
  assert.equal(completed.attemptId, queued.body.attemptId);
  assert.equal(completed.renderInputManifestId, manifest.id);
  assert.equal(completed.renderInputHash, manifest.inputHash);
  assert.equal(completed.status, 'completed');

  const statusResponse = await request(server).get(`/api/content-scripts/${ids.script}/video-render-job`).expect(200);
  assert.equal(statusResponse.body.status, 'completed');
  assert.equal(statusResponse.body.progress.percent, 100);
  assert.ok(statusResponse.body.progress.completedUnits >= 0);
  assert.ok(statusResponse.body.progress.completedUnits <= statusResponse.body.progress.totalUnits);
  const artifact = statusResponse.body.outputArtifact;
  assert.equal(artifact.storageKey, `renders/${queued.body.id}/${queued.body.attemptId}.mp4`);

  const output = await request(server).get(`/api/content-scripts/${ids.script}/video-render-job/output`).buffer(true).parse((response, callback) => { const chunks = []; response.on('data', (chunk) => chunks.push(chunk)); response.on('end', () => callback(null, Buffer.concat(chunks))); }).expect(200).expect('Content-Type', /video\/mp4/).expect('Cache-Control', 'private, no-store').expect('X-Content-Type-Options', 'nosniff');
  assert.ok(Buffer.isBuffer(output.body) && output.body.length > 0);
  assert.equal(Number(output.headers['content-length']), artifact.sizeBytes);
  assert.equal(output.body.length, artifact.sizeBytes);
  assert.equal(createHash('sha256').update(output.body).digest('hex'), artifact.checksum);

  const artifactPath = join(mediaRoot, ...artifact.storageKey.split('/'));
  assert.equal((await stat(artifactPath)).size, artifact.sizeBytes);
  assert.ok(Number(run(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', artifactPath]).trim()) > 0);
  console.log('VIDEO_RENDER_API_INTEGRATION=PASS');
} finally {
  await app?.close();
  closeStorageConnection?.();
  if (control) { try { control.close(); } catch {} }
  if (directory) await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
