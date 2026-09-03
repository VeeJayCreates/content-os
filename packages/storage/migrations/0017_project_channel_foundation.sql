CREATE TABLE IF NOT EXISTS `product_profiles` (
	`project_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`target_audience` text,
	`value_proposition` text,
	`primary_url` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `content_channels` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`niche` text,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `content_channels_project_slug_unique` ON `content_channels` (`project_id`,`slug`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `content_channels_project_idx` ON `content_channels` (`project_id`);
--> statement-breakpoint
INSERT INTO `product_profiles` (
	`project_id`, `name`, `description`, `target_audience`, `value_proposition`, `primary_url`, `created_at`, `updated_at`
)
SELECT `id`, `name`, NULL, NULL, NULL, NULL, `created_at`, `updated_at`
FROM `projects`
WHERE `id` = '892363f1-b3f5-43ac-b0b9-b572c3b0bf70'
ON CONFLICT(`project_id`) DO NOTHING;
--> statement-breakpoint
INSERT INTO `content_channels` (
	`id`, `project_id`, `name`, `slug`, `description`, `niche`, `status`, `created_at`, `updated_at`
)
SELECT
	'08b0e660-2eab-4f66-9e88-6f5285872d4f', `id`, 'Geo Rajneeti', 'geo-rajneeti', NULL, NULL, 'active', `created_at`, `updated_at`
FROM `projects`
WHERE `id` = '892363f1-b3f5-43ac-b0b9-b572c3b0bf70'
ON CONFLICT(`project_id`, `slug`) DO NOTHING;
