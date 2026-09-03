import { Injectable, Optional } from '@nestjs/common';
import type { GeographicEntity } from '@content-os/contracts';
import { GeographicReferenceResolver } from './geographic-reference-resolver';

/** Fact-level enrichment is dictionary-only: reviewed references may be named, never invented. */
@Injectable()
export class GeographicEntityEnrichmentService {
  constructor(@Optional() private readonly references?: GeographicReferenceResolver) {}
  async enrich(fact: { id: string; claim: string; status: string }, signalIds: string[]): Promise<GeographicEntity[]> {
    if (fact.status !== 'supported' || !this.references) return [];
    return this.references.extractExactFromVerifiedFact(fact.claim, fact.id, signalIds);
  }
}
