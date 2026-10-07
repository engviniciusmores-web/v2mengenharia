CREATE TABLE `financial_periods` (
	`period` text PRIMARY KEY NOT NULL,
	`planned_value` real DEFAULT 0 NOT NULL,
	`measured_value` real DEFAULT 0 NOT NULL,
	`paid_value` real DEFAULT 0 NOT NULL,
	`forecast_value` real DEFAULT 0 NOT NULL,
	`planned_physical_percent` real DEFAULT 0 NOT NULL,
	`actual_physical_percent` real DEFAULT 0 NOT NULL,
	`notes` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_financial_periods_updated` ON `financial_periods` (`updated_at`);--> statement-breakpoint
CREATE TABLE `procurement_cost_controls` (
	`order_id` text PRIMARY KEY NOT NULL,
	`forecast_value` real DEFAULT 0 NOT NULL,
	`measured_value` real DEFAULT 0 NOT NULL,
	`paid_value` real DEFAULT 0 NOT NULL,
	`payment_due` text,
	`notes` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_procurement_cost_controls_due` ON `procurement_cost_controls` (`payment_due`);--> statement-breakpoint
CREATE INDEX `idx_procurement_cost_controls_updated` ON `procurement_cost_controls` (`updated_at`);