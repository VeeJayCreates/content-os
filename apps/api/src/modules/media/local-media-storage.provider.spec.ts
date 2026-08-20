import { mkdtemp, readFile, rm } from 'node:fs/promises';
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
});
