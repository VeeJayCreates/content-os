import { randomUUID } from 'node:crypto';
import { and, asc, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { transcriptAcquisitionJobs, type TranscriptAcquisitionJob } from '../schema/transcript-acquisition-job.js';

export type TranscriptJobStatus = 'pending' | 'processing' | 'available' | 'no_captions' | 'retryable_failure' | 'permanent_failure';
const RETRYABLE: TranscriptJobStatus = 'retryable_failure';

export class TranscriptAcquisitionJobRepository {
  async createIfAbsent(input: { projectId: string; signalId: string; version: string }): Promise<{ job: TranscriptAcquisitionJob; created: boolean }> {
    const now = new Date().toISOString();
    const inserted = await db.insert(transcriptAcquisitionJobs).values({
      id: randomUUID(), projectId: input.projectId, signalId: input.signalId, version: input.version,
      status: 'pending', attempts: 0, nextAttemptAt: now, lastAttemptAt: null,
      failureClassification: null, createdAt: now, updatedAt: now,
    }).onConflictDoNothing().returning({ id: transcriptAcquisitionJobs.id });
    const job = (await this.findBySignalAndVersion(input.signalId, input.version))!;
    return { job, created: inserted.length > 0 };
  }

  async findBySignalAndVersion(signalId: string, version: string): Promise<TranscriptAcquisitionJob | undefined> {
    return (await db.select().from(transcriptAcquisitionJobs).where(and(eq(transcriptAcquisitionJobs.signalId, signalId), eq(transcriptAcquisitionJobs.version, version))))[0];
  }

  async findById(id: string): Promise<TranscriptAcquisitionJob | undefined> {
    return (await db.select().from(transcriptAcquisitionJobs).where(eq(transcriptAcquisitionJobs.id, id)))[0];
  }

  async findBySignalIds(signalIds: string[]): Promise<TranscriptAcquisitionJob[]> {
    return signalIds.length ? db.select().from(transcriptAcquisitionJobs).where(inArray(transcriptAcquisitionJobs.signalId, signalIds)) : [];
  }

  async findAll(projectId: string): Promise<TranscriptAcquisitionJob[]> {
    return db.select().from(transcriptAcquisitionJobs).where(eq(transcriptAcquisitionJobs.projectId, projectId)).orderBy(asc(transcriptAcquisitionJobs.createdAt));
  }

  /** Conditional update makes two workers unable to intentionally claim the same item. */
  async claimNext(projectId: string, now = new Date().toISOString()): Promise<TranscriptAcquisitionJob | undefined> {
    const candidate = (await db.select().from(transcriptAcquisitionJobs)
      .where(and(eq(transcriptAcquisitionJobs.projectId, projectId), or(eq(transcriptAcquisitionJobs.status, 'pending'), eq(transcriptAcquisitionJobs.status, RETRYABLE)), or(isNull(transcriptAcquisitionJobs.nextAttemptAt), lte(transcriptAcquisitionJobs.nextAttemptAt, now))))
      .orderBy(asc(transcriptAcquisitionJobs.nextAttemptAt), asc(transcriptAcquisitionJobs.createdAt)).limit(1))[0];
    if (!candidate) return undefined;
    const rows = await db.update(transcriptAcquisitionJobs).set({ status: 'processing', attempts: candidate.attempts + 1, lastAttemptAt: now, nextAttemptAt: null, failureClassification: null, updatedAt: now })
      .where(and(eq(transcriptAcquisitionJobs.id, candidate.id), eq(transcriptAcquisitionJobs.status, candidate.status), eq(transcriptAcquisitionJobs.attempts, candidate.attempts)))
      .returning();
    return rows[0];
  }

  /**
   * Claims one explicitly requested due job. The claim predicate is deliberately
   * independent of queue ordering so repair tooling cannot consume another job.
   */
  async claimById(projectId: string, id: string, now = new Date().toISOString()): Promise<TranscriptAcquisitionJob | undefined> {
    const rows = await db.update(transcriptAcquisitionJobs)
      .set({ status: 'processing', attempts: sql`${transcriptAcquisitionJobs.attempts} + 1`, lastAttemptAt: now, nextAttemptAt: null, failureClassification: null, updatedAt: now })
      .where(and(
        eq(transcriptAcquisitionJobs.id, id),
        eq(transcriptAcquisitionJobs.projectId, projectId),
        or(eq(transcriptAcquisitionJobs.status, 'pending'), eq(transcriptAcquisitionJobs.status, RETRYABLE)),
        or(isNull(transcriptAcquisitionJobs.nextAttemptAt), lte(transcriptAcquisitionJobs.nextAttemptAt, now)),
      ))
      .returning();
    return rows[0];
  }

  async complete(id: string, status: Extract<TranscriptJobStatus, 'available' | 'no_captions' | 'permanent_failure'>, failureClassification: string | null = null) {
    const now = new Date().toISOString();
    await db.update(transcriptAcquisitionJobs).set({ status, failureClassification, nextAttemptAt: null, updatedAt: now }).where(and(eq(transcriptAcquisitionJobs.id, id), eq(transcriptAcquisitionJobs.status, 'processing')));
    return this.findById(id);
  }

  async retryLater(id: string, failureClassification: string, nextAttemptAt: string) {
    const now = new Date().toISOString();
    await db.update(transcriptAcquisitionJobs).set({ status: RETRYABLE, failureClassification, nextAttemptAt, updatedAt: now }).where(and(eq(transcriptAcquisitionJobs.id, id), eq(transcriptAcquisitionJobs.status, 'processing')));
    return this.findById(id);
  }

  async retryNow(projectId: string, signalId: string, version: string) {
    const job = await this.findBySignalAndVersion(signalId, version);
    if (!job || job.projectId !== projectId || job.status !== RETRYABLE) return undefined;
    const now = new Date().toISOString();
    await db.update(transcriptAcquisitionJobs).set({ status: 'pending', nextAttemptAt: now, failureClassification: null, updatedAt: now }).where(eq(transcriptAcquisitionJobs.id, job.id));
    return this.findById(job.id);
  }

  async recoverStaleProcessing(projectId: string, staleBefore: string) {
    const now = new Date().toISOString();
    await db.update(transcriptAcquisitionJobs).set({ status: RETRYABLE, failureClassification: 'worker_recovery', nextAttemptAt: now, updatedAt: now })
      .where(and(eq(transcriptAcquisitionJobs.projectId, projectId), eq(transcriptAcquisitionJobs.status, 'processing'), lte(transcriptAcquisitionJobs.lastAttemptAt, staleBefore)));
  }

}
