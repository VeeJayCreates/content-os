import { eq, and } from 'drizzle-orm';
import { db } from '../db.js';
import { mediaAssets } from '../schema/media-asset.js';

export type MediaAssetInsert = typeof mediaAssets.$inferInsert;

export class MediaAssetRepository {
  async findReadyBySourceChecksum(sourceIdentity: string, checksum: string) {
    return (await db.select().from(mediaAssets).where(and(eq(mediaAssets.sourceIdentity, sourceIdentity), eq(mediaAssets.checksum, checksum), eq(mediaAssets.status, 'ready'))))[0];
  }
  async findById(id: string) { return (await db.select().from(mediaAssets).where(eq(mediaAssets.id, id)))[0]; }
  async createReady(asset: MediaAssetInsert) {
    await db.insert(mediaAssets).values(asset).onConflictDoNothing();
    return (await this.findReadyBySourceChecksum(asset.sourceIdentity, asset.checksum))!;
  }
}
