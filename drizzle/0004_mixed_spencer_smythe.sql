CREATE TABLE `planning_measurements` (
	`wbs` text PRIMARY KEY NOT NULL,
	`actual_percent` real NOT NULL,
	`status_date` text NOT NULL,
	`notes` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_planning_measurements_status_date` ON `planning_measurements` (`status_date`);--> statement-breakpoint
CREATE INDEX `idx_planning_measurements_updated_at` ON `planning_measurements` (`updated_at`);