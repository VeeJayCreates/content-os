import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const runtimeDirectory = join(root, "test-results", "video-creation-runtime");
const logsDirectory = join(runtimeDirectory, "logs");
const statePath = join(runtimeDirectory, "fixture.json");
const stopPath = join(runtimeDirectory, "stop");
const temporaryRoot = await mkdtemp(join(tmpdir(), "content-os-video-ui-e2e-"));
const databasePath = join(temporaryRoot, "fixture.db");
const mediaRoot = join(temporaryRoot, "media");
const workRoot = join(temporaryRoot, "work");
const overriddenEnvironmentKeys = new Set(["port", "database_url", "media_storage_root", "video_render_work_root", "audio_default_provider", "audio_sarvam_output_dir", "contentos_api_base_url"]);
const inheritedEnvironment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !overriddenEnvironmentKeys.has(key.toLowerCase())));
const environment = { ...inheritedEnvironment, PORT: "32101", DATABASE_URL: databasePath, MEDIA_STORAGE_ROOT: mediaRoot, VIDEO_RENDER_WORK_ROOT: workRoot, AUDIO_DEFAULT_PROVIDER: "sarvam-bulbul-v3", AUDIO_SARVAM_OUTPUT_DIR: temporaryRoot, CONTENTOS_API_BASE_URL: "http://127.0.0.1:32101/api" };
const children = [];
let stopping = false;
const launcherPid = process.ppid;

const run = (binary, args, options = {}) => {
  const result = spawnSync(binary, args, { encoding: "utf8", windowsHide: true, env: environment, ...options });
  if (result.error || result.status !== 0) throw result.error ?? new Error(`${binary} ${args.join(" ")} failed:\n${result.stdout}\n${result.stderr}`);
};
const waitForExit = (child, timeoutMs = 5_000) => new Promise((done) => {
  if (child.exitCode !== null || child.signalCode !== null) return done();
  const timer = setTimeout(() => { child.kill("SIGKILL"); done(); }, timeoutMs);
  child.once("exit", () => { clearTimeout(timer); done(); });
});
async function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const { child } of children) if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
  await Promise.all(children.map(({ child }) => waitForExit(child)));
  await Promise.all(children.map(({ name, chunks }) => writeFile(join(logsDirectory, `${name}.log`), Buffer.concat(chunks))));
  await rm(temporaryRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  process.exit(exitCode);
}
function start(name, command, args, cwd) {
  const child = spawn(command, args, { cwd, env: environment, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  const chunks = [];
  children.push({ name, child, chunks });
  const capture = (data) => { chunks.push(Buffer.from(data)); process.stdout.write(`[${name}] ${data}`); };
  child.stdout.on("data", capture);
  child.stderr.on("data", capture);
  child.once("error", (error) => { chunks.push(Buffer.from(error.stack ?? String(error))); void stop(1); });
  child.once("exit", (code) => { if (!stopping && code !== 0) void stop(code ?? 1); });
}
process.once("SIGINT", () => { void stop(130); });
process.once("SIGTERM", () => { void stop(0); });
process.once("SIGHUP", () => { void stop(0); });
const launcherWatch = setInterval(() => {
  try { process.kill(launcherPid, 0); } catch { clearInterval(launcherWatch); void stop(0); }
}, 1_000);
const completionWatch = setInterval(async () => {
  try { await access(stopPath); clearInterval(completionWatch); void stop(0); } catch {}
}, 250);

try {
  await mkdir(logsDirectory, { recursive: true });
  await rm(stopPath, { force: true });
  // Use the storage package's schema boundary instead of duplicating its DDL.
  const drizzleCli = join(root, "packages/storage/node_modules/drizzle-kit/bin.cjs");
  const drizzleBootstrap = `const os=require('node:os');os.homedir=()=>require('node:os').tmpdir();os.userInfo=()=>({username:'content-os-e2e'});process.argv=['node','drizzle-kit','push','--force'];require(${JSON.stringify(drizzleCli)})`;
  run(process.execPath, ["-e", drizzleBootstrap], { cwd: join(root, "packages/storage") });
  const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
  run(ffmpeg, ["-version"]);
  const audioPath = join(temporaryRoot, "voiceover.wav");
  run(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-c:a", "pcm_s16le", audioPath]);

  for (const key of Object.keys(process.env)) if (overriddenEnvironmentKeys.has(key.toLowerCase())) delete process.env[key];
  Object.assign(process.env, environment);
  const { AudioGenerationRepository, ContentScriptRepository, OpportunityRepository, ProductionQueueRepository, ProjectRepository, ResearchPackageRepository, ScenePlanRepository, VisualAssetRepository, closeStorageConnection } = await import("../../packages/storage/dist/index.js");
  const now = new Date().toISOString();
  const project = await new ProjectRepository().create({ name: "Video E2E Golden Path", description: "Isolated browser fixture", contentType: "youtube_short", status: "active" });
  const opportunity = await new OpportunityRepository().create({ projectId: project.id, clusterKey: `video-e2e-${randomUUID()}`, title: "Deterministic local video", representativeUrl: "https://example.invalid/e2e", summary: "Browser E2E fixture", status: "selected", score: 100, signalCount: 2, sourceCount: 2, firstSeenAt: now, lastSeenAt: now });
  const researchPackage = await new ResearchPackageRepository().create({ projectId: project.id, opportunityId: opportunity.id, title: "Video E2E Package", summary: "Deterministic fixture", status: "ready", confidenceScore: 100, sourceCount: 2, signalCount: 2 });
  const queue = await new ProductionQueueRepository().enqueue({ projectId: project.id, opportunityId: opportunity.id, researchPackageId: researchPackage.id, status: "completed", priority: 1, selectionScore: 100, selectionReason: "Deterministic isolated browser fixture", queuedAt: now, startedAt: now, completedAt: now, failedAt: null });
  const scriptRepository = new ContentScriptRepository();
  const script = await scriptRepository.upsert({ projectId: project.id, opportunityId: opportunity.id, productionQueueItemId: queue.id, researchPackageId: researchPackage.id, editorialAssessmentId: randomUUID(), format: "youtube_short", language: "Hindi", targetDurationSeconds: 2, targetWordCount: 4, hook: "A deterministic local render.", body: "", closing: "", fullScript: "A deterministic local render.", citedFactIds: [], primaryTitle: "Deterministic local video", alternateTitles: [], description: "E2E output", tags: [], hashtags: [], keywords: [], thumbnailText: "Video E2E", thumbnailCreativeBrief: "Local render", status: "ready", provider: "fixture", model: "fixture", executionMode: "synchronous", promptVersion: "v1", inputHash: "script-hash", generatedAt: now });
  const sceneId = randomUUID();
  const plan = await new ScenePlanRepository().upsert({ projectId: project.id, contentScriptId: script.id, status: "ready", version: "v1", totalEstimatedDurationMs: 2000, sceneCount: 1, provider: "fixture", model: "fixture", executionMode: "synchronous", promptVersion: "v1", inputHash: "plan-hash", failureCode: null, failureReason: null }, [{ id: sceneId, narration: "A deterministic local render.", narrationWordCount: 4, estimatedDurationMs: 2000, startEstimateMs: 0, endEstimateMs: 2000, sceneType: "explanation", mediaStrategy: "text_card", visualDescription: "Simple local title card", primarySearchQuery: null, alternateSearchQueries: [], generatedMediaPrompt: null, onScreenText: "ContentOS E2E", subtitleText: "A deterministic local render.", citedFactIds: [], transitionRecommendation: null, continuityNotes: null, manualReview: false, manualReviewReason: null }]);
  const audioRepository = new AudioGenerationRepository();
  const { AudioRuntimeService } = await import("../../apps/api/dist/modules/audio/audio-runtime.service.js");
  const { SarvamBulbulConfiguration } = await import("../../apps/api/dist/modules/audio/sarvam-bulbul.configuration.js");
  const audioConfiguration = new SarvamBulbulConfiguration().resolve();
  const audioService = new AudioRuntimeService(scriptRepository, new ScenePlanRepository(), audioRepository, { configuration: () => audioConfiguration });
  const preparedAudio = await audioService.prepare(script.id, audioConfiguration);
  const persistedAudio = await audioService.persistReady(preparedAudio, preparedAudio.segments.map((segment) => ({ segmentId: segment.id, actualDurationMs: 2000, audioPath })));
  const audio = await audioRepository.upsert({ projectId: persistedAudio.projectId, contentScriptId: persistedAudio.contentScriptId, scenePlanId: persistedAudio.scenePlanId, provider: persistedAudio.provider, model: persistedAudio.model, modelVersion: persistedAudio.modelVersion, voiceId: persistedAudio.voiceId, language: persistedAudio.language, status: persistedAudio.status, inputHash: persistedAudio.inputHash, totalDurationMs: persistedAudio.totalDurationMs, outputPath: audioPath, outputMetadata: persistedAudio.outputMetadata, failureCode: null, failureReason: null }, persistedAudio.segments.map((segment) => ({ id: segment.id, sceneId: segment.sceneId, narration: segment.narration, language: segment.language, actualDurationMs: segment.actualDurationMs, startMs: segment.startMs, endMs: segment.endMs, audioPath: segment.audioPath, voiceDirection: segment.voiceDirection, status: segment.status })));
  const visual = await new VisualAssetRepository().upsert({ projectId: project.id, contentScriptId: script.id, scenePlanId: plan.id, scenePlanInputHash: "plan-hash", manifestVersion: "v1", inputHash: "visual-hash", status: "ready", failureCode: null, failureReason: null, completedAt: now }, [{ id: randomUUID(), plannedSceneId: sceneId, requirementVersion: "v1", requirementType: "text_card", acquisitionStrategy: "none_required", subject: null, explicitEntities: [], explicitLocations: [], timeframe: null, eventOrClaim: null, visualObjective: "Present deterministic title", visualDescription: "Simple title card", mustInclude: [], mustAvoid: [], primarySearchQuery: null, alternateSearchQueries: [], generationPrompt: null, sourceFactIds: [], targetDurationMs: 2000, targetAspectRatio: "9:16", preferredOrientation: "portrait", expectedMediaType: "image", licenceRequirements: {}, mapSpecification: null, programmaticSpecification: null, textCardSpecification: {}, manualReviewRequired: false, reviewReasons: [], status: "ready", selectedCandidateId: null }]);
  closeStorageConnection();
  await writeFile(statePath, JSON.stringify({ project: project.id, opportunity: opportunity.id, package: researchPackage.id, queue: queue.id, script: script.id, plan: plan.id, audio: audio.id, visual: visual.id, databasePath, mediaRoot, workRoot, audioPath }, null, 2));

  const dashboardBuild = spawnSync(process.execPath, [join(root, "apps/dashboard/node_modules/next/dist/bin/next"), "build"], { cwd: join(root, "apps/dashboard"), env: environment, encoding: "utf8", windowsHide: true });
  if (dashboardBuild.error || dashboardBuild.status !== 0) throw dashboardBuild.error ?? new Error(`dashboard build failed:\n${dashboardBuild.stdout}\n${dashboardBuild.stderr}`);
  start("api", process.execPath, ["dist/main.js"], join(root, "apps/api"));
  start("dashboard", process.execPath, [join(root, "apps/dashboard/node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", "32100"], join(root, "apps/dashboard"));
} catch (error) {
  console.error(error);
  await stop(1);
}
