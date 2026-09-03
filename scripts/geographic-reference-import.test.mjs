import assert from 'node:assert/strict';
import test from 'node:test';
import { validateDataset } from './geographic-reference-import.mjs';
import { naturalEarthFeatureCollectionToDataset } from './geographic-reference-natural-earth.mjs';

const record = {
  id: 'curated:v1:strait:example', canonicalName: 'Example Strait', aliases: ['Example'], entityType: 'strait',
  point: { latitude: 25, longitude: 56 }, provenanceSourceId: 'curated-source', provenanceReference: 'record-1',
  confidence: 90, reviewStatus: 'needs_review', version: 'v1', revision: 1,
};

test('validates and sorts a deterministic curated dataset', () => {
  const result = validateDataset({ source: { id: 'curated', version: 'v1' }, references: [{ ...record, id: 'z' }, { ...record, id: 'a', canonicalName: 'A Strait' }], relationships: [] });
  assert.deepEqual(result.references.map((item) => item.id), ['a', 'z']);
});

test('rejects invalid curated geographic coordinates and relationships', () => {
  assert.throws(() => validateDataset({ source: {}, references: [{ ...record, point: { latitude: 91, longitude: 56 } }], relationships: [] }));
  assert.throws(() => validateDataset({ source: {}, references: [record], relationships: [{ id: 'r1', fromReferenceId: record.id, toReferenceId: 'absent', relationshipType: 'route', reviewStatus: 'needs_review', provenanceSourceId: 'curated', provenanceReference: 'r' }] }));
});

test('converts a controlled Natural Earth GeoJSON feature to a reviewable record', () => {
  const result = naturalEarthFeatureCollectionToDataset({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { NAME_EN: 'Exampleland', ISO_A2: 'EX', NE_ID: 42 }, geometry: { type: 'Polygon', coordinates: [[[50, 20], [51, 20], [51, 21], [50, 20]]] } }] }, { version: '5.1.2', sourceReference: 'ne_10m_admin_0_countries' });
  assert.deepEqual(result.references[0].bounds, { west: 50, south: 20, east: 51, north: 21 });
  assert.equal(result.references[0].reviewStatus, 'needs_review');
  assert.equal(result.references[0].geometryReference, 'natural-earth:5.1.2:42');
});
