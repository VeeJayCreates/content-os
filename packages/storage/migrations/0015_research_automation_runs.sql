CREATE TABLE IF NOT EXISTS `research_automation_runs` (
  `project_id` text PRIMARY KEY NOT NULL,
  `status` text NOT NULL,
  `last_run_at` text,
  `next_run_at` text,
  `opportunities_processed` integer NOT NULL DEFAULT 0,
  `provider_failures` integer NOT NULL DEFAULT 0,
  `warnings_json` text NOT NULL DEFAULT '[]',
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
