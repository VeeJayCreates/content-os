CREATE TABLE `audio_generations` (`id` text PRIMARY KEY NOT NULL,`project_id` text NOT NULL,`content_script_id` text NOT NULL,`scene_plan_id` text NOT NULL,`provider` text NOT NULL,`model` text NOT NULL,`model_version` text NOT NULL,`voice_id` text NOT NULL,`language` text NOT NULL,`status` text NOT NULL,`input_hash` text NOT NULL,`total_duration_ms` integer,`output_path` text,`output_metadata` text,`failure_code` text,`failure_reason` text,`created_at` text NOT NULL,`updated_at` text NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX `audio_generations_content_script_unique` ON `audio_generations` (`content_script_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `audio_generations_project_input_unique` ON `audio_generations` (`project_id`,`input_hash`);
--> statement-breakpoint
CREATE TABLE `audio_segments` (`id` text PRIMARY KEY NOT NULL,`audio_generation_id` text NOT NULL,`scene_id` text NOT NULL,`scene_index` integer NOT NULL,`narration` text NOT NULL,`language` text NOT NULL,`actual_duration_ms` integer,`start_ms` integer,`end_ms` integer,`audio_path` text,`voice_direction` text NOT NULL,`status` text NOT NULL,`created_at` text NOT NULL,`updated_at` text NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX `audio_segments_generation_scene_unique` ON `audio_segments` (`audio_generation_id`,`scene_index`);
--> statement-breakpoint
CREATE TABLE `visual_asset_manifests` (`id` text PRIMARY KEY NOT NULL,`project_id` text NOT NULL,`content_script_id` text NOT NULL,`scene_plan_id` text NOT NULL,`scene_plan_input_hash` text NOT NULL,`manifest_version` text NOT NULL,`input_hash` text NOT NULL,`status` text NOT NULL,`failure_code` text,`failure_reason` text,`completed_at` text,`created_at` text NOT NULL,`updated_at` text NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX `visual_asset_manifests_script_unique` ON `visual_asset_manifests` (`content_script_id`);
--> statement-breakpoint
CREATE TABLE `scene_visual_requirements` (`id` text PRIMARY KEY NOT NULL,`manifest_id` text NOT NULL,`planned_scene_id` text NOT NULL,`scene_index` integer NOT NULL,`requirement_version` text NOT NULL,`requirement_type` text NOT NULL,`acquisition_strategy` text NOT NULL,`subject` text,`explicit_entities` text NOT NULL,`explicit_locations` text NOT NULL,`timeframe` text,`event_or_claim` text,`visual_objective` text NOT NULL,`visual_description` text NOT NULL,`must_include` text NOT NULL,`must_avoid` text NOT NULL,`primary_search_query` text,`alternate_search_queries` text NOT NULL,`generation_prompt` text,`source_fact_ids` text NOT NULL,`target_duration_ms` integer NOT NULL,`target_aspect_ratio` text NOT NULL,`preferred_orientation` text NOT NULL,`expected_media_type` text NOT NULL,`licence_requirements` text NOT NULL,`map_specification` text,`programmatic_specification` text,`text_card_specification` text,`manual_review_required` integer NOT NULL,`review_reasons` text NOT NULL,`status` text NOT NULL,`selected_candidate_id` text,`created_at` text NOT NULL,`updated_at` text NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX `scene_visual_requirements_manifest_scene_unique` ON `scene_visual_requirements` (`manifest_id`,`scene_index`);
--> statement-breakpoint
CREATE TABLE `visual_asset_candidates` (`id` text PRIMARY KEY NOT NULL,`requirement_id` text NOT NULL,`provider` text NOT NULL,`provider_asset_id` text,`source_url` text,`preview_url` text,`media_identity` text,`media_type` text NOT NULL,`mime_type` text,`width` integer,`height` integer,`duration_ms` integer,`checksum` text,`title` text,`licence_type` text,`licence_url` text,`attribution_text` text,`commercial_use_allowed` integer,`modification_allowed` integer,`provenance_score` integer,`overall_score` integer,`rejection_reasons` text NOT NULL,`status` text NOT NULL,`discovered_at` text NOT NULL,`selected_at` text,`approved_at` text);
--> statement-breakpoint
CREATE UNIQUE INDEX `visual_asset_candidates_requirement_provider_asset_unique` ON `visual_asset_candidates` (`requirement_id`,`provider`,`provider_asset_id`);
