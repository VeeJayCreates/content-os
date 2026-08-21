import { randomUUID } from 'node:crypto';
import { asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { agentHandoffs, agentTaskEvents, agentTasks } from '../schema/agent-pipeline.js';

export class AgentPipelineRepository {
  async upsertTask(data: { projectId: string; stage: string; agentKey: string; sourceType: string; sourceId: string; status: string; sourceStatus: string }) {
    const now = new Date().toISOString();
    const trackedFieldsChanged = sql`${agentTasks.projectId} <> ${data.projectId} OR ${agentTasks.agentKey} <> ${data.agentKey} OR ${agentTasks.status} <> ${data.status} OR ${agentTasks.sourceStatus} <> ${data.sourceStatus}`;
    await db.insert(agentTasks).values({ id: randomUUID(), ...data, createdAt: now, updatedAt: now }).onConflictDoUpdate({
      target: [agentTasks.stage, agentTasks.sourceType, agentTasks.sourceId],
      set: {
        projectId: data.projectId,
        agentKey: data.agentKey,
        status: data.status,
        sourceStatus: data.sourceStatus,
        updatedAt: sql`CASE WHEN ${trackedFieldsChanged} THEN ${now} ELSE ${agentTasks.updatedAt} END`,
      },
    });
    return (await db.select().from(agentTasks).where(eq(agentTasks.sourceId, data.sourceId))).find((row) => row.stage === data.stage && row.sourceType === data.sourceType)!;
  }
  async ensureEvent(data: { taskId: string; type: string; sourceType: string; sourceId: string; sourceStatus: string; occurredAt: string }) {
    await db.insert(agentTaskEvents).values({ id: randomUUID(), ...data }).onConflictDoNothing();
  }
  async ensureHandoff(data: { fromTaskId: string; toTaskId: string; sourceType: string; sourceId: string }) {
    await db.insert(agentHandoffs).values({ id: randomUUID(), ...data, createdAt: new Date().toISOString() }).onConflictDoNothing();
  }
  async getPipeline(taskIds: string[]) {
    if (!taskIds.length) return { tasks: [], events: [], handoffs: [] };
    const tasks = await db.select().from(agentTasks).where(inArray(agentTasks.id, taskIds)).orderBy(asc(agentTasks.createdAt));
    const events = await db.select().from(agentTaskEvents).where(inArray(agentTaskEvents.taskId, taskIds)).orderBy(asc(agentTaskEvents.occurredAt));
    const handoffs = await db.select().from(agentHandoffs).where(inArray(agentHandoffs.fromTaskId, taskIds)).orderBy(asc(agentHandoffs.createdAt));
    return { tasks, events, handoffs };
  }
}
