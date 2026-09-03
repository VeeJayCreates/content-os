# Geographic reference ingestion

`curated-v1.json` is intentionally data-only. Every record needs a canonical name,
stable ID, explicit provenance, version, revision, confidence, and review state.

Natural Earth data may be imported through a reviewed conversion step for countries,
regions, and boundaries. Curated records are required for chokepoints, strategic
straits, corridors, and routes. Do not insert coordinates from narration or search
queries. `ready` is reserved for records whose supplied source is reviewed.

Use `node scripts/geographic-reference-natural-earth.mjs <geojson> <version>
<source-reference>` to convert a locally reviewed Natural Earth GeoJSON export. The
converter deliberately emits `needs_review`; an operator must review the source,
geometry scope, aliases, and canonical identity before changing a record to `ready`.
Use `node scripts/geographic-reference-import.mjs [file]` for a dry run and add
`--apply` only against a schema-ready disposable database. Imports are additive:
conflicting identities are skipped and reported, never destructively replaced.
