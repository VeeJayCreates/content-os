-- Historical claim/evidence tables are retained in their original migrations
-- for migration-chain integrity, then removed here as a forward-only cleanup.
DROP TABLE IF EXISTS `research_fact_source_evidence`;
--> statement-breakpoint
DROP TABLE IF EXISTS `research_evidence_extractions`;
