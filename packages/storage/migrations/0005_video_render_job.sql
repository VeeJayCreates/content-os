CREATE TABLE `video_render_jobs` (`id` text PRIMARY KEY NOT NULL,`project_id` text NOT NULL,`content_script_id` text NOT NULL,`current_attempt_id` text NOT NULL,`created_at` text NOT NULL,`updated_at` text NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX `video_render_jobs_script_unique` ON `video_render_jobs` (`content_script_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `video_render_jobs_attempt_unique` ON `video_render_jobs` (`current_attempt_id`);
--> statement-breakpoint
CREATE TABLE `video_render_job_attempts` (`id` text PRIMARY KEY NOT NULL,`job_id` text NOT NULL,`attempt_number` integer NOT NULL,`render_input_manifest_id` text NOT NULL,`render_input_hash` text NOT NULL,`status` text NOT NULL,`completed_units` integer,`total_units` integer,`failure_code` text,`failure_message` text,`queued_at` text NOT NULL,`started_at` text,`completed_at` text,`updated_at` text NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX `video_render_attempts_job_number_unique` ON `video_render_job_attempts` (`job_id`,`attempt_number`);
