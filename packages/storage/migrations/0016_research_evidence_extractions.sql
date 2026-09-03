CREATE TABLE IF NOT EXISTS `research_evidence_extractions` (
  `id` text PRIMARY KEY NOT NULL,
  `evidence_content_id` text NOT NULL,
  `input_hash` text NOT NULL UNIQUE,
  `status` text NOT NULL,
  `facts_json` text NOT NULL DEFAULT '[]',
  `failure_category` text,
  `provider` text,
  `model` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
