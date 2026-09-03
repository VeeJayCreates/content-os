ALTER TABLE `research_facts` ADD `geographic_entities_json` text NOT NULL DEFAULT '[]';
ALTER TABLE `content_scripts` ADD `geographic_entities_json` text NOT NULL DEFAULT '[]';
ALTER TABLE `planned_scenes` ADD `geographic_entity_ids_json` text NOT NULL DEFAULT '[]';
ALTER TABLE `scene_visual_requirements` ADD `geographic_reference_ids_json` text NOT NULL DEFAULT '[]';
