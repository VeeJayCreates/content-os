import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db.js';
import { geographicReferences, geographicRelationships } from '../schema/geographic-reference.js';

export class GeographicReferenceRepository {
  async importReviewed(dataset: { references: any[]; relationships: any[] }) {
    const now = new Date().toISOString();
    return db.transaction((tx) => {
      const references = { inserted: 0, skipped: 0 };
      const relationships = { inserted: 0, skipped: 0 };
      for (const reference of dataset.references) {
        const result = tx.insert(geographicReferences).values({ ...reference, aliases: reference.aliases, point: reference.point ?? null, bounds: reference.bounds ?? null, geometryReference: reference.geometryReference ?? null, parentReferenceId: reference.parentReferenceId ?? null, createdAt: now, updatedAt: now }).onConflictDoNothing().run();
        result.changes ? references.inserted++ : references.skipped++;
      }
      for (const relationship of dataset.relationships) {
        const result = tx.insert(geographicRelationships).values({ ...relationship, geometryReference: relationship.geometryReference ?? null, createdAt: now, updatedAt: now }).onConflictDoNothing().run();
        result.changes ? relationships.inserted++ : relationships.skipped++;
      }
      return { imported: true, references, relationships };
    });
  }
  async findReadyByNames(names: string[]) {
    const normalized = [...new Set(names.map((name) => name.trim().toLowerCase()).filter(Boolean))];
    if (!normalized.length) return [];
    const candidates = await db.select().from(geographicReferences).where(eq(geographicReferences.reviewStatus, 'ready'));
    return candidates.filter((reference) => [reference.canonicalName, ...(reference.aliases ?? [])].some((name) => normalized.includes(name.trim().toLowerCase()))).sort((a, b) => a.canonicalName.localeCompare(b.canonicalName) || a.id.localeCompare(b.id));
  }
  async findAllReady() { return db.select().from(geographicReferences).where(eq(geographicReferences.reviewStatus, 'ready')); }
  async findReadyRelationships(referenceIds: string[]) {
    if (!referenceIds.length) return [];
    return db.select().from(geographicRelationships).where(and(eq(geographicRelationships.reviewStatus, 'ready'), inArray(geographicRelationships.fromReferenceId, referenceIds)));
  }
}
