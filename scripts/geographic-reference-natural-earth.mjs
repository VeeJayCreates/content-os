import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const normalize = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const slug = (value) => normalize(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const finite = (value) => Number.isFinite(value);

function collectCoordinates(value, output = []) {
  if (!Array.isArray(value)) return output;
  if (value.length === 2 && finite(value[0]) && finite(value[1])) output.push(value);
  else value.forEach((child) => collectCoordinates(child, output));
  return output;
}

export function naturalEarthFeatureCollectionToDataset(collection, { version, sourceReference } = {}) {
  if (!collection || collection.type !== 'FeatureCollection' || !Array.isArray(collection.features) || !normalize(version) || !normalize(sourceReference)) throw new Error('Natural Earth conversion requires a FeatureCollection, version, and source reference');
  const references = collection.features.map((feature) => {
    const properties = feature?.properties ?? {};
    const canonicalName = normalize(properties.NAME_EN ?? properties.NAME ?? properties.ADMIN ?? properties.SOVEREIGNT);
    const aliases = [...new Set([properties.NAME, properties.NAME_LONG, properties.BRK_NAME].map(normalize).filter((name) => name && name !== canonicalName))].sort();
    const coordinates = collectCoordinates(feature?.geometry?.coordinates);
    if (!canonicalName || !coordinates.length) throw new Error('Natural Earth feature requires a named geometry');
    const longitudes = coordinates.map(([longitude]) => longitude);
    const latitudes = coordinates.map(([, latitude]) => latitude);
    if (longitudes.some((longitude) => longitude < -180 || longitude > 180) || latitudes.some((latitude) => latitude < -90 || latitude > 90)) throw new Error('Natural Earth geometry has invalid coordinates');
    return {
      id: `natural-earth:${version}:country:${slug(properties.ISO_A2_EH ?? properties.ISO_A2 ?? canonicalName)}`,
      canonicalName, aliases, entityType: 'country',
      bounds: { west: Math.min(...longitudes), south: Math.min(...latitudes), east: Math.max(...longitudes), north: Math.max(...latitudes) },
      geometryReference: `natural-earth:${version}:${normalize(properties.NE_ID ?? canonicalName)}`,
      provenanceSourceId: 'natural-earth', provenanceReference: sourceReference,
      confidence: 100, reviewStatus: 'needs_review', version, revision: 1,
    };
  });
  return { source: { id: 'natural-earth', version, license: 'public-domain; source conversion requires review' }, references: references.sort((a, b) => a.id.localeCompare(b.id)), relationships: [] };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const [file, version, sourceReference] = process.argv.slice(2);
  const collection = JSON.parse(await readFile(resolve(file), 'utf8'));
  console.log(JSON.stringify(naturalEarthFeatureCollectionToDataset(collection, { version, sourceReference })));
}
