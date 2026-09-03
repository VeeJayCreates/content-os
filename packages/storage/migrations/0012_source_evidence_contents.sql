CREATE TABLE IF NOT EXISTS source_evidence_contents (
  id TEXT PRIMARY KEY NOT NULL, signal_id TEXT NOT NULL, research_source_id TEXT NOT NULL,
  source_url TEXT NOT NULL, content_type TEXT NOT NULL, content TEXT, language TEXT,
  locator_json TEXT, source_published_at TEXT, acquired_at TEXT NOT NULL,
  content_hash TEXT NOT NULL, acquisition_method TEXT NOT NULL,
  provenance_json TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL, version TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS source_evidence_contents_signal_type_hash_version_unique
  ON source_evidence_contents (signal_id, content_type, content_hash, version);
