CREATE TABLE `model_federation_items` (
	`id` text PRIMARY KEY NOT NULL,
	`federation_id` text NOT NULL,
	`file_id` text NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`federation_id`) REFERENCES `model_federations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`file_id`) REFERENCES `model_files`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_model_federation_file` ON `model_federation_items` (`federation_id`,`file_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_model_federation_position` ON `model_federation_items` (`federation_id`,`position`);--> statement-breakpoint
CREATE TABLE `model_federations` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `model_projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_model_federations_project` ON `model_federations` (`project_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `model_files` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`storage_key` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `model_projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_model_files_project` ON `model_files` (`project_id`,`status`);--> statement-breakpoint
CREATE TABLE `model_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_model_projects_owner` ON `model_projects` (`owner_id`,`created_at`);