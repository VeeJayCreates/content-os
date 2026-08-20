import { Injectable } from '@nestjs/common';
import { createReadStream } from 'node:fs';
import { access, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import type { MediaStorageProvider, MaterializeObject } from './media-storage-provider';

@Injectable()
export class LocalMediaStorageProvider implements MediaStorageProvider {
  readonly id = 'local' as const;
  constructor(private readonly root = process.env.MEDIA_STORAGE_ROOT || 'D:\\ContentOS-Media') {}
  private path(key: string) {
    if (!/^[a-z0-9][a-z0-9/_.-]+$/i.test(key) || key.includes('..')) throw new Error('Invalid media storage key');
    const root = resolve(this.root); const target = resolve(root, ...key.split('/'));
    if (!target.startsWith(root + sep)) throw new Error('Invalid media storage key');
    return target;
  }
  async materialize({ storageKey, bytes }: MaterializeObject) {
    if (await this.exists(storageKey)) return false;
    const finalPath = this.path(storageKey); const temporary = `${finalPath}.${process.pid}.${Date.now()}.tmp`;
    await mkdir(dirname(finalPath), { recursive: true });
    try { await writeFile(temporary, bytes, { flag: 'wx' }); await rename(temporary, finalPath); return true; }
    catch (error) { await rm(temporary, { force: true }); if (await this.exists(storageKey)) return false; throw error; }
  }
  async resolve(key: string) { if (!(await this.exists(key))) throw new Error('Media object not found'); return createReadStream(this.path(key)); }
  async exists(key: string) { try { await access(this.path(key)); return true; } catch { return false; } }
  async remove(key: string) { await rm(this.path(key), { force: true }); }
}
