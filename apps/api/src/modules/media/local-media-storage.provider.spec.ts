import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalMediaStorageProvider } from './local-media-storage.provider';

describe('LocalMediaStorageProvider', () => {
  let root: string;
  beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'content-os-media-')); });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });
  it('atomically materializes and idempotently resolves a deterministic key', async () => {
    const provider = new LocalMediaStorageProvider(root); const key = 'image/ab/abcdef.png';
    await expect(provider.materialize({ storageKey: key, bytes: Uint8Array.from([1, 2, 3]) })).resolves.toBe(true);
    await expect(provider.materialize({ storageKey: key, bytes: Uint8Array.from([9]) })).resolves.toBe(false);
    expect(await readFile(join(root, ...key.split('/')))).toEqual(Buffer.from([1, 2, 3]));
    expect(await provider.exists(key)).toBe(true);
  });
  it('does not allow keys to escape the configured root', async () => {
    await expect(new LocalMediaStorageProvider(root).exists('../escape')).resolves.toBe(false);
  });
  it('never replaces destination bytes when file publishers race or collide', async () => {
    const provider = new LocalMediaStorageProvider(root); const key = 'video/ab/artifact.mp4';
    const first = join(root, 'first.mp4'); const second = join(root, 'second.mp4');
    await Promise.all([writeFile(first, 'first-artifact'), writeFile(second, 'second-artifact')]);
    const results = await Promise.all([provider.materializeFile(key, first, 1024), provider.materializeFile(key, second, 1024)]);
    expect(results.sort()).toEqual([false, true]);
    const published = await readFile(join(root, ...key.split('/')), 'utf8');
    expect(['first-artifact', 'second-artifact']).toContain(published);
    const losingSource = published === 'first-artifact' ? second : first;
    await expect(provider.materializeFile(key, losingSource, 1024)).resolves.toBe(false);
    expect(await readFile(join(root, ...key.split('/')), 'utf8')).toBe(published);
  });
});
