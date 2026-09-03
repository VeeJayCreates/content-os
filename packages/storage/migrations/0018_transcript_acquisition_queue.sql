CREATE TABLE IF NOT EXISTS `transcript_acquisition_jobs` (
  `id` text PRIMARY KEY NOT NULL,
  `project_id` text NOT NULL,
  `signal_id` text NOT NULL,
  `version` text NOT NULL,
  `status` text NOT NULL,
  `attempts` integer NOT NULL DEFAULT 0,
  `next_attempt_at` text,
  `last_attempt_at` text,
  `failure_classification` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`signal_id`) REFERENCES `signals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `transcript_acquisition_jobs_signal_version_unique` ON `transcript_acquisition_jobs` (`signal_id`, `version`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `transcript_acquisition_jobs_claim_idx` ON `transcript_acquisition_jobs` (`project_id`, `status`, `next_attempt_at`);
