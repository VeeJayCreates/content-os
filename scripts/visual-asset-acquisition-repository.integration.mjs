import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const requireFromStorage = createRequire(new URL('../packages/storage/package.json', import.meta.url));
const Database = requireFromStorage('better-sqlite3');
let directory; let closeStorageConnection; let control;
const run = (overrides = {}) => ({ projectId: 'project-a', contentScriptId: 'script-a', manifestId: 'manifest-a', manifestInputHash: 'manifest-hash-a', version: 'visual-asset-acquisition-v1', inputHash: 'input-a', requestedRequirementIds: ['requirement-a', 'requirement-b'], providerPlan: [{ id: 'provider-a', version: 'v1' }], preparedQueryCount: 2, providerRequestCount: 0, candidatesDiscovered: 0, candidatesAccepted: 0, candidatesRejected: 0, ...overrides });
const plan = (requirementId, overrides = {}) => ({ requirementId, plannedSceneId: `scene-${requirementId}`, requirementType: 'stock_footage', acquisitionStrategy: 'provider_search', capability: 'video_search', providerIds: ['provider-a'], queries: [`safe ${requirementId}`], expectedMediaType: 'video', targetAspectRatio: '9:16', preferredOrientation: 'portrait', licenceRequirements: { commercialUseRequired: true, modificationAllowed: true, attributionRequired: false, provenanceRequired: true, unknownLicenceRequiresManualReview: true }, resultLimit: 5, automaticAcquisitionAllowed: true, skipReason: null, manualReviewReasons: [], ...overrides });

try {
  directory = await mkdtemp(join(tmpdir(), 'content-os-visual-asset-acquisition-'));
  const databasePath = join(directory, 'acquisition.db'); process.env.DATABASE_URL = databasePath;
  const bootstrap = new Database(databasePath);
  const migration = await readFile(new URL('../packages/storage/migrations/0000_visual_asset_acquisition.sql', import.meta.url), 'utf8');
  bootstrap.exec(migration.replaceAll('--> statement-breakpoint', ''));
  bootstrap.exec(`
    CREATE TABLE visual_asset_manifests (id text PRIMARY KEY NOT NULL, project_id text NOT NULL, content_script_id text NOT NULL, scene_plan_id text NOT NULL, scene_plan_input_hash text NOT NULL, manifest_version text NOT NULL, input_hash text NOT NULL, status text NOT NULL, failure_code text, failure_reason text, completed_at text, created_at text NOT NULL, updated_at text NOT NULL);
    CREATE UNIQUE INDEX visual_asset_manifests_script_unique ON visual_asset_manifests (content_script_id);
    CREATE TABLE scene_visual_requirements (id text PRIMARY KEY NOT NULL, manifest_id text NOT NULL, planned_scene_id text NOT NULL, scene_index integer NOT NULL, requirement_version text NOT NULL, requirement_type text NOT NULL, acquisition_strategy text NOT NULL, subject text, explicit_entities text NOT NULL, explicit_locations text NOT NULL, timeframe text, event_or_claim text, visual_objective text NOT NULL, visual_description text NOT NULL, must_include text NOT NULL, must_avoid text NOT NULL, primary_search_query text, alternate_search_queries text NOT NULL, generation_prompt text, source_fact_ids text NOT NULL, target_duration_ms integer NOT NULL, target_aspect_ratio text NOT NULL, preferred_orientation text NOT NULL, expected_media_type text NOT NULL, licence_requirements text NOT NULL, map_specification text, programmatic_specification text, text_card_specification text, manual_review_required integer NOT NULL, review_reasons text NOT NULL, status text NOT NULL, selected_candidate_id text, created_at text NOT NULL, updated_at text NOT NULL);
    CREATE UNIQUE INDEX scene_visual_requirements_manifest_scene_unique ON scene_visual_requirements (manifest_id, scene_index);
    CREATE TABLE visual_asset_candidates (id text PRIMARY KEY NOT NULL, requirement_id text NOT NULL, provider text NOT NULL, provider_asset_id text, source_url text, preview_url text, media_identity text, media_type text NOT NULL, mime_type text, width integer, height integer, duration_ms integer, checksum text, title text, licence_type text, licence_url text, attribution_text text, commercial_use_allowed integer, modification_allowed integer, provenance_score integer, overall_score integer, rejection_reasons text NOT NULL, status text NOT NULL, discovered_at text NOT NULL, selected_at text, approved_at text);
    CREATE UNIQUE INDEX visual_asset_candidates_requirement_provider_asset_unique ON visual_asset_candidates (requirement_id, provider, provider_asset_id);
  `);
  bootstrap.close(); control = new Database(databasePath);
  const { VisualAssetAcquisitionRepository } = await import('../packages/storage/dist/repositories/visual-asset-acquisition.repository.js');
  const { VisualAssetRepository } = await import('../packages/storage/dist/repositories/visual-asset.repository.js');
  ({ closeStorageConnection } = await import('../packages/storage/dist/db.js'));
  const repository = new VisualAssetAcquisitionRepository();
  const manifests = new VisualAssetRepository();

  for (const status of ['selected', 'approved', 'rejected', 'stale', 'unavailable']) {
    const requirementId = `requirement-${status}`;
    const candidateId = `candidate-${status}`;
    const selectedAt = status === 'selected' || status === 'approved' ? `selected-at-${status}` : null;
    const approvedAt = status === 'approved' ? 'approved-at-approved' : null;
    await manifests.upsert({ projectId: `project-${status}`, contentScriptId: `script-${status}`, scenePlanId: `scene-plan-${status}`, scenePlanInputHash: 'scene-plan-hash', manifestVersion: 'v1', inputHash: `manifest-hash-${status}`, status: 'needs_review', failureCode: null, failureReason: null, completedAt: null }, [{ id: requirementId, plannedSceneId: `scene-${status}`, requirementVersion: 'v1', requirementType: 'stock_footage', acquisitionStrategy: 'provider_search', subject: null, explicitEntities: [], explicitLocations: [], timeframe: null, eventOrClaim: null, visualObjective: 'objective', visualDescription: 'description', mustInclude: [], mustAvoid: [], primarySearchQuery: `safe ${status}`, alternateSearchQueries: [], generationPrompt: null, sourceFactIds: [], targetDurationMs: 1000, targetAspectRatio: '9:16', preferredOrientation: 'portrait', expectedMediaType: 'video', licenceRequirements: {}, mapSpecification: null, programmaticSpecification: null, textCardSpecification: null, manualReviewRequired: false, reviewReasons: [], status: 'pending', selectedCandidateId: status === 'selected' || status === 'approved' ? candidateId : null }]);
    control.prepare('INSERT INTO visual_asset_candidates (id, requirement_id, provider, provider_asset_id, source_url, media_type, mime_type, rejection_reasons, status, discovered_at, selected_at, approved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(candidateId, requirementId, 'provider-a', `asset-${status}`, `https://example.com/${status}.mp4`, 'video', 'video/mp4', '[]', status, `discovered-at-${status}`, selectedAt, approvedAt);
    await manifests.upsertCandidate(requirementId, { provider: 'provider-a', providerAssetId: `asset-${status}`, sourceUrl: `https://example.com/${status}-rediscovered.mp4`, previewUrl: null, mediaIdentity: null, mediaType: 'video', mimeType: 'video/mp4', width: null, height: null, durationMs: null, checksum: null, title: 'rediscovered', licenceType: null, licenceUrl: null, attributionText: null, commercialUseAllowed: null, modificationAllowed: null, provenanceScore: null, overallScore: null, rejectionReasons: [], status: 'discovered' });
    const rediscovered = await manifests.getCandidate(candidateId);
    const persistedRequirement = await manifests.getRequirement((await manifests.findByContentScriptId(`script-${status}`)).id, requirementId);
    assert.equal(rediscovered.status, status);
    assert.equal(rediscovered.selectedAt, selectedAt);
    assert.equal(rediscovered.approvedAt, approvedAt);
    assert.equal(persistedRequirement.selectedCandidateId, status === 'selected' || status === 'approved' ? candidateId : null);
  }

  const first = await repository.upsertPrepared(run(), [plan('requirement-a'), plan('requirement-b')]);
  assert.equal(first.status, 'prepared'); assert.deepEqual(first.plans.map((item) => item.planIndex), [0, 1]);
  assert.equal((await repository.findCompatible('manifest-a', 'input-a')).id, first.id);
  assert.equal((await repository.findByContentScriptId('script-a')).id, first.id);
  assert.equal((await repository.findById(first.id)).plans.length, 2);
  const stale = await repository.upsertPrepared(run({ inputHash: 'input-b', manifestInputHash: 'manifest-hash-b' }), [plan('requirement-a')]);
  assert.notEqual(stale.id, first.id);
  await repository.persistFailure(run({ inputHash: 'failed-input' }), 'preparation_failed');
  const failed = control.prepare(`SELECT * FROM visual_asset_acquisition_runs WHERE input_hash = 'failed-input'`).get();
  assert.equal(failed.status, 'failed'); assert.equal(control.prepare(`SELECT COUNT(*) AS count FROM visual_asset_acquisition_plans WHERE run_id = ?`).get(failed.id).count, 0);
  assert.equal(await repository.claimExecution(failed.id), false);
  const retry = await repository.upsertPrepared(run({ inputHash: 'failed-input' }), [plan('requirement-a')]);
  assert.equal(retry.status, 'prepared'); assert.equal(retry.plans.length, 1);
  await manifests.upsert({ projectId: 'project-a', contentScriptId: 'script-a', scenePlanId: 'scene-plan-a', scenePlanInputHash: 'scene-plan-hash', manifestVersion: 'v1', inputHash: 'manifest-hash-a', status: 'needs_review', failureCode: null, failureReason: null, completedAt: null }, [{ id: 'requirement-a', plannedSceneId: 'scene-a', requirementVersion: 'v1', requirementType: 'stock_footage', acquisitionStrategy: 'provider_search', subject: null, explicitEntities: [], explicitLocations: [], timeframe: null, eventOrClaim: null, visualObjective: 'objective', visualDescription: 'description', mustInclude: [], mustAvoid: [], primarySearchQuery: 'safe requirement-a', alternateSearchQueries: [], generationPrompt: null, sourceFactIds: [], targetDurationMs: 1000, targetAspectRatio: '9:16', preferredOrientation: 'portrait', expectedMediaType: 'video', licenceRequirements: {}, mapSpecification: null, programmaticSpecification: null, textCardSpecification: null, manualReviewRequired: false, reviewReasons: [], status: 'pending', selectedCandidateId: null }]);
  assert.equal(await repository.claimExecution(retry.id), true);
  const retryCandidate = { provider: 'provider-a', providerAssetId: 'asset-retry', sourceUrl: 'https://example.com/retry.mp4', previewUrl: null, mediaIdentity: null, mediaType: 'video', mimeType: 'video/mp4', width: 1080, height: 1920, durationMs: 1000, checksum: null, title: 'retry candidate', licenceType: null, licenceUrl: null, attributionText: null, commercialUseAllowed: null, modificationAllowed: null, provenanceScore: null, overallScore: null, rejectionReasons: [], status: 'discovered' };
  const partiallyPersisted = await manifests.upsertCandidate('requirement-a', retryCandidate);
  await repository.failExecution(retry.id, 'provider_network_failure', { providerRequestCount: 2, candidatesDiscovered: 1, candidatesAccepted: 1, candidatesRejected: 0 });
  const executionFailure = await repository.findById(retry.id);
  assert.equal(executionFailure.status, 'failed'); assert.equal(executionFailure.failureCode, 'provider_network_failure'); assert.equal(executionFailure.providerRequestCount, 2);
  assert.equal(await repository.claimExecution(retry.id), true);
  assert.equal(await repository.claimExecution(retry.id), false);
  const rediscoveredOnRetry = await manifests.upsertCandidate('requirement-a', { ...retryCandidate, sourceUrl: 'https://example.com/retry-rediscovered.mp4' });
  assert.equal(rediscoveredOnRetry.id, partiallyPersisted.id);
  assert.equal(control.prepare(`SELECT COUNT(*) AS count FROM visual_asset_candidates WHERE requirement_id = 'requirement-a' AND provider = 'provider-a' AND provider_asset_id = 'asset-retry'`).get().count, 1);
  await repository.recordExecution(retry.id, { providerRequestCount: 1, candidatesDiscovered: 1, candidatesAccepted: 1, candidatesRejected: 0 });
  const completedRetry = await repository.findById(retry.id);
  assert.equal(completedRetry.status, 'completed'); assert.equal(completedRetry.failureCode, null); assert.equal(completedRetry.providerRequestCount, 1); assert.equal(completedRetry.candidatesDiscovered, 1); assert.equal(completedRetry.candidatesAccepted, 1); assert.equal(completedRetry.candidatesRejected, 0);
  assert.equal(await repository.findByContentScriptId('script-b'), undefined);

  control.exec(`CREATE TRIGGER acquisition_plan_failure BEFORE INSERT ON visual_asset_acquisition_plans WHEN NEW.requirement_id = 'failure' BEGIN SELECT RAISE(ABORT, 'injected_plan_failure'); END;`);
  await assert.rejects(repository.upsertPrepared(run(), [plan('failure')]));
  const preserved = await repository.findCompatible('manifest-a', 'input-a');
  assert.deepEqual(preserved.plans.map((item) => item.requirementId), ['requirement-a', 'requirement-b']);
  control.exec('DROP TRIGGER acquisition_plan_failure');
  console.log('VISUAL_ASSET_ACQUISITION_REPOSITORY_INTEGRATION=PASS');
} finally {
  closeStorageConnection?.(); control?.close();
  if (directory) await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
