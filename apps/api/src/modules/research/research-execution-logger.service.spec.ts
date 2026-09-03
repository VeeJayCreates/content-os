import { mkdtemp, readFile, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ResearchExecutionLogger } from './research-execution-logger.service';

describe('ResearchExecutionLogger', () => {
  it('keeps one run id across nested minor events and writes result payloads safely', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'contentos-research-log-'));
    const logger = new ResearchExecutionLogger(directory, () => new Date('2026-08-30T10:00:00'));
    await logger.withRun('project-1', async () => logger.withContext({ sourceId: 'source-1' }, () => {
      logger.event('debug', 'source.signal.reused', 'skipped', { result: { signalId: 'signal-1', reasonCode: 'duplicate', apiKey: 'never-write-me' } });
    }));
    await logger.flushForTests();
    const records = (await readFile(logger.filePath(), 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
    const ids = new Set(records.map((record) => record.researchRunId).filter(Boolean));
    expect(ids.size).toBe(1);
    expect(records).toEqual(expect.arrayContaining([expect.objectContaining({ event: 'source.signal.reused', status: 'skipped', sourceId: 'source-1' })]));
    expect(JSON.stringify(records)).toContain('duplicate');
    expect(JSON.stringify(records)).not.toContain('never-write-me');
  });

  it('rotates by local date and safely retains only five matching daily files', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'contentos-research-log-'));
    await writeFile(join(directory, 'research-2026-08-20.log'), 'old\n');
    await writeFile(join(directory, 'other.log'), 'keep\n');
    const logger = new ResearchExecutionLogger(directory, () => new Date('2026-08-30T10:00:00'));
    await logger.initialize();
    logger.event('info', 'first', 'completed');
    await logger.flushForTests();
    const tomorrow = new ResearchExecutionLogger(directory, () => new Date('2026-08-31T10:00:00'));
    await tomorrow.initialize(); tomorrow.event('info', 'second', 'completed'); await tomorrow.flushForTests();
    const files = await readdir(directory);
    expect(files).toContain('research-2026-08-30.log');
    expect(files).toContain('research-2026-08-31.log');
    expect(files).not.toContain('research-2026-08-20.log');
    expect(files).toContain('other.log');
  });

  it('does not make a run fail when its destination cannot be created', async () => {
    const logger = new ResearchExecutionLogger('\0invalid');
    await expect(logger.withRun('project-1', async () => 'safe')).resolves.toBe('safe');
  });

  it('keeps repeated runs distinguishable and records a classified rejection result', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'contentos-research-log-'));
    const logger = new ResearchExecutionLogger(directory, () => new Date('2026-08-30T10:00:00'));
    await logger.withRun('project-1', async () => logger.event('warn', 'external_discovery.candidate.rejected', 'rejected', { result: { reasonCode: 'duplicate_source_identity', authorization: 'never-write-me' } }));
    await logger.withRun('project-1', async () => logger.event('warn', 'source.refresh.failed', 'failed', { result: { failureCategory: 'network_unavailable' } }));
    await logger.flushForTests();
    const records = (await readFile(logger.filePath(), 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
    expect(new Set(records.map((record) => record.researchRunId).filter(Boolean)).size).toBe(2);
    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({ event: 'external_discovery.candidate.rejected', status: 'rejected', result: expect.objectContaining({ reasonCode: 'duplicate_source_identity' }) }),
      expect.objectContaining({ event: 'source.refresh.failed', status: 'failed', result: expect.objectContaining({ failureCategory: 'network_unavailable' }) }),
    ]));
    expect(JSON.stringify(records)).not.toContain('never-write-me');
  });
});
