import { randomUUID } from 'node:crypto';
import { and, eq, or } from 'drizzle-orm';

import { db } from '../db.js';
import {
  sceneVisualRequirements,
  visualAssetCandidates,
  visualAssetManifests,
} from '../schema/visual-asset.js';

type ManifestInsert = Omit<typeof visualAssetManifests.$inferInsert, 'id' | 'createdAt' | 'updatedAt'>;
type RequirementInsert = Omit<typeof sceneVisualRequirements.$inferInsert, 'manifestId' | 'sceneIndex' | 'createdAt' | 'updatedAt'>;
type CandidateInsert = Omit<typeof visualAssetCandidates.$inferInsert, 'id' | 'requirementId' | 'discoveredAt' | 'selectedAt' | 'approvedAt'>;

const now = () => new Date().toISOString();

export const mergeRediscoveredCandidate = <T extends { status: string; selectedAt: string | null; approvedAt: string | null }>(existing: T, discovered: Partial<T>) => ({
  ...existing,
  ...discovered,
  status: existing.status,
  selectedAt: existing.selectedAt,
  approvedAt: existing.approvedAt,
});

const candidateSatisfies = (requirement: typeof sceneVisualRequirements.$inferSelect, candidate: typeof visualAssetCandidates.$inferSelect | undefined) => {
  if (!candidate || candidate.status === 'rejected' || candidate.status === 'stale' || candidate.status === 'unavailable') return false;
  if (!candidate.sourceUrl && !candidate.providerAssetId) return false;
  const licence = requirement.licenceRequirements as Record<string, boolean>;
  if (licence.commercialUseRequired && candidate.commercialUseAllowed !== true) return false;
  if (licence.modificationAllowed && candidate.modificationAllowed !== true) return false;
  if (licence.attributionRequired && !candidate.attributionText) return false;
  if (candidate.mediaType !== requirement.expectedMediaType) return false;
  return true;
};

export class VisualAssetRepository {
  async findByContentScriptId(contentScriptId: string) {
    const manifest = (await db.select().from(visualAssetManifests).where(eq(visualAssetManifests.contentScriptId, contentScriptId)))[0];
    if (!manifest) return undefined;
    return this.complete(manifest);
  }

  async getRequirement(manifestId: string, requirementId: string) {
    return (await db.select().from(sceneVisualRequirements).where(and(eq(sceneVisualRequirements.id, requirementId), eq(sceneVisualRequirements.manifestId, manifestId))))[0];
  }

  async listCandidates(requirementId: string) {
    return db.select().from(visualAssetCandidates).where(eq(visualAssetCandidates.requirementId, requirementId)).orderBy(visualAssetCandidates.discoveredAt, visualAssetCandidates.id);
  }

  async getCandidate(id: string) {
    return (await db.select().from(visualAssetCandidates).where(eq(visualAssetCandidates.id, id)))[0];
  }

  async upsert(data: ManifestInsert, requirements: RequirementInsert[]) {
    const timestamp = now();
    db.transaction((tx) => {
      tx.insert(visualAssetManifests).values({ id: randomUUID(), createdAt: timestamp, updatedAt: timestamp, ...data }).onConflictDoUpdate({
        target: visualAssetManifests.contentScriptId,
        set: { ...data, updatedAt: timestamp },
      }).run();
      const manifest = tx.select().from(visualAssetManifests).where(eq(visualAssetManifests.contentScriptId, data.contentScriptId)).get();
      if (!manifest) throw new Error('Unable to persist visual asset manifest');
      tx.delete(sceneVisualRequirements).where(eq(sceneVisualRequirements.manifestId, manifest.id)).run();
      if (requirements.length) {
        tx.insert(sceneVisualRequirements).values(requirements.map((requirement, sceneIndex) => ({
          manifestId: manifest.id, sceneIndex, createdAt: timestamp, updatedAt: timestamp, ...requirement,
        }))).run();
      }
    });
    const stored = await this.findByContentScriptId(data.contentScriptId);
    if (!stored) throw new Error('Unable to read visual asset manifest');
    return stored;
  }

  async upsertCandidate(requirementId: string, data: CandidateInsert) {
    const identity = data.providerAssetId
      ? and(eq(visualAssetCandidates.providerAssetId, data.providerAssetId), eq(visualAssetCandidates.provider, data.provider))
      : data.sourceUrl
        ? and(eq(visualAssetCandidates.sourceUrl, data.sourceUrl), eq(visualAssetCandidates.provider, data.provider))
        : undefined;
    if (!identity) throw new Error('Candidate identity is required');
    const existing = (await db.select().from(visualAssetCandidates).where(and(eq(visualAssetCandidates.requirementId, requirementId), identity)))[0];
    if (existing) {
      const update = { ...data, status: existing.status, selectedAt: existing.selectedAt, approvedAt: existing.approvedAt };
      await db.update(visualAssetCandidates).set(update).where(eq(visualAssetCandidates.id, existing.id));
      return mergeRediscoveredCandidate(existing, data);
    }
    const candidate = { id: randomUUID(), requirementId, discoveredAt: now(), selectedAt: null, approvedAt: null, ...data };
    await db.insert(visualAssetCandidates).values(candidate);
    return candidate;
  }

  async select(requirementId: string, candidateId: string) {
    return db.transaction((tx) => {
      const requirement = tx.select().from(sceneVisualRequirements).where(eq(sceneVisualRequirements.id, requirementId)).get();
      const candidate = tx.select().from(visualAssetCandidates).where(and(eq(visualAssetCandidates.id, candidateId), eq(visualAssetCandidates.requirementId, requirementId))).get();
      if (!requirement || !candidate || !candidateSatisfies(requirement, candidate)) throw new Error('Candidate is not selectable');
      const timestamp = now();
      if (requirement.selectedCandidateId === candidateId) return candidate;
      tx.update(visualAssetCandidates).set({ status: 'shortlisted', selectedAt: null }).where(and(eq(visualAssetCandidates.requirementId, requirementId), or(eq(visualAssetCandidates.status, 'selected'), eq(visualAssetCandidates.status, 'approved')))).run();
      tx.update(visualAssetCandidates).set({ status: 'selected', selectedAt: timestamp }).where(eq(visualAssetCandidates.id, candidateId)).run();
      tx.update(sceneVisualRequirements).set({ selectedCandidateId: candidateId, updatedAt: timestamp }).where(eq(sceneVisualRequirements.id, requirementId)).run();
      return candidate;
    });
  }

  async clear(requirementId: string) {
    db.transaction((tx) => {
      const timestamp = now();
      tx.update(visualAssetCandidates).set({ status: 'shortlisted', selectedAt: null }).where(and(eq(visualAssetCandidates.requirementId, requirementId), or(eq(visualAssetCandidates.status, 'selected'), eq(visualAssetCandidates.status, 'approved')))).run();
      tx.update(sceneVisualRequirements).set({ selectedCandidateId: null, updatedAt: timestamp }).where(eq(sceneVisualRequirements.id, requirementId)).run();
    });
  }

  async reject(requirementId: string, candidateId: string, reasons: string[]) {
    db.transaction((tx) => {
      const candidate = tx.select().from(visualAssetCandidates).where(and(eq(visualAssetCandidates.id, candidateId), eq(visualAssetCandidates.requirementId, requirementId))).get();
      if (!candidate) throw new Error('Candidate not found');
      const timestamp = now();
      tx.update(visualAssetCandidates).set({ status: 'rejected', rejectionReasons: reasons, selectedAt: null }).where(eq(visualAssetCandidates.id, candidateId)).run();
      tx.update(sceneVisualRequirements).set({ selectedCandidateId: null, updatedAt: timestamp }).where(and(eq(sceneVisualRequirements.id, requirementId), eq(sceneVisualRequirements.selectedCandidateId, candidateId))).run();
    });
  }

  async recalculateManifestStatus(manifestId: string) {
    db.transaction((tx) => {
      const manifest = tx.select().from(visualAssetManifests).where(eq(visualAssetManifests.id, manifestId)).get();
      if (!manifest || manifest.status === 'stale') return;
      const requirements = tx.select().from(sceneVisualRequirements).where(eq(sceneVisualRequirements.manifestId, manifestId)).all();
      const candidates = tx.select().from(visualAssetCandidates).all();
      const unresolved = requirements.some((requirement) => {
        if (requirement.acquisitionStrategy === 'none_required') return false;
        if (requirement.manualReviewRequired) return true;
        return !candidateSatisfies(requirement, candidates.find((candidate) => candidate.id === requirement.selectedCandidateId));
      });
      tx.update(visualAssetManifests).set({
        status: unresolved ? 'needs_review' : 'ready',
        completedAt: unresolved ? null : now(),
        updatedAt: now(),
      }).where(eq(visualAssetManifests.id, manifestId)).run();
    });
  }

  private async complete(manifest: typeof visualAssetManifests.$inferSelect) {
    const requirements = await db.select().from(sceneVisualRequirements).where(eq(sceneVisualRequirements.manifestId, manifest.id)).orderBy(sceneVisualRequirements.sceneIndex);
    const candidates = await db.select().from(visualAssetCandidates);
    return { ...manifest, requirements: requirements.map((requirement) => ({ ...requirement, candidates: candidates.filter((candidate) => candidate.requirementId === requirement.id).sort((a, b) => a.discoveredAt.localeCompare(b.discoveredAt) || a.id.localeCompare(b.id)) })) };
  }
}
