import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

test('reviewed geographic imports are additive and idempotent', async () => {
  const root = await mkdtemp(join(tmpdir(), 'content-os-geography-'));
  const filename = join(root, 'references.db');
  const requireFromStorage = createRequire(pathToFileURL(join(process.cwd(), 'packages/storage/package.json')));
  const Database = requireFromStorage('better-sqlite3');
  const sqlite = new Database(filename);
  sqlite.exec(await readFile('packages/storage/migrations/0010_geographic_reference_layer.sql', 'utf8'));
  sqlite.close();
  const priorDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = filename;
  try {
    const { GeographicReferenceRepository, closeStorageConnection } = await import(`../packages/storage/dist/index.js?geography-test=${Date.now()}`);
    const repository = new GeographicReferenceRepository();
    const dataset = {
      references: [{ id: 'curated:v1:strait:test', canonicalName: 'Test Strait', aliases: ['Test'], entityType: 'strait', point: { latitude: 25, longitude: 56 }, bounds: null, geometryReference: null, parentReferenceId: null, provenanceSourceId: 'curated', provenanceReference: 'reviewed-source', confidence: 90, reviewStatus: 'ready', version: 'v1', revision: 1 }],
      relationships: [],
    };
    const first = await repository.importReviewed(dataset);
    const second = await repository.importReviewed(dataset);
    assert.deepEqual(first, { imported: true, references: { inserted: 1, skipped: 0 }, relationships: { inserted: 0, skipped: 0 } });
    assert.deepEqual(second, { imported: true, references: { inserted: 0, skipped: 1 }, relationships: { inserted: 0, skipped: 0 } });
    assert.equal((await repository.findReadyByNames(['test strait'])).length, 1);
    closeStorageConnection();
  } finally {
    if (priorDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = priorDatabaseUrl;
    await rm(root, { recursive: true, force: true });
  }
});
