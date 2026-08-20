import type { Readable } from 'node:stream';

export interface MaterializeObject { storageKey: string; bytes: Uint8Array; }
export interface MediaStorageProvider {
  readonly id: string;
  materialize(object: MaterializeObject): Promise<boolean>;
  materializeFile?(storageKey: string, sourcePath: string, maxBytes: number): Promise<boolean>;
  resolve(storageKey: string): Promise<Readable>;
  exists(storageKey: string): Promise<boolean>;
  remove(storageKey: string): Promise<void>;
}
export const MEDIA_STORAGE_PROVIDER = Symbol('MEDIA_STORAGE_PROVIDER');
