import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(new URL('../packages/storage/package.json', import.meta.url));
const Database = require('better-sqlite3');
const { migrate } = require('drizzle-orm/better-sqlite3/migrator');
const { drizzle } = require('drizzle-orm/better-sqlite3');

const directory = await mkdtemp(join(tmpdir(), 'content-os-media-repository-'));
const databasePath = join(directory, 'test.db');
process.env.DATABASE_URL = databasePath;
const sqlite = new Database(databasePath);
migrate(drizzle(sqlite), { migrationsFolder: fileURLToPath(new URL('../packages/storage/migrations', import.meta.url)) });
sqlite.close();
const { MediaAssetRepository, closeStorageConnection } = await import('../packages/storage/dist/index.js');
const repository = new MediaAssetRepository();
const value = { id: 'ma_stable', mediaType: 'image', mimeType: 'image/png', checksum: 'abc', sizeBytes: 9,
  sourceType: 'visual_asset_candidate', sourceId: 'candidate', requirementId: 'requirement', sourceIdentity: 'provider:42',
  storageProvider: 'local', storageKey: 'image/ab/abc.png', status: 'ready', createdAt: new Date(0).toISOString() };
const first = await repository.createReady(value); const second = await repository.createReady({ ...value, id: 'ma_duplicate' });
if (first.id !== 'ma_stable' || second.id !== first.id) throw new Error('Media asset reconciliation is not idempotent');
const otherSource = await repository.createReady({ ...value, id: 'ma_other_source', sourceId: 'candidate-2', sourceIdentity: 'provider:43' });
if (otherSource.id !== 'ma_other_source' || otherSource.storageKey !== first.storageKey) throw new Error('Distinct logical assets cannot share physical bytes');
closeStorageConnection(); await rm(directory, { recursive: true, force: true });
console.log('media asset repository integration passed');
