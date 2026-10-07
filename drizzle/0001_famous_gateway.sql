CREATE TABLE `rdo_files` (
	`id` text PRIMARY KEY NOT NULL,
	`record_id` text NOT NULL,
	`record_date` text NOT NULL,
	`storage_key` text NOT NULL,
	`file_name` text NOT NULL,
	`relative_path` text,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`file_kind` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_rdo_files_record_id` ON `rdo_files` (`record_id`);--> statement-breakpoint
CREATE INDEX `idx_rdo_files_date_kind` ON `rdo_files` (`record_date`,`file_kind`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_rdo_files_identity` ON `rdo_files` (`record_id`,`relative_path`,`size_bytes`);--> statement-breakpoint
CREATE TABLE `rdo_records` (
	`id` text PRIMARY KEY NOT NULL,
	`record_date` text NOT NULL,
	`report_number` text,
	`source_folder` text,
	`status` text DEFAULT 'pending_review' NOT NULL,
	`summary` text NOT NULL,
	`weather` text,
	`workforce` text,
	`activities_json` text DEFAULT '[]' NOT NULL,
	`occurrences_json` text DEFAULT '[]' NOT NULL,
	`document_count` integer DEFAULT 0 NOT NULL,
	`photo_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_rdo_records_date` ON `rdo_records` (`record_date`);--> statement-breakpoint
CREATE INDEX `idx_rdo_records_updated_at` ON `rdo_records` (`updated_at`);