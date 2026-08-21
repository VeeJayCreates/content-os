CREATE TABLE `agent_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_key` text NOT NULL,
	`project_id` text,
	`subject_type` text,
	`subject_id` text,
	`status` text NOT NULL,
	`current_activity` text,
	`state_json` text DEFAULT '{}' NOT NULL,
	`started_at` text,
	`completed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `agent_runs_project_updated_at_idx` ON `agent_runs` (`project_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `agent_runs_agent_status_updated_at_idx` ON `agent_runs` (`agent_key`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `agent_runs_subject_idx` ON `agent_runs` (`subject_type`,`subject_id`);--> statement-breakpoint
CREATE TABLE `agent_activities` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`type` text NOT NULL,
	`message` text NOT NULL,
	`state_json` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_activities_run_sequence_uq` ON `agent_activities` (`run_id`,`sequence`);--> statement-breakpoint
CREATE INDEX `agent_activities_run_created_at_idx` ON `agent_activities` (`run_id`,`created_at`);
