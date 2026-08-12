import { randomUUID } from 'node:crypto';
import { asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../db.js';
import { productionQueueItems } from '../schema/production-queue.js';
import { opportunities } from '../schema/opportunity.js';
import { researchPackages } from '../schema/research-package.js';

export class ProductionQueueRepository {
  async findById(id: string) { return (await db.select().from(productionQueueItems).where(eq(productionQueueItems.id, id)))[0]; }
  async findAll(projectId: string) { return db.select({ item: productionQueueItems, title: opportunities.title }).from(productionQueueItems).innerJoin(opportunities, eq(productionQueueItems.opportunityId, opportunities.id)).where(eq(productionQueueItems.projectId, projectId)).orderBy(asc(productionQueueItems.priority), desc(productionQueueItems.queuedAt)); }
  async findCoveredOpportunityIds(projectId: string) { const rows = await db.select({ opportunityId: productionQueueItems.opportunityId }).from(productionQueueItems).where(eq(productionQueueItems.projectId, projectId)); return new Set(rows.map((row) => row.opportunityId)); }
  async enqueue(data: Omit<typeof productionQueueItems.$inferInsert, 'id' | 'createdAt' | 'updatedAt'>) { const now = new Date().toISOString(); await db.insert(productionQueueItems).values({ id: randomUUID(), createdAt: now, updatedAt: now, ...data }).onConflictDoNothing(); const rows = await db.select().from(productionQueueItems).where(eq(productionQueueItems.opportunityId, data.opportunityId)); return rows[0]; }
  async updateStatus(id: string, status: string) { const now = new Date().toISOString(); await db.update(productionQueueItems).set({ status, updatedAt: now, startedAt: status === 'processing' ? now : undefined, completedAt: status === 'completed' ? now : undefined, failedAt: status === 'failed' ? now : undefined }).where(eq(productionQueueItems.id, id)); }
  async selectionCandidates(projectId: string) { return db.select({ opportunity: opportunities, researchPackage: researchPackages }).from(opportunities).leftJoin(researchPackages, eq(researchPackages.opportunityId, opportunities.id)).where(eq(opportunities.projectId, projectId)); }
}
