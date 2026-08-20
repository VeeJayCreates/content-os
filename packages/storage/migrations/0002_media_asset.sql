CREATE TABLE `media_assets` (`id` text PRIMARY KEY NOT NULL,`media_type` text NOT NULL,`mime_type` text NOT NULL,`checksum` text NOT NULL,`size_bytes` integer NOT NULL,`source_type` text NOT NULL,`source_id` text NOT NULL,`requirement_id` text NOT NULL,`source_identity` text NOT NULL,`storage_provider` text NOT NULL,`storage_key` text NOT NULL,`status` text NOT NULL,`created_at` text NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_assets_source_checksum_unique` ON `media_assets` (`source_type`,`source_identity`,`checksum`);
