CREATE TABLE IF NOT EXISTS `research_fact_source_evidence` (
  `research_fact_id` text NOT NULL,
  `source_evidence_content_id` text NOT NULL,
  `locator_json` text,
  `evidence_excerpt` text NOT NULL,
  `created_at` text NOT NULL,
  UNIQUE(`research_fact_id`, `source_evidence_content_id`)
);
