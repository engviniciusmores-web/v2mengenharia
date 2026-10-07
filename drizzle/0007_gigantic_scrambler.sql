CREATE TABLE `federation_measurements` (
	`id` text PRIMARY KEY NOT NULL,
	`federation_id` text NOT NULL,
	`wbs` text NOT NULL,
	`actual_percent` real NOT NULL,
	`status_date` text NOT NULL,
	`notes` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`federation_id`) REFERENCES `model_federations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_federation_measurements_wbs` ON `federation_measurements` (`federation_id`,`wbs`);