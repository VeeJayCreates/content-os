import { Injectable } from '@nestjs/common';
import { GeographicReferenceRepository } from '@content-os/storage';
import type { ResolvedGeographicReference } from '@content-os/contracts';

const normalize = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();

@Injectable()
export class GeographicReferenceResolver {
  constructor(private readonly references: GeographicReferenceRepository) {}

  async resolve(names: string[]): Promise<ResolvedGeographicReference[]> {
    const requested = [...new Set(names.filter((name): name is string => typeof name === 'string' && normalize(name).length > 0).map(normalize))].sort();
    if (!requested.length) return [];
    const matches = await this.references.findReadyByNames(requested);
    return requested.flatMap((name) => {
      const candidates = matches.filter((reference) => [reference.canonicalName, ...(reference.aliases ?? [])].some((candidate) => normalize(candidate) === name));
      if (candidates.length !== 1) return [];
      const reference = candidates[0]!;
      const geometryStatus = reference.point ? 'verified_point' : reference.bounds ? 'verified_bounds' : reference.geometryReference ? 'verified_geometry_reference' : 'named_only';
      return [{ id: reference.id, canonicalName: reference.canonicalName, entityType: reference.entityType as ResolvedGeographicReference['entityType'], geometryStatus, point: reference.point, bounds: reference.bounds, geometryReference: reference.geometryReference, provenance: { sourceId: reference.provenanceSourceId, reference: reference.provenanceReference, version: reference.version, revision: reference.revision } }];
    });
  }
  async extractExactFromVerifiedFact(text: string, factId: string, signalIds: string[]): Promise<import('@content-os/contracts').GeographicEntity[]> {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (!normalized || !factId) return [];
    const records = await this.references.findAllReady();
    const matches = new Map<string, typeof records[number]>();
    for (const record of records) {
      const names = [record.canonicalName, ...(record.aliases ?? [])].filter(Boolean);
      if (names.some((name) => new RegExp(`(^|[^\\p{L}\\p{N}])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`, 'iu').test(normalized))) {
        const key = record.canonicalName.trim().toLowerCase();
        if (matches.has(key)) continue;
        matches.set(key, record);
      }
    }
    return [...matches.values()].sort((a, b) => a.id.localeCompare(b.id)).map((record) => ({ id: `geographic-entity:${record.id}`, canonicalName: record.canonicalName, aliases: record.aliases ?? [], entityType: record.entityType as import('@content-os/contracts').GeographicEntityType, sourceFactIds: [factId], sourceSignalIds: [...new Set(signalIds)].sort() }));
  }
}
