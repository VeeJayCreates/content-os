import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, like } from 'drizzle-orm';
import { db } from '../db.js';
import { sourceEvidenceContents, type NewSourceEvidenceContent, type SourceEvidenceContent } from '../schema/source-evidence-content.js';

export class SourceEvidenceContentRepository {
  async createIfAbsent(data: Omit<NewSourceEvidenceContent, 'id' | 'createdAt'>): Promise<SourceEvidenceContent> {
    const record: NewSourceEvidenceContent = { ...data, id: randomUUID(), createdAt: new Date().toISOString() };
    await db.insert(sourceEvidenceContents).values(record).onConflictDoNothing();
    return (await this.findByIdentity(record.signalId, record.contentType, record.contentHash, record.version))!;
  }
  async findAvailableBySignalIds(signalIds: string[]) {
    const grouped = new Map<string, SourceEvidenceContent[]>();
    if (!signalIds.length) return grouped;
    const rows = await db.select().from(sourceEvidenceContents).where(and(inArray(sourceEvidenceContents.signalId, signalIds), eq(sourceEvidenceContents.status, 'available'))).orderBy(desc(sourceEvidenceContents.acquiredAt));
    for (const row of rows) grouped.set(row.signalId, [...(grouped.get(row.signalId) ?? []), row]);
    return grouped;
  }
  async findBySignalId(signalId: string) { return db.select().from(sourceEvidenceContents).where(eq(sourceEvidenceContents.signalId, signalId)).orderBy(desc(sourceEvidenceContents.acquiredAt)); }
  async findTranscriptBySignalIds(signalIds: string[]) {
    if (!signalIds.length) return [];
    return db.select().from(sourceEvidenceContents).where(and(inArray(sourceEvidenceContents.signalId, signalIds), eq(sourceEvidenceContents.contentType, 'transcript'))).orderBy(desc(sourceEvidenceContents.acquiredAt));
  }
  async findTranscriptChunksByCanonicalTranscriptId(signalId: string, canonicalTranscriptId: string) {
    return (await this.findBySignalId(signalId)).filter((item) => item.contentType === 'transcript' && item.locator?.canonicalTranscriptId === canonicalTranscriptId && item.status === 'available');
  }
  /** Removes only derived canonical transcript windows; descriptions and other evidence remain intact. */
  async deleteDerivedCanonicalTranscriptChunks() {
    const result = await db.delete(sourceEvidenceContents).where(and(eq(sourceEvidenceContents.contentType, 'transcript'), like(sourceEvidenceContents.locator, '%canonicalTranscriptId%'))).returning({ id: sourceEvidenceContents.id });
    return result.length;
  }
  private async findByIdentity(signalId: string, contentType: string, contentHash: string, version: string) { return (await db.select().from(sourceEvidenceContents).where(and(eq(sourceEvidenceContents.signalId, signalId), eq(sourceEvidenceContents.contentType, contentType), eq(sourceEvidenceContents.contentHash, contentHash), eq(sourceEvidenceContents.version, version))))[0]; }
}
