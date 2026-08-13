import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { audioGenerations, audioSegments, type NewAudioGeneration, type NewAudioSegment } from '../schema/audio-generation.js';

export type AudioGenerationWrite = Omit<NewAudioGeneration, 'id' | 'createdAt' | 'updatedAt'>;
export type AudioSegmentWrite = Omit<NewAudioSegment, 'audioGenerationId' | 'sceneIndex' | 'createdAt' | 'updatedAt'>;

export class AudioGenerationRepository {
  async findByContentScriptId(contentScriptId: string) {
    const generation = (await db.select().from(audioGenerations).where(eq(audioGenerations.contentScriptId, contentScriptId)))[0];
    if (!generation) return undefined;
    const segments = await db.select().from(audioSegments).where(eq(audioSegments.audioGenerationId, generation.id)).orderBy(audioSegments.sceneIndex);
    return { ...generation, segments };
  }

  async upsert(data: AudioGenerationWrite, segments: AudioSegmentWrite[]) {
    const now = new Date().toISOString();
    db.transaction((transaction) => {
      transaction.insert(audioGenerations).values({ id: randomUUID(), createdAt: now, updatedAt: now, ...data }).onConflictDoUpdate({
        target: audioGenerations.contentScriptId,
        set: { ...data, updatedAt: now },
      }).run();
      const generation = transaction.select().from(audioGenerations).where(eq(audioGenerations.contentScriptId, data.contentScriptId)).get();
      if (!generation) throw new Error('Unable to persist audio generation');
      transaction.delete(audioSegments).where(eq(audioSegments.audioGenerationId, generation.id)).run();
      if (segments.length) transaction.insert(audioSegments).values(segments.map((segment, sceneIndex) => ({ ...segment, audioGenerationId: generation.id, sceneIndex, createdAt: now, updatedAt: now }))).run();
    });
    const stored = await this.findByContentScriptId(data.contentScriptId);
    if (!stored) throw new Error('Unable to read persisted audio generation');
    return stored;
  }

  async upsertFailurePreservingReady(data: AudioGenerationWrite) {
    const current = await this.findByContentScriptId(data.contentScriptId);
    if (current?.status === 'ready') return current;
    return this.upsert(data, []);
  }
}
