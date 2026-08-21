CREATE TABLE `agent_tasks` (`id` text PRIMARY KEY NOT NULL, `project_id` text NOT NULL, `stage` text NOT NULL, `agent_key` text NOT NULL, `source_type` text NOT NULL, `source_id` text NOT NULL, `status` text NOT NULL, `source_status` text NOT NULL, `created_at` text NOT NULL, `updated_at` text NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_tasks_stage_source_uq` ON `agent_tasks` (`stage`,`source_type`,`source_id`);--> statement-breakpoint
CREATE INDEX `agent_tasks_project_stage_idx` ON `agent_tasks` (`project_id`,`stage`);--> statement-breakpoint
CREATE TABLE `agent_task_events` (`id` text PRIMARY KEY NOT NULL, `task_id` text NOT NULL, `type` text NOT NULL, `source_type` text NOT NULL, `source_id` text NOT NULL, `source_status` text NOT NULL, `occurred_at` text NOT NULL, FOREIGN KEY (`task_id`) REFERENCES `agent_tasks`(`id`) ON UPDATE no action ON DELETE cascade);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_task_events_source_status_uq` ON `agent_task_events` (`task_id`,`type`,`source_type`,`source_id`,`source_status`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `agent_task_events_task_idx` ON `agent_task_events` (`task_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `agent_handoffs` (`id` text PRIMARY KEY NOT NULL, `from_task_id` text NOT NULL, `to_task_id` text NOT NULL, `source_type` text NOT NULL, `source_id` text NOT NULL, `created_at` text NOT NULL, FOREIGN KEY (`from_task_id`) REFERENCES `agent_tasks`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`to_task_id`) REFERENCES `agent_tasks`(`id`) ON UPDATE no action ON DELETE cascade);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_handoffs_tasks_source_uq` ON `agent_handoffs` (`from_task_id`,`to_task_id`,`source_type`,`source_id`);
