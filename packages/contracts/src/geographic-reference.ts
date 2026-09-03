export type GeographicEntityType = 'country' | 'region' | 'city' | 'sea' | 'strait' | 'chokepoint' | 'border' | 'route' | 'custom_zone';
export type GeographicReviewStatus = 'ready' | 'needs_review' | 'unresolved';
export type GeographicGeometryStatus = 'verified_point' | 'verified_bounds' | 'verified_geometry_reference' | 'named_only' | 'relationship_only' | 'unavailable';
export type GeographicPoint = { latitude: number; longitude: number };
export type GeographicBounds = { west: number; south: number; east: number; north: number };
/** A fact-backed named entity. It intentionally contains no inferred geometry. */
export interface GeographicEntity { id: string; canonicalName: string; aliases: string[]; entityType: GeographicEntityType; sourceFactIds: string[]; sourceSignalIds: string[]; }
export interface GeographicReference { id: string; canonicalName: string; aliases: string[]; entityType: GeographicEntityType; point: GeographicPoint | null; bounds: GeographicBounds | null; geometryReference: string | null; parentReferenceId: string | null; provenanceSourceId: string; provenanceReference: string; confidence: number; reviewStatus: GeographicReviewStatus; version: string; revision: number; createdAt: string; updatedAt: string; }
export interface GeographicRelationship { id: string; fromReferenceId: string; toReferenceId: string; relationshipType: 'route' | 'corridor' | 'chokepoint' | 'border_adjacency'; geometryReference: string | null; provenanceSourceId: string; provenanceReference: string; reviewStatus: GeographicReviewStatus; version: string; revision: number; createdAt: string; updatedAt: string; }
export interface ResolvedGeographicReference { id: string; canonicalName: string; entityType: GeographicEntityType; geometryStatus: GeographicGeometryStatus; point: GeographicPoint | null; bounds: GeographicBounds | null; geometryReference: string | null; provenance: { sourceId: string; reference: string; version: string; revision: number }; }
