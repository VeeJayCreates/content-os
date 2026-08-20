import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import { db } from '../db.js';
import { visualAssetAcquisitionPlans, visualAssetAcquisitionRuns } from '../schema/visual-asset-acquisition.js';

type RunInsert = Omit<typeof visualAssetAcquisitionRuns.$inferInsert, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'failureCode' | 'startedAt' | 'completedAt'>;
type PlanInsert = Omit<typeof visualAssetAcquisitionPlans.$inferInsert, 'id' | 'runId' | 'planIndex' | 'createdAt'>;

const now = () => new Date().toISOString();

export class VisualAssetAcquisitionRepository {
  async findCompatible(manifestId: string, inputHash: string) {
    const run = (await db.select().from(visualAssetAcquisitionRuns).where(and(
      eq(visualAssetAcquisitionRuns.manifestId, manifestId),
      eq(visualAssetAcquisitionRuns.inputHash, inputHash),
      inArray(visualAssetAcquisitionRuns.status, ['prepared', 'completed']),
    )))[0];
    return run ? this.withPlans(run) : undefined;
  }

  async findByContentScriptId(contentScriptId: string) {
    const run = (await db.select().from(visualAssetAcquisitionRuns)
      .where(eq(visualAssetAcquisitionRuns.contentScriptId, contentScriptId))
      .orderBy(desc(visualAssetAcquisitionRuns.updatedAt), visualAssetAcquisitionRuns.id))[0];
    return run ? this.withPlans(run) : undefined;
  }

  async findById(id: string) {
    const run = (await db.select().from(visualAssetAcquisitionRuns).where(eq(visualAssetAcquisitionRuns.id, id)))[0];
    return run ? this.withPlans(run) : undefined;
  }

  async upsertPrepared(run: RunInsert, plans: PlanInsert[]) {
    const timestamp = now();
    db.transaction((tx) => {
      tx.insert(visualAssetAcquisitionRuns).values({
        id: randomUUID(), createdAt: timestamp, updatedAt: timestamp, status: 'prepared',
        failureCode: null, startedAt: timestamp, completedAt: timestamp, ...run,
      }).onConflictDoUpdate({
        target: [visualAssetAcquisitionRuns.manifestId, visualAssetAcquisitionRuns.inputHash],
        set: { ...run, status: 'prepared', failureCode: null, updatedAt: timestamp, completedAt: timestamp },
      }).run();
      const stored = tx.select().from(visualAssetAcquisitionRuns).where(and(
        eq(visualAssetAcquisitionRuns.manifestId, run.manifestId),
        eq(visualAssetAcquisitionRuns.inputHash, run.inputHash),
      )).get();
      if (!stored) throw new Error('Unable to persist acquisition run');
      tx.delete(visualAssetAcquisitionPlans).where(eq(visualAssetAcquisitionPlans.runId, stored.id)).run();
      if (plans.length) tx.insert(visualAssetAcquisitionPlans).values(plans.map((plan, planIndex) => ({
        id: randomUUID(), runId: stored.id, planIndex, createdAt: timestamp, ...plan,
      }))).run();
    });
    const stored = await this.findCompatible(run.manifestId, run.inputHash);
    if (!stored) throw new Error('Unable to read prepared acquisition run');
    return stored;
  }

  async persistFailure(run: RunInsert, failureCode: string) {
    const timestamp = now();
    await db.insert(visualAssetAcquisitionRuns).values({
      id: randomUUID(), createdAt: timestamp, updatedAt: timestamp, status: 'failed',
      failureCode, startedAt: timestamp, completedAt: timestamp, ...run,
    });
  }

  async recordExecution(id: string, counts: { providerRequestCount: number; candidatesDiscovered: number; candidatesAccepted: number; candidatesRejected: number }) {
    const timestamp = now();
    await db.update(visualAssetAcquisitionRuns).set({
      providerRequestCount: sql`${visualAssetAcquisitionRuns.providerRequestCount} + ${counts.providerRequestCount}`,
      candidatesDiscovered: sql`${visualAssetAcquisitionRuns.candidatesDiscovered} + ${counts.candidatesDiscovered}`,
      candidatesAccepted: sql`${visualAssetAcquisitionRuns.candidatesAccepted} + ${counts.candidatesAccepted}`,
      candidatesRejected: sql`${visualAssetAcquisitionRuns.candidatesRejected} + ${counts.candidatesRejected}`,
      status: 'completed',
      completedAt: timestamp,
      updatedAt: timestamp,
    }).where(and(eq(visualAssetAcquisitionRuns.id, id), eq(visualAssetAcquisitionRuns.status, 'executing')));
    return this.findById(id);
  }

  async claimExecution(id: string) {
    const result = await db.update(visualAssetAcquisitionRuns).set({ status: 'executing', updatedAt: now(), completedAt: null })
      .where(and(eq(visualAssetAcquisitionRuns.id, id), eq(visualAssetAcquisitionRuns.status, 'prepared')));
    return result.changes === 1;
  }

  async failExecution(id: string, failureCode: string) {
    const timestamp = now();
    await db.update(visualAssetAcquisitionRuns).set({ status: 'failed', failureCode, completedAt: timestamp, updatedAt: timestamp })
      .where(and(eq(visualAssetAcquisitionRuns.id, id), eq(visualAssetAcquisitionRuns.status, 'executing')));
  }

  private async withPlans(run: typeof visualAssetAcquisitionRuns.$inferSelect) {
    const plans = await db.select().from(visualAssetAcquisitionPlans)
      .where(eq(visualAssetAcquisitionPlans.runId, run.id))
      .orderBy(visualAssetAcquisitionPlans.planIndex);
    return { ...run, plans };
  }
}
