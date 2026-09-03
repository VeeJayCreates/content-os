import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { researchAutomationRuns, type ResearchAutomationRun } from '../schema/research-automation.js';

export class ResearchAutomationRepository {
  async findByProjectId(projectId: string): Promise<ResearchAutomationRun | undefined> {
    return (await db.select().from(researchAutomationRuns).where(eq(researchAutomationRuns.projectId, projectId)))[0];
  }
  async upsert(data: Omit<ResearchAutomationRun, 'createdAt' | 'updatedAt'>): Promise<ResearchAutomationRun> {
    const now = new Date().toISOString();
    await db.insert(researchAutomationRuns).values({ ...data, createdAt: now, updatedAt: now }).onConflictDoUpdate({
      target: researchAutomationRuns.projectId,
      set: { ...data, updatedAt: now },
    });
    return (await this.findByProjectId(data.projectId))!;
  }
  async createIdle(projectId: string): Promise<ResearchAutomationRun> {
    return this.upsert({ projectId, status: 'idle', lastRunAt: null, nextRunAt: null, opportunitiesProcessed: 0, providerFailures: 0, warnings: [] });
  }
}
