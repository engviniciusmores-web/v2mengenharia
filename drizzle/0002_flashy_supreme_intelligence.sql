CREATE TABLE `procurement_order_elements` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`element_key` text NOT NULL,
	`express_id` integer NOT NULL,
	`global_id` text,
	`element_type` text NOT NULL,
	`element_name` text NOT NULL,
	`phase` text,
	`activity` text,
	`wbs` text,
	`planned_start` text,
	`planned_finish` text
);
--> statement-breakpoint
CREATE INDEX `idx_procurement_elements_order_id` ON `procurement_order_elements` (`order_id`);--> statement-breakpoint
CREATE INDEX `idx_procurement_elements_element_key` ON `procurement_order_elements` (`element_key`);--> statement-breakpoint
CREATE TABLE `procurement_order_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`budget_item_id` text NOT NULL,
	`budget_code` text NOT NULL,
	`description` text NOT NULL,
	`unit` text NOT NULL,
	`budget_quantity` real NOT NULL,
	`budget_unit_cost` real NOT NULL,
	`budget_total_cost` real NOT NULL,
	`ordered_quantity` real NOT NULL,
	`ordered_unit_price` real NOT NULL,
	`committed_value` real NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_procurement_lines_order_id` ON `procurement_order_lines` (`order_id`);--> statement-breakpoint
CREATE INDEX `idx_procurement_lines_budget_item` ON `procurement_order_lines` (`budget_item_id`);--> statement-breakpoint
CREATE TABLE `procurement_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`order_number` text NOT NULL,
	`supplier` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`phase` text,
	`schedule_activity` text,
	`wbs` text,
	`required_by` text,
	`notes` text,
	`committed_value` real DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_procurement_orders_number` ON `procurement_orders` (`order_number`);--> statement-breakpoint
CREATE INDEX `idx_procurement_orders_status_updated` ON `procurement_orders` (`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_procurement_orders_required_by` ON `procurement_orders` (`required_by`);