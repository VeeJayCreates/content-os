import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../db.js';
import { aiBatches, aiBatchItems, type AiBatch, type AiBatchItem } from '../schema/ai-batch.js';

export class AiBatchRepository {
  async create(data: Omit<AiBatch, 'id' | 'createdAt' | 'updatedAt'>, items: Omit<AiBatchItem, 'id' | 'batchId' | 'createdAt' | 'updatedAt'>[]) {
    const now = new Date().toISOString(); const id = randomUUID();
    db.transaction((tx) => { tx.insert(aiBatches).values({ ...data, id, createdAt: now, updatedAt: now }).run(); tx.insert(aiBatchItems).values(items.map((item) => ({ ...item, id: randomUUID(), batchId: id, createdAt: now, updatedAt: now }))).run(); });
    return this.findById(id);
  }
  async findById(id: string): Promise<(AiBatch & { items: AiBatchItem[] }) | undefined> { const batch = (await db.select().from(aiBatches).where(eq(aiBatches.id, id)))[0]; if (!batch) return; const items = await db.select().from(aiBatchItems).where(eq(aiBatchItems.batchId, id)); return { ...batch, items: items.sort((a, b) => a.requestIndex - b.requestIndex) }; }
  async updateBatch(id: string, values: Partial<Omit<AiBatch, 'id' | 'createdAt' | 'updatedAt'>>) { await db.update(aiBatches).set({ ...values, updatedAt: new Date().toISOString() }).where(eq(aiBatches.id, id)); return this.findById(id); }
  async updateItems(batchId: string, updates: { customId: string; status?: string; errorCategory?: string | null; errorCode?: string | null; inputTokens?: number | null; outputTokens?: number | null; estimatedCostMicrounits?: number | null; costCurrency?: string | null; pricingVersion?: string | null }[]) { const now = new Date().toISOString(); db.transaction((tx) => { for (const update of updates) { const { customId, ...values } = update; tx.update(aiBatchItems).set({ ...values, updatedAt: now }).where(and(eq(aiBatchItems.batchId, batchId), eq(aiBatchItems.customId, customId))).run(); } }); return this.findById(batchId); }
  async findItems(batchId: string) { return db.select().from(aiBatchItems).where(eq(aiBatchItems.batchId, batchId)); }
}
