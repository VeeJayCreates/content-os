ALTER TABLE `video_render_job_attempts` ADD `output_storage_provider` text;
--> statement-breakpoint
ALTER TABLE `video_render_job_attempts` ADD `output_storage_key` text;
--> statement-breakpoint
ALTER TABLE `video_render_job_attempts` ADD `output_mime_type` text;
--> statement-breakpoint
ALTER TABLE `video_render_job_attempts` ADD `output_checksum` text;
--> statement-breakpoint
ALTER TABLE `video_render_job_attempts` ADD `output_size_bytes` integer;
--> statement-breakpoint
ALTER TABLE `video_render_job_attempts` ADD `output_duration_ms` integer;
