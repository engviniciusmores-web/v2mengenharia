CREATE TABLE `quality_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`record_id` text NOT NULL,
	`element_key` text NOT NULL,
	`storage_key` text NOT NULL,
	`file_name` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_quality_photos_record_id` ON `quality_photos` (`record_id`);--> statement-breakpoint
CREATE INDEX `idx_quality_photos_element_key` ON `quality_photos` (`element_key`);--> statement-breakpoint
CREATE TABLE `quality_records` (
	`id` text PRIMARY KEY NOT NULL,
	`element_key` text NOT NULL,
	`element_express_id` integer NOT NULL,
	`element_global_id` text,
	`element_type` text NOT NULL,
	`element_name` text NOT NULL,
	`phase` text,
	`template_code` text NOT NULL,
	`service_type` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`inspector_name` text,
	`inspection_date` text,
	`location` text,
	`project_ref` text,
	`observations` text,
	`ris_answers_json` text DEFAULT '{}' NOT NULL,
	`concrete_answers_json` text DEFAULT '{}' NOT NULL,
	`concrete_data_json` text DEFAULT '{}' NOT NULL,
	`released_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_quality_records_element_template` ON `quality_records` (`element_key`,`template_code`);--> statement-breakpoint
CREATE INDEX `idx_quality_records_status` ON `quality_records` (`status`);--> statement-breakpoint
CREATE INDEX `idx_quality_records_updated_at` ON `quality_records` (`updated_at`);