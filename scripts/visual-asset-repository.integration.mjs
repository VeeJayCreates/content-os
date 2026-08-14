import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const requireFromStorage = createRequire(new URL('../packages/storage/package.json', import.meta.url));
const Database = requireFromStorage('better-sqlite3');
let directory; let closeStorageConnection; let control;
const now = () => new Date().toISOString();
const requirement = (id, overrides = {}) => ({ id, plannedSceneId: `scene-${id}`, requirementVersion: 'v1', requirementType: 'still_image', acquisitionStrategy: 'provider_search', subject: null, explicitEntities: [], explicitLocations: [], timeframe: null, eventOrClaim: null, visualObjective: 'objective', visualDescription: 'description', mustInclude: [], mustAvoid: [], primarySearchQuery: null, alternateSearchQueries: [], generationPrompt: null, sourceFactIds: [], targetDurationMs: 1000, targetAspectRatio: '9:16', preferredOrientation: 'portrait', expectedMediaType: 'image', licenceRequirements: { commercialUseRequired: true, modificationAllowed: true, attributionRequired: false, provenanceRequired: true }, mapSpecification: null, programmaticSpecification: null, textCardSpecification: null, manualReviewRequired: false, reviewReasons: [], status: 'needs_review', selectedCandidateId: null, ...overrides });
const candidate = (providerAssetId, overrides = {}) => ({ provider: 'test-provider', providerAssetId, sourceUrl: `https://assets.example.test/${providerAssetId}`, previewUrl: null, mediaIdentity: null, mediaType: 'image', mimeType: 'image/jpeg', width: 100, height: 100, durationMs: null, checksum: null, title: null, licenceType: 'cc-by', licenceUrl: 'https://licence.example.test', attributionText: null, commercialUseAllowed: true, modificationAllowed: true, provenanceScore: 90, overallScore: 90, rejectionReasons: [], status: 'discovered', ...overrides });

try {
  directory = await mkdtemp(join(tmpdir(), 'content-os-visual-assets-repository-'));
  const databasePath = join(directory, 'visual-assets.db'); process.env.DATABASE_URL = databasePath;
  const bootstrap = new Database(databasePath);
  bootstrap.exec(`CREATE TABLE visual_asset_manifests (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, content_script_id TEXT NOT NULL UNIQUE, scene_plan_id TEXT NOT NULL, scene_plan_input_hash TEXT NOT NULL, manifest_version TEXT NOT NULL, input_hash TEXT NOT NULL, status TEXT NOT NULL, failure_code TEXT, failure_reason TEXT, completed_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE scene_visual_requirements (id TEXT PRIMARY KEY, manifest_id TEXT NOT NULL, planned_scene_id TEXT NOT NULL, scene_index INTEGER NOT NULL, requirement_version TEXT NOT NULL, requirement_type TEXT NOT NULL, acquisition_strategy TEXT NOT NULL, subject TEXT, explicit_entities TEXT NOT NULL, explicit_locations TEXT NOT NULL, timeframe TEXT, event_or_claim TEXT, visual_objective TEXT NOT NULL, visual_description TEXT NOT NULL, must_include TEXT NOT NULL, must_avoid TEXT NOT NULL, primary_search_query TEXT, alternate_search_queries TEXT NOT NULL, generation_prompt TEXT, source_fact_ids TEXT NOT NULL, target_duration_ms INTEGER NOT NULL, target_aspect_ratio TEXT NOT NULL, preferred_orientation TEXT NOT NULL, expected_media_type TEXT NOT NULL, licence_requirements TEXT NOT NULL, map_specification TEXT, programmatic_specification TEXT, text_card_specification TEXT, manual_review_required INTEGER NOT NULL, review_reasons TEXT NOT NULL, status TEXT NOT NULL, selected_candidate_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(manifest_id, scene_index));
CREATE TABLE visual_asset_candidates (id TEXT PRIMARY KEY, requirement_id TEXT NOT NULL, provider TEXT NOT NULL, provider_asset_id TEXT, source_url TEXT, preview_url TEXT, media_identity TEXT, media_type TEXT NOT NULL, mime_type TEXT, width INTEGER, height INTEGER, duration_ms INTEGER, checksum TEXT, title TEXT, licence_type TEXT, licence_url TEXT, attribution_text TEXT, commercial_use_allowed INTEGER, modification_allowed INTEGER, provenance_score INTEGER, overall_score INTEGER, rejection_reasons TEXT NOT NULL, status TEXT NOT NULL, discovered_at TEXT NOT NULL, selected_at TEXT, approved_at TEXT, UNIQUE(requirement_id, provider, provider_asset_id));`);
  bootstrap.close(); control = new Database(databasePath);
  const { VisualAssetRepository } = await import('../packages/storage/dist/repositories/visual-asset.repository.js');
  ({ closeStorageConnection } = await import('../packages/storage/dist/db.js'));
  const repository = new VisualAssetRepository();
  await repository.upsert({ projectId: 'project-a', contentScriptId: 'script-a', scenePlanId: 'plan-a', scenePlanInputHash: 'plan-hash', manifestVersion: 'v1', inputHash: 'input-hash', status: 'needs_review', failureCode: null, failureReason: null, completedAt: null }, [requirement('requirement-a'), requirement('requirement-b')]);
  const manifest = await repository.findByContentScriptId('script-a'); assert.equal(manifest.requirements.length, 2); assert.deepEqual(manifest.requirements.map((item) => item.sceneIndex), [0, 1]);
  const first = await repository.upsertCandidate('requirement-a', candidate('asset-one')); const repeat = await repository.upsertCandidate('requirement-a', candidate('asset-one', { title: 'updated' })); assert.equal(first.id, repeat.id);
  const second = await repository.upsertCandidate('requirement-a', candidate('asset-two')); assert.deepEqual((await repository.listCandidates('requirement-a')).map((item) => item.id), [first.id, second.id]);
  await repository.select('requirement-a', first.id); await repository.select('requirement-a', first.id); await repository.select('requirement-a', second.id); assert.equal((await repository.getCandidate(first.id)).status, 'shortlisted'); assert.equal((await repository.getCandidate(second.id)).status, 'selected');
  await assert.rejects(repository.select('requirement-a', 'not-a-candidate')); const afterBad = await repository.findByContentScriptId('script-a'); assert.equal(afterBad.requirements[0].selectedCandidateId, second.id);
  await repository.reject('requirement-a', second.id, ['licence']); assert.equal((await repository.getCandidate(second.id)).status, 'rejected'); assert.equal((await repository.getRequirement(manifest.id, 'requirement-a')).selectedCandidateId, null); await assert.rejects(repository.select('requirement-a', second.id));
  const validA = await repository.upsertCandidate('requirement-a', candidate('asset-three')); const validB = await repository.upsertCandidate('requirement-b', candidate('asset-four')); await repository.select('requirement-a', validA.id); await repository.recalculateManifestStatus(manifest.id); assert.equal((await repository.findByContentScriptId('script-a')).status, 'needs_review'); await repository.select('requirement-b', validB.id); await repository.recalculateManifestStatus(manifest.id); assert.equal((await repository.findByContentScriptId('script-a')).status, 'ready'); await repository.clear('requirement-a'); await repository.recalculateManifestStatus(manifest.id); assert.equal((await repository.findByContentScriptId('script-a')).status, 'needs_review');
  assert.equal(await repository.getRequirement(manifest.id, 'foreign-requirement'), undefined); await assert.rejects(repository.reject('requirement-b', validA.id, ['cross-requirement']));

  // A separate manifest proves that all mutations remain requirement-scoped; identical
  // provider identities are permitted only because the requirement identity differs.
  await repository.upsert({ projectId: 'project-b', contentScriptId: 'script-b', scenePlanId: 'plan-b', scenePlanInputHash: 'plan-b-hash', manifestVersion: 'v1', inputHash: 'input-b-hash', status: 'needs_review', failureCode: null, failureReason: null, completedAt: null }, [requirement('requirement-c'), requirement('requirement-text', { acquisitionStrategy: 'none_required', requirementType: 'text_card', expectedMediaType: 'image' })]);
  const manifestB = await repository.findByContentScriptId('script-b');
  const foreignCandidate = await repository.upsertCandidate('requirement-c', candidate('asset-three'));
  assert.notEqual(foreignCandidate.id, validA.id);
  await assert.rejects(repository.select('requirement-a', foreignCandidate.id));
  await assert.rejects(repository.reject('requirement-a', foreignCandidate.id, ['cross-manifest']));
  await repository.select('requirement-c', foreignCandidate.id);
  await repository.recalculateManifestStatus(manifestB.id);
  assert.equal((await repository.findByContentScriptId('script-b')).status, 'ready');

  // Failure is injected inside the real SQLite transaction after the old selection
  // would otherwise have been cleared. SQLite must roll every mutation back.
  await repository.select('requirement-a', validA.id);
  const replacement = await repository.upsertCandidate('requirement-a', candidate('asset-replacement'));
  const beforeFailure = await repository.findByContentScriptId('script-a');
  control.exec(`CREATE TRIGGER visual_asset_fail_selection BEFORE UPDATE OF status ON visual_asset_candidates WHEN NEW.id = '${replacement.id}' AND NEW.status = 'selected' BEGIN SELECT RAISE(ABORT, 'injected_selection_failure'); END;`);
  await assert.rejects(repository.select('requirement-a', replacement.id));
  const afterFailure = await repository.findByContentScriptId('script-a');
  assert.equal(afterFailure.requirements[0].selectedCandidateId, beforeFailure.requirements[0].selectedCandidateId);
  assert.equal((await repository.getCandidate(replacement.id)).status, 'discovered');
  assert.equal((await repository.listCandidates('requirement-a')).filter((item) => item.status === 'selected').length, 1);
  assert.equal(afterFailure.status, beforeFailure.status);
  control.exec('DROP TRIGGER visual_asset_fail_selection');
  await repository.select('requirement-a', replacement.id);
  assert.equal((await repository.getRequirement(manifest.id, 'requirement-a')).selectedCandidateId, replacement.id);

  // Rejection of a selected candidate clears the pointer and cannot falsely satisfy readiness.
  await repository.reject('requirement-a', replacement.id, ['withdrawn']);
  await repository.recalculateManifestStatus(manifest.id);
  assert.equal((await repository.findByContentScriptId('script-a')).status, 'needs_review');
  console.log('VISUAL_ASSET_REPOSITORY_INTEGRATION=PASS');
} finally { closeStorageConnection?.(); control?.close(); if (directory) await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); }
