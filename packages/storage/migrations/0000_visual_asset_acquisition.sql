CREATE TABLE `visual_asset_acquisition_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`content_script_id` text NOT NULL,
	`manifest_id` text NOT NULL,
	`manifest_input_hash` text NOT NULL,
	`version` text NOT NULL,
	`input_hash` text NOT NULL,
	`status` text NOT NULL,
	`requested_requirement_ids` text NOT NULL,
	`provider_plan` text NOT NULL,
	`prepared_query_count` integer NOT NULL,
	`provider_request_count` integer NOT NULL,
	`candidates_discovered` integer NOT NULL,
	`candidates_accepted` integer NOT NULL,
	`candidates_rejected` integer NOT NULL,
	`failure_code` text,
	`started_at` text,
	`completed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `visual_asset_acquisition_runs_manifest_input_unique` ON `visual_asset_acquisition_runs` (`manifest_id`,`input_hash`);
--> statement-breakpoint
CREATE TABLE `visual_asset_acquisition_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`plan_index` integer NOT NULL,
	`requirement_id` text NOT NULL,
	`planned_scene_id` text NOT NULL,
	`requirement_type` text NOT NULL,
	`acquisition_strategy` text NOT NULL,
	`capability` text,
	`provider_ids` text NOT NULL,
	`queries` text NOT NULL,
	`expected_media_type` text NOT NULL,
	`target_aspect_ratio` text NOT NULL,
	`preferred_orientation` text NOT NULL,
	`licence_requirements` text NOT NULL,
	`result_limit` integer NOT NULL,
	`automatic_acquisition_allowed` integer NOT NULL,
	`skip_reason` text,
	`manual_review_reasons` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `visual_asset_acquisition_plans_run_index_unique` ON `visual_asset_acquisition_plans` (`run_id`,`plan_index`);
