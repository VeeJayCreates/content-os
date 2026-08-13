import { randomUUID } from 'node:crypto'; import { eq } from 'drizzle-orm'; import { db } from '../db.js'; import { contentScripts, type NewContentScript } from '../schema/content-script.js';
export class ContentScriptRepository {
  async findById(id: string) { return (await db.select().from(contentScripts).where(eq(contentScripts.id, id)))[0]; }
  async findByQueueItemId(productionQueueItemId: string) { return (await db.select().from(contentScripts).where(eq(contentScripts.productionQueueItemId, productionQueueItemId)))[0]; }
  async upsert(data: Omit<NewContentScript, 'id' | 'createdAt' | 'updatedAt'>) { const now = new Date().toISOString(); await db.insert(contentScripts).values({ id: randomUUID(), createdAt: now, updatedAt: now, ...data }).onConflictDoUpdate({ target: contentScripts.productionQueueItemId, set: { ...data, updatedAt: now } }); const stored = await this.findByQueueItemId(data.productionQueueItemId); if (!stored) throw new Error('Unable to persist content script'); return stored; }
}
