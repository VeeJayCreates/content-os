import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { plannedScenes, scenePlans, type NewPlannedScene, type NewScenePlan } from '../schema/scene-plan.js';

export type ScenePlanWrite = Omit<NewScenePlan, 'id' | 'createdAt' | 'updatedAt'>;
export type PlannedSceneWrite = Omit<NewPlannedScene, 'scenePlanId' | 'sceneIndex' | 'createdAt' | 'updatedAt'>;

export class ScenePlanRepository {
  async findByContentScriptId(contentScriptId: string) {
    const plan = (await db.select().from(scenePlans).where(eq(scenePlans.contentScriptId, contentScriptId)))[0];
    if (!plan) return undefined;
    const scenes = await db.select().from(plannedScenes).where(eq(plannedScenes.scenePlanId, plan.id)).orderBy(plannedScenes.sceneIndex);
    return { ...plan, scenes };
  }

  async upsert(data: ScenePlanWrite, scenes: PlannedSceneWrite[]) {
    const now = new Date().toISOString();
    db.transaction((transaction) => {
      transaction.insert(scenePlans).values({ id: randomUUID(), createdAt: now, updatedAt: now, ...data }).onConflictDoUpdate({
        target: scenePlans.contentScriptId,
        set: { ...data, updatedAt: now },
      }).run();
      const plan = transaction.select().from(scenePlans).where(eq(scenePlans.contentScriptId, data.contentScriptId)).get();
      if (!plan) throw new Error('Unable to persist scene plan');
      transaction.delete(plannedScenes).where(eq(plannedScenes.scenePlanId, plan.id)).run();
      if (scenes.length) {
        transaction.insert(plannedScenes).values(scenes.map((scene, index) => ({ ...scene, scenePlanId: plan.id, sceneIndex: index, createdAt: now, updatedAt: now }))).run();
      }
    });
    const stored = await this.findByContentScriptId(data.contentScriptId);
    if (!stored) throw new Error('Unable to read persisted scene plan');
    return stored;
  }
}
