import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../packages/storage/package.json', import.meta.url));
const Database = require('better-sqlite3');
const { drizzle } = require('drizzle-orm/better-sqlite3');
const { migrate } = require('drizzle-orm/better-sqlite3/migrator');
let directory;
let control;
let closeStorageConnection;
try {
  directory = await mkdtemp(join(tmpdir(), 'content-os-agent-runtime-'));
  const databasePath = join(directory, 'test.db');
  process.env.DATABASE_URL = databasePath;
  control = new Database(databasePath);
  migrate(drizzle(control), { migrationsFolder: fileURLToPath(new URL('../packages/storage/migrations', import.meta.url)) });
  const storage = await import('../packages/storage/dist/index.js');
  const { AgentRuntimeRepository } = storage;
  closeStorageConnection = storage.closeStorageConnection;
  const repository = new AgentRuntimeRepository();
  const run = await repository.createRun({ agentKey: 'research_agent', projectId: 'project-1', subjectType: 'opportunity', subjectId: 'opportunity-1', stateJson: '{"planned":2}' });
  assert.equal(run.status, 'queued');
  assert.equal((await repository.findActivities(run.id)).length, 0);
  await repository.appendActivity({ runId: run.id, type: 'started', message: 'Collecting sources', status: 'running', expectedStatus: 'queued', stateJson: '{"collected":0}' });
  await repository.appendActivity({ runId: run.id, type: 'progress', message: 'One source collected', expectedStatus: 'running', stateJson: '{"collected":1}' });
  const persisted = await repository.findRunById(run.id);
  assert.equal(persisted.status, 'running');
  assert.equal(persisted.currentActivity, 'One source collected');
  assert.equal(persisted.stateJson, '{"collected":1}');
  assert.ok(persisted.startedAt);
  assert.deepEqual((await repository.findActivities(run.id)).map(({ sequence, type }) => ({ sequence, type })), [{ sequence: 1, type: 'started' }, { sequence: 2, type: 'progress' }]);
  assert.equal((await repository.findRuns({ projectId: 'project-1', status: 'running' })).length, 1);
  const insertRun = control.prepare(`
    INSERT INTO agent_runs (id, agent_key, project_id, status, state_json, created_at, updated_at)
    VALUES (?, 'ordering_agent', 'ordering-project', 'queued', '{}', ?, ?)
  `);
  const sharedUpdatedAt = '2026-01-01T00:00:00.000Z';
  insertRun.run('run-a', '2025-12-31T23:59:58.000Z', sharedUpdatedAt);
  insertRun.run('run-b', '2025-12-31T23:59:59.000Z', sharedUpdatedAt);
  insertRun.run('run-c', '2025-12-31T23:59:59.000Z', sharedUpdatedAt);
  assert.deepEqual(
    (await repository.findRuns({ projectId: 'ordering-project' })).map(({ id }) => id),
    ['run-c', 'run-b', 'run-a'],
  );
  await repository.appendActivity({ runId: run.id, type: 'completed', message: 'Done', status: 'completed', expectedStatus: 'running' });
  await assert.rejects(() => repository.appendActivity({ runId: run.id, type: 'progress', message: 'Late update', expectedStatus: 'running' }), (error) => error.code === 'agent_run_state_changed');
  await assert.rejects(() => repository.updateState(run.id, '{"late":true}', 'running'), (error) => error.code === 'agent_run_state_changed');
  assert.equal((await repository.findActivities(run.id)).length, 3);
  assert.equal((await repository.findRunById(run.id)).currentActivity, 'Done');
  closeStorageConnection();
  closeStorageConnection = undefined;
  control.close();
  control = undefined;
  console.log('agent runtime repository integration passed');
} finally {
  if (closeStorageConnection) closeStorageConnection();
  if (control) control.close();
  if (directory) await rm(directory, { recursive: true, force: true }).catch((error) => { if (error?.code !== 'EBUSY') throw error; });
}
