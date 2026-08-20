CREATE TABLE `video_composition_plans` (`id` text PRIMARY KEY NOT NULL,`project_id` text NOT NULL,`content_script_id` text NOT NULL,`scene_plan_id` text NOT NULL,`scene_plan_input_hash` text NOT NULL,`audio_generation_id` text NOT NULL,`audio_input_hash` text NOT NULL,`visual_asset_manifest_id` text NOT NULL,`visual_manifest_input_hash` text NOT NULL,`version` text NOT NULL,`input_hash` text NOT NULL,`status` text NOT NULL,`total_duration_ms` integer NOT NULL,`scene_count` integer NOT NULL,`failure_code` text,`failure_reason` text,`created_at` text NOT NULL,`updated_at` text NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX `video_composition_plans_script_unique` ON `video_composition_plans` (`content_script_id`);
--> statement-breakpoint
CREATE TABLE `video_composition_scenes` (`id` text PRIMARY KEY NOT NULL,`composition_plan_id` text NOT NULL,`scene_index` integer NOT NULL,`planned_scene_id` text NOT NULL,`audio_segment_id` text NOT NULL,`audio_start_ms` integer NOT NULL,`audio_end_ms` integer NOT NULL,`audio_duration_ms` integer NOT NULL,`visual_requirement_id` text NOT NULL,`visual_requirement_type` text NOT NULL,`asset_strategy` text NOT NULL,`selected_candidate_id` text,`candidate_identity_hash` text,`created_at` text NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX `video_composition_scenes_plan_index_unique` ON `video_composition_scenes` (`composition_plan_id`,`scene_index`);
--> statement-breakpoint
CREATE TABLE `video_composition_preparation_claims` (`content_script_id` text PRIMARY KEY NOT NULL,`claim_token` text NOT NULL,`claimed_at` text NOT NULL);
