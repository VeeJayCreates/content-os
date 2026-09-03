CREATE TABLE IF NOT EXISTS `source_transcripts` (
  `id` text PRIMARY KEY NOT NULL,
  `signal_id` text NOT NULL,
  `research_source_id` text NOT NULL,
  `source_url` text NOT NULL,
  `content` text NOT NULL,
  `segments_json` text NOT NULL,
  `language` text,
  `duration_ms` text,
  `first_timestamp_ms` text,
  `last_timestamp_ms` text,
  `segment_count` text NOT NULL,
  `content_hash` text NOT NULL,
  `provider` text NOT NULL,
  `acquisition_method` text NOT NULL,
  `status` text NOT NULL,
  `version` text NOT NULL,
  `acquired_at` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`signal_id`) REFERENCES `signals`(`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `source_transcripts_signal_version_unique` ON `source_transcripts` (`signal_id`, `version`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `source_transcripts_signal_idx` ON `source_transcripts` (`signal_id`);
