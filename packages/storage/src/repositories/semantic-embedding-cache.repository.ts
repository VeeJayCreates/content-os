import { randomUUID } from 'node:crypto';

import { and, eq, inArray } from 'drizzle-orm';

import { db } from '../db.js';
import { semanticEmbeddingCache, type NewSemanticEmbeddingCacheEntry } from '../schema/semantic-embedding-cache.js';

export type SemanticEmbeddingCacheIdentity = {
  projectId: string;
  candidateHash: string;
  provider: string;
  model: string;
  modelVersion: string;
  dimensions: number;
};

export class SemanticEmbeddingCacheRepository {
  async findMany(identity: Omit<SemanticEmbeddingCacheIdentity, 'candidateHash' | 'dimensions'>, candidateHashes: string[]): Promise<Map<string, number[]>> {
    if (candidateHashes.length === 0) return new Map();
    const rows = await db.select().from(semanticEmbeddingCache).where(and(
      eq(semanticEmbeddingCache.projectId, identity.projectId),
      eq(semanticEmbeddingCache.provider, identity.provider),
      eq(semanticEmbeddingCache.model, identity.model),
      eq(semanticEmbeddingCache.modelVersion, identity.modelVersion),
      inArray(semanticEmbeddingCache.candidateHash, candidateHashes),
    ));
    const vectors = new Map<string, number[]>();
    for (const row of rows) {
      const vector = parseVector(row.vectorJson, row.dimensions);
      if (vector) vectors.set(row.candidateHash, vector);
    }
    return vectors;
  }

  async upsertMany(entries: Array<SemanticEmbeddingCacheIdentity & { vector: readonly number[] }>): Promise<void> {
    if (entries.length === 0) return;
    const now = new Date().toISOString();
    db.transaction((tx) => {
      for (const entry of entries) {
        if (!validVector(entry.vector, entry.dimensions)) throw new Error('Semantic embedding cache received an invalid vector');
        const { vector, ...identity } = entry;
        const row: NewSemanticEmbeddingCacheEntry = { id: randomUUID(), ...identity, vectorJson: JSON.stringify(vector), createdAt: now, updatedAt: now };
        tx.insert(semanticEmbeddingCache).values(row).onConflictDoUpdate({
          target: [semanticEmbeddingCache.projectId, semanticEmbeddingCache.candidateHash, semanticEmbeddingCache.provider, semanticEmbeddingCache.model, semanticEmbeddingCache.modelVersion, semanticEmbeddingCache.dimensions],
          set: { vectorJson: JSON.stringify(entry.vector), updatedAt: now },
        }).run();
      }
    });
  }
}

function parseVector(value: string, dimensions: number): number[] | undefined {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && validVector(parsed, dimensions) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function validVector(value: readonly unknown[], dimensions: number): value is number[] {
  return value.length === dimensions && value.every((item) => typeof item === 'number' && Number.isFinite(item));
}
