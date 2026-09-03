import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../db.js';
import { sourceTranscripts, type NewSourceTranscript, type SourceTranscript } from '../schema/source-transcript.js';

export class SourceTranscriptRepository {
  async create(input: Omit<NewSourceTranscript, 'id' | 'createdAt' | 'updatedAt'>): Promise<SourceTranscript> {
    const now = new Date().toISOString();
    const record: NewSourceTranscript = { ...input, id: randomUUID(), createdAt: now, updatedAt: now };
    await db.insert(sourceTranscripts).values(record).onConflictDoNothing();
    return (await this.findBySignalAndVersion(record.signalId, record.version))!;
  }

  async findBySignalId(signalId: string): Promise<SourceTranscript | undefined> {
    return (await db.select().from(sourceTranscripts).where(eq(sourceTranscripts.signalId, signalId)).orderBy(desc(sourceTranscripts.acquiredAt)).limit(1))[0];
  }

  async findBySignalIds(signalIds: string[]): Promise<SourceTranscript[]> {
    if (!signalIds.length) return [];
    return db.select().from(sourceTranscripts).where(inArray(sourceTranscripts.signalId, signalIds)).orderBy(desc(sourceTranscripts.acquiredAt));
  }

  async findBySignalAndVersion(signalId: string, version: string): Promise<SourceTranscript | undefined> {
    return (await db.select().from(sourceTranscripts).where(and(eq(sourceTranscripts.signalId, signalId), eq(sourceTranscripts.version, version))).limit(1))[0];
  }
}
