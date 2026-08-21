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
let directory; let control; let closeStorageConnection;
try {
  directory = await mkdtemp(join(tmpdir(), 'content-os-agent-pipeline-'));
  const databasePath = join(directory, 'test.db'); process.env.DATABASE_URL = databasePath;
  control = new Database(databasePath);
  migrate(drizzle(control), { migrationsFolder: fileURLToPath(new URL('../packages/storage/migrations', import.meta.url)) });
  const storage = await import('../packages/storage/dist/index.js'); closeStorageConnection = storage.closeStorageConnection;
  const repository = new storage.AgentPipelineRepository();
  const research = await repository.upsertTask({ projectId: 'project-1', stage: 'research', agentKey: 'research_agent', sourceType: 'research_package', sourceId: 'package-1', status: 'running', sourceStatus: 'pending' });
  const updated = await repository.upsertTask({ projectId: 'project-1', stage: 'research', agentKey: 'research_agent', sourceType: 'research_package', sourceId: 'package-1', status: 'completed', sourceStatus: 'ready' });
  assert.equal(updated.id, research.id); assert.equal(updated.status, 'completed');
  await new Promise((resolve) => setTimeout(resolve, 10));
  const unchanged = await repository.upsertTask({ projectId: 'project-1', stage: 'research', agentKey: 'research_agent', sourceType: 'research_package', sourceId: 'package-1', status: 'completed', sourceStatus: 'ready' });
  assert.deepEqual(unchanged, updated, 'unchanged synchronization must preserve the complete task record');
  const content = await repository.upsertTask({ projectId: 'project-1', stage: 'content', agentKey: 'content_agent', sourceType: 'production_queue_item', sourceId: 'queue-1', status: 'queued', sourceStatus: 'queued' });
  await repository.ensureEvent({ taskId: research.id, type: 'source_status_changed', sourceType: 'research_package', sourceId: 'package-1', sourceStatus: 'ready', occurredAt: '2026-08-21T00:00:00.000Z' });
  await repository.ensureEvent({ taskId: research.id, type: 'source_status_changed', sourceType: 'research_package', sourceId: 'package-1', sourceStatus: 'ready', occurredAt: '2026-08-21T01:00:00.000Z' });
  await repository.ensureEvent({ taskId: research.id, type: 'source_status_changed', sourceType: 'research_package', sourceId: 'package-1', sourceStatus: 'ready', occurredAt: '2026-08-21T00:00:00.000Z' });
  await repository.ensureHandoff({ fromTaskId: research.id, toTaskId: content.id, sourceType: 'research_package', sourceId: 'package-1' });
  await repository.ensureHandoff({ fromTaskId: research.id, toTaskId: content.id, sourceType: 'research_package', sourceId: 'package-1' });
  const pipeline = await repository.getPipeline([research.id, content.id]);
  assert.equal(pipeline.tasks.length, 2); assert.equal(pipeline.events.length, 2); assert.equal(pipeline.handoffs.length, 1);
  closeStorageConnection(); closeStorageConnection = undefined; control.close(); control = undefined;
  console.log('agent pipeline repository integration passed');
} finally {
  if (closeStorageConnection) closeStorageConnection(); if (control) control.close();
  if (directory) await rm(directory, { recursive: true, force: true }).catch((error) => { if (error?.code !== 'EBUSY') throw error; });
}
