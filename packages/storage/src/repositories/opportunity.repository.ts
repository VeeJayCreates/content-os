import { randomUUID } from 'node:crypto';

import { desc, eq, getTableColumns, inArray } from 'drizzle-orm';

import { db } from '../db.js';
import { opportunities, opportunitySignals, NewOpportunity } from '../schema/opportunity.js';
import { projects } from '../schema/project.js';
import { researchSources } from '../schema/research-source.js';
import { signals } from '../schema/signal.js';

const opportunityColumns = getTableColumns(opportunities);

export type OpportunityWithProject = typeof opportunities.$inferSelect & { projectName: string };
export type OpportunitySignal = typeof signals.$inferSelect & { sourceName: string };

// A single Opportunity insert binds fourteen values. Fifty stays below SQLite's
// common 999-parameter limit while still avoiding one transaction per row.
const DETECTION_BATCH_SIZE = 50;

type OpportunityUpdate = {
  id: string;
  data: Partial<Omit<NewOpportunity, 'id' | 'projectId' | 'clusterKey' | 'createdAt' | 'updatedAt'>>;
};

type OpportunitySignalLink = { opportunityId: string; signalId: string };

export class OpportunityRepository {
  async findAll(projectId?: string): Promise<OpportunityWithProject[]> {
    const query = db.select({ ...opportunityColumns, projectName: projects.name }).from(opportunities).innerJoin(projects, eq(opportunities.projectId, projects.id));
    return projectId ? query.where(eq(opportunities.projectId, projectId)).orderBy(desc(opportunities.score), desc(opportunities.lastSeenAt)) : query.orderBy(desc(opportunities.score), desc(opportunities.lastSeenAt));
  }

  /**
   * Bounded lookup for incremental topic joining.  Unlike the legacy detector,
   * callers must not load a project's complete opportunity history merely to
   * decide where one newly ingested source item belongs.
   */
  async findRecentByProject(projectId: string, limit: number): Promise<OpportunityWithProject[]> {
    return db
      .select({ ...opportunityColumns, projectName: projects.name })
      .from(opportunities)
      .innerJoin(projects, eq(opportunities.projectId, projects.id))
      .where(eq(opportunities.projectId, projectId))
      .orderBy(desc(opportunities.lastSeenAt), desc(opportunities.updatedAt))
      .limit(limit);
  }

  async findById(id: string): Promise<OpportunityWithProject | undefined> {
    const rows = await db.select({ ...opportunityColumns, projectName: projects.name }).from(opportunities).innerJoin(projects, eq(opportunities.projectId, projects.id)).where(eq(opportunities.id, id));
    return rows[0];
  }

  async findByProjectAndClusterKey(projectId: string, clusterKey: string): Promise<OpportunityWithProject | undefined> {
    const rows = await db.select({ ...opportunityColumns, projectName: projects.name }).from(opportunities).innerJoin(projects, eq(opportunities.projectId, projects.id)).where(eq(opportunities.projectId, projectId));
    return rows.find((opportunity) => opportunity.clusterKey === clusterKey);
  }

  async findSignalsByOpportunityIds(ids: string[]): Promise<Map<string, OpportunitySignal[]>> {
    const grouped = new Map<string, OpportunitySignal[]>();
    if (!ids.length) return grouped;
    const rows = await db.select({ opportunityId: opportunitySignals.opportunityId, signal: signals, sourceName: researchSources.name }).from(opportunitySignals).innerJoin(signals, eq(opportunitySignals.signalId, signals.id)).innerJoin(researchSources, eq(signals.researchSourceId, researchSources.id)).where(inArray(opportunitySignals.opportunityId, ids));
    for (const row of rows) grouped.set(row.opportunityId, [...(grouped.get(row.opportunityId) ?? []), { ...row.signal, sourceName: row.sourceName }]);
    return grouped;
  }

  async findBySignalIds(signalIds: string[]): Promise<Map<string, OpportunityWithProject>> {
    const result = new Map<string, OpportunityWithProject>();
    if (!signalIds.length) return result;
    const rows = await db.select({ signalId: opportunitySignals.signalId, opportunity: opportunities, projectName: projects.name })
      .from(opportunitySignals)
      .innerJoin(opportunities, eq(opportunitySignals.opportunityId, opportunities.id))
      .innerJoin(projects, eq(opportunities.projectId, projects.id))
      .where(inArray(opportunitySignals.signalId, signalIds));
    for (const row of rows) if (!result.has(row.signalId)) result.set(row.signalId, { ...row.opportunity, projectName: row.projectName });
    return result;
  }

  async create(data: Omit<NewOpportunity, 'id' | 'createdAt' | 'updatedAt'>): Promise<OpportunityWithProject> {
    const now = new Date().toISOString();
    const record: NewOpportunity = { id: randomUUID(), createdAt: now, updatedAt: now, ...data };
    await db.insert(opportunities).values(record);
    return (await this.findById(record.id))!;
  }

  async update(id: string, data: Partial<Omit<NewOpportunity, 'id' | 'projectId' | 'clusterKey' | 'createdAt' | 'updatedAt'>>): Promise<OpportunityWithProject | undefined> {
    await db.update(opportunities).set({ ...data, updatedAt: new Date().toISOString() }).where(eq(opportunities.id, id));
    return this.findById(id);
  }

  async attachSignal(opportunityId: string, signalId: string): Promise<boolean> {
    const rows = await db.insert(opportunitySignals).values({ opportunityId, signalId, createdAt: new Date().toISOString() }).onConflictDoNothing().returning({ opportunityId: opportunitySignals.opportunityId });
    return rows.length > 0;
  }

  async persistDetectionBatch(creates: NewOpportunity[], updates: OpportunityUpdate[], links: OpportunitySignalLink[]): Promise<number> {
    let linksCreated = 0;
    db.transaction((tx) => {
      for (const batch of chunk(creates, DETECTION_BATCH_SIZE)) tx.insert(opportunities).values(batch).run();
      for (const update of updates) tx.update(opportunities).set({ ...update.data, updatedAt: new Date().toISOString() }).where(eq(opportunities.id, update.id)).run();
      for (const batch of chunk(links, DETECTION_BATCH_SIZE)) {
        const inserted = tx.insert(opportunitySignals).values(batch.map((link) => ({ ...link, createdAt: new Date().toISOString() }))).onConflictDoNothing().returning({ signalId: opportunitySignals.signalId }).all();
        linksCreated += inserted.length;
      }
    });
    return linksCreated;
  }

  async updateAggregates(updates: OpportunityUpdate[]): Promise<void> {
    if (updates.length === 0) return;
    db.transaction((tx) => {
      for (const update of updates) tx.update(opportunities).set({ ...update.data, updatedAt: new Date().toISOString() }).where(eq(opportunities.id, update.id)).run();
    });
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) batches.push(items.slice(index, index + size));
  return batches;
}
