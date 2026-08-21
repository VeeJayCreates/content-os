import { Inject, Injectable } from '@nestjs/common';
import { createReadStream, createWriteStream } from 'node:fs';
import { access, link, mkdir, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { MEDIA_STORAGE_ROOT, type MediaStorageProvider, type MaterializeObject } from './media-storage-provider';

@Injectable()
export class LocalMediaStorageProvider implements MediaStorageProvider {
  readonly id = 'local' as const;
  constructor(@Inject(MEDIA_STORAGE_ROOT) private readonly root: string) {}
  private path(key: string) {
    if (!/^[a-z0-9][a-z0-9/_.-]+$/i.test(key) || key.includes('..')) throw new Error('Invalid media storage key');
    const root = resolve(this.root); const target = resolve(root, ...key.split('/'));
    if (!target.startsWith(root + sep)) throw new Error('Invalid media storage key');
    return target;
  }
  async materialize({ storageKey, bytes }: MaterializeObject) {
    if (await this.exists(storageKey)) return false;
    const finalPath = this.path(storageKey); const temporary = `${finalPath}.${process.pid}.${randomUUID()}.tmp`;
    await mkdir(dirname(finalPath), { recursive: true });
    try { await writeFile(temporary, bytes, { flag: 'wx' }); await link(temporary, finalPath); await rm(temporary); return true; }
    catch (error) { await rm(temporary, { force: true }); if (await this.exists(storageKey)) return false; throw error; }
  }
  async materializeFile(storageKey: string, sourcePath: string, maxBytes: number) {
    if (await this.exists(storageKey)) return false;
    const finalPath = this.path(storageKey); const temporary = `${finalPath}.${process.pid}.${randomUUID()}.tmp`; let size=0;
    await mkdir(dirname(finalPath), { recursive: true });
    try { await pipeline(createReadStream(sourcePath),new Transform({transform(chunk,_encoding,callback){size+=chunk.length;callback(size>maxBytes?new Error('output_size_limit'):undefined,chunk);}}),createWriteStream(temporary,{flags:'wx'}));await link(temporary,finalPath);await rm(temporary);return true; }
    catch(error){await rm(temporary,{force:true});if(await this.exists(storageKey))return false;throw error;}
  }
  async resolve(key: string) { if (!(await this.exists(key))) throw new Error('Media object not found'); return createReadStream(this.path(key)); }
  async exists(key: string) { try { await access(this.path(key)); return true; } catch { return false; } }
  async remove(key: string) { await rm(this.path(key), { force: true }); }
}
