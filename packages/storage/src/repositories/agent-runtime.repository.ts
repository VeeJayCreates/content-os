import { randomUUID } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { agentActivities, agentRuns, type AgentActivityRecord, type AgentRunRecord } from '../schema/agent-runtime.js';

export interface AgentRunFilters { projectId?: string; agentKey?: string; status?: string; limit?: number }

export class AgentRuntimeRepository {
  async createRun(data: { agentKey: string; projectId?: string; subjectType?: string; subjectId?: string; stateJson?: string }): Promise<AgentRunRecord> {
    const now = new Date().toISOString();
    const row = { id: randomUUID(), agentKey: data.agentKey, projectId: data.projectId ?? null, subjectType: data.subjectType ?? null, subjectId: data.subjectId ?? null, status: 'queued', currentActivity: null, stateJson: data.stateJson ?? '{}', startedAt: null, completedAt: null, createdAt: now, updatedAt: now };
    await db.insert(agentRuns).values(row);
    return row;
  }

  async findRunById(id: string): Promise<AgentRunRecord | undefined> {
    return (await db.select().from(agentRuns).where(eq(agentRuns.id, id)).limit(1))[0];
  }

  async findRuns(filters: AgentRunFilters): Promise<AgentRunRecord[]> {
    const conditions = [filters.projectId ? eq(agentRuns.projectId, filters.projectId) : undefined, filters.agentKey ? eq(agentRuns.agentKey, filters.agentKey) : undefined, filters.status ? eq(agentRuns.status, filters.status) : undefined].filter((value): value is NonNullable<typeof value> => Boolean(value));
    return db.select().from(agentRuns).where(conditions.length ? and(...conditions) : undefined).orderBy(desc(agentRuns.updatedAt), desc(agentRuns.createdAt), desc(agentRuns.id)).limit(filters.limit ?? 50);
  }

  async findActivities(runId: string): Promise<AgentActivityRecord[]> {
    return db.select().from(agentActivities).where(eq(agentActivities.runId, runId)).orderBy(agentActivities.sequence);
  }

  async updateState(id: string, stateJson: string, expectedStatus: string): Promise<AgentRunRecord | undefined> {
    return db.transaction((tx) => {
      const run = tx.select().from(agentRuns).where(eq(agentRuns.id, id)).limit(1).all()[0];
      if (!run) return undefined;
      if (run.status !== expectedStatus) throw Object.assign(new Error('Agent run state changed'), { code: 'agent_run_state_changed' });
      if (['completed', 'failed', 'cancelled'].includes(run.status)) throw Object.assign(new Error('Agent run is terminal'), { code: 'agent_run_terminal' });
      const updatedAt = new Date().toISOString();
      tx.update(agentRuns).set({ stateJson, updatedAt }).where(eq(agentRuns.id, id)).run();
      return { ...run, stateJson, updatedAt };
    });
  }

  async appendActivity(data: { runId: string; type: string; message: string; stateJson?: string; status?: string; expectedStatus: string }): Promise<AgentActivityRecord> {
    const now = new Date().toISOString();
    return db.transaction((tx) => {
      const run = tx.select().from(agentRuns).where(eq(agentRuns.id, data.runId)).limit(1).all()[0];
      if (!run) throw Object.assign(new Error('Agent run not found'), { code: 'agent_run_not_found' });
      if (run.status !== data.expectedStatus) throw Object.assign(new Error('Agent run state changed'), { code: 'agent_run_state_changed' });
      if (['completed', 'failed', 'cancelled'].includes(run.status)) throw Object.assign(new Error('Agent run is terminal'), { code: 'agent_run_terminal' });
      const sequence = Number(tx.select({ value: sql<number>`coalesce(max(${agentActivities.sequence}), 0) + 1` }).from(agentActivities).where(eq(agentActivities.runId, data.runId)).all()[0]?.value ?? 1);
      const activity = { id: randomUUID(), runId: data.runId, sequence, type: data.type, message: data.message, stateJson: data.stateJson ?? null, createdAt: now };
      tx.insert(agentActivities).values(activity).run();
      const status = data.status ?? run.status;
      const terminal = status === 'completed' || status === 'failed' || status === 'cancelled';
      tx.update(agentRuns).set({ status, currentActivity: data.message, stateJson: data.stateJson ?? run.stateJson, startedAt: status === 'running' && !run.startedAt ? now : run.startedAt, completedAt: terminal ? now : null, updatedAt: now }).where(eq(agentRuns.id, data.runId)).run();
      return activity;
    });
  }
}
