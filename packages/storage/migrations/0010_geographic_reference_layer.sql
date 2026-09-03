CREATE TABLE `geographic_references` (
  `id` text PRIMARY KEY NOT NULL,
  `canonical_name` text NOT NULL,
  `aliases_json` text NOT NULL,
  `entity_type` text NOT NULL,
  `point_json` text,
  `bounds_json` text,
  `geometry_reference` text,
  `parent_reference_id` text,
  `provenance_source_id` text NOT NULL,
  `provenance_reference` text NOT NULL,
  `confidence` integer NOT NULL,
  `review_status` text NOT NULL,
  `version` text NOT NULL,
  `revision` integer NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
CREATE UNIQUE INDEX `geographic_references_canonical_version_unique` ON `geographic_references` (`canonical_name`,`version`);
CREATE TABLE `geographic_relationships` (
  `id` text PRIMARY KEY NOT NULL,
  `from_reference_id` text NOT NULL,
  `to_reference_id` text NOT NULL,
  `relationship_type` text NOT NULL,
  `geometry_reference` text,
  `provenance_source_id` text NOT NULL,
  `provenance_reference` text NOT NULL,
  `review_status` text NOT NULL,
  `version` text NOT NULL,
  `revision` integer NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
CREATE UNIQUE INDEX `geographic_relationships_identity_unique` ON `geographic_relationships` (`from_reference_id`,`to_reference_id`,`relationship_type`,`version`);
