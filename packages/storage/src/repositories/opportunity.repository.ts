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

export class OpportunityRepository {
  async findAll(projectId?: string): Promise<OpportunityWithProject[]> {
    const query = db.select({ ...opportunityColumns, projectName: projects.name }).from(opportunities).innerJoin(projects, eq(opportunities.projectId, projects.id));
    return projectId ? query.where(eq(opportunities.projectId, projectId)).orderBy(desc(opportunities.score), desc(opportunities.lastSeenAt)) : query.orderBy(desc(opportunities.score), desc(opportunities.lastSeenAt));
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
}
