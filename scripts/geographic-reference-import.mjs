import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const input = process.argv[2] ?? 'data/geographic/curated-v1.json';
const dryRun = !process.argv.includes('--apply');
const allowedTypes = new Set(['country', 'region', 'city', 'sea', 'strait', 'chokepoint', 'border', 'route', 'custom_zone']);
const allowedReview = new Set(['ready', 'needs_review', 'unresolved']);
const finitePoint = (value) => value && Number.isFinite(value.latitude) && Number.isFinite(value.longitude) && value.latitude >= -90 && value.latitude <= 90 && value.longitude >= -180 && value.longitude <= 180;
const validBounds = (value) => value && [value.west, value.east].every((item) => Number.isFinite(item) && item >= -180 && item <= 180) && [value.south, value.north].every((item) => Number.isFinite(item) && item >= -90 && item <= 90) && value.west < value.east && value.south < value.north;
const normalize = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

export function validateDataset(value) {
  if (!value || typeof value !== 'object' || !value.source || !Array.isArray(value.references) || !Array.isArray(value.relationships)) throw new Error('Invalid geographic dataset envelope');
  const ids = new Set();
  for (const reference of value.references) {
    if (!normalize(reference.id) || ids.has(reference.id) || !normalize(reference.canonicalName) || !allowedTypes.has(reference.entityType) || !Array.isArray(reference.aliases) || !normalize(reference.provenanceSourceId) || !normalize(reference.provenanceReference) || !allowedReview.has(reference.reviewStatus) || !Number.isInteger(reference.revision) || reference.revision < 1 || !Number.isInteger(reference.confidence) || reference.confidence < 0 || reference.confidence > 100) throw new Error('Invalid geographic reference');
    if (reference.point && !finitePoint(reference.point)) throw new Error('Invalid geographic point');
    if (reference.bounds && !validBounds(reference.bounds)) throw new Error('Invalid geographic bounds');
    if (reference.reviewStatus === 'ready' && !reference.provenanceReference) throw new Error('Ready geographic reference requires provenance');
    ids.add(reference.id);
  }
  for (const relationship of value.relationships) {
    if (!normalize(relationship.id) || !ids.has(relationship.fromReferenceId) || !ids.has(relationship.toReferenceId) || !['route', 'corridor', 'chokepoint', 'border_adjacency'].includes(relationship.relationshipType) || !allowedReview.has(relationship.reviewStatus) || !normalize(relationship.provenanceSourceId) || !normalize(relationship.provenanceReference)) throw new Error('Invalid geographic relationship');
  }
  return { references: [...value.references].sort((a, b) => a.id.localeCompare(b.id)), relationships: [...value.relationships].sort((a, b) => a.id.localeCompare(b.id)) };
}

export async function readValidatedDataset(file = input) {
  return validateDataset(JSON.parse(await readFile(resolve(file), 'utf8')));
}

export async function runImport({ file = input, apply = !dryRun } = {}) {
  const dataset = await readValidatedDataset(file);
  const report = {
    mode: apply ? 'apply' : 'dry-run', source: file, references: dataset.references.length,
    relationships: dataset.relationships.length,
    ready: dataset.references.filter((record) => record.reviewStatus === 'ready').length,
    needsReview: dataset.references.filter((record) => record.reviewStatus === 'needs_review').length,
  };
  if (!apply) return report;
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for apply');
  const { GeographicReferenceRepository } = await import('../packages/storage/dist/index.js');
  const result = await new GeographicReferenceRepository().importReviewed(dataset);
  return { ...report, ...result };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  console.log(JSON.stringify(await runImport()));
}
