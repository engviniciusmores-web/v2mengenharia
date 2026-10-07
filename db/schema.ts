import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const qualityRecords = sqliteTable("quality_records", {
  id: text("id").primaryKey(),
  elementKey: text("element_key").notNull(),
  elementExpressId: integer("element_express_id").notNull(),
  elementGlobalId: text("element_global_id"),
  elementType: text("element_type").notNull(),
  elementName: text("element_name").notNull(),
  phase: text("phase"),
  templateCode: text("template_code").notNull(),
  serviceType: text("service_type").notNull(),
  status: text("status").notNull().default("draft"),
  inspectorName: text("inspector_name"),
  inspectionDate: text("inspection_date"),
  location: text("location"),
  projectRef: text("project_ref"),
  observations: text("observations"),
  risAnswersJson: text("ris_answers_json").notNull().default("{}"),
  concreteAnswersJson: text("concrete_answers_json").notNull().default("{}"),
  concreteDataJson: text("concrete_data_json").notNull().default("{}"),
  releasedAt: text("released_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("idx_quality_records_element_template").on(table.elementKey, table.templateCode),
  index("idx_quality_records_status").on(table.status),
  index("idx_quality_records_updated_at").on(table.updatedAt),
]);

export const qualityPhotos = sqliteTable("quality_photos", {
  id: text("id").primaryKey(),
  recordId: text("record_id").notNull(),
  elementKey: text("element_key").notNull(),
  storageKey: text("storage_key").notNull(),
  fileName: text("file_name").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_quality_photos_record_id").on(table.recordId),
  index("idx_quality_photos_element_key").on(table.elementKey),
]);

export const rdoRecords = sqliteTable("rdo_records", {
  id: text("id").primaryKey(),
  recordDate: text("record_date").notNull(),
  reportNumber: text("report_number"),
  sourceFolder: text("source_folder"),
  status: text("status").notNull().default("pending_review"),
  summary: text("summary").notNull(),
  weather: text("weather"),
  workforce: text("workforce"),
  activitiesJson: text("activities_json").notNull().default("[]"),
  occurrencesJson: text("occurrences_json").notNull().default("[]"),
  documentCount: integer("document_count").notNull().default(0),
  photoCount: integer("photo_count").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("idx_rdo_records_date").on(table.recordDate),
  index("idx_rdo_records_updated_at").on(table.updatedAt),
]);

export const rdoFiles = sqliteTable("rdo_files", {
  id: text("id").primaryKey(),
  recordId: text("record_id").notNull(),
  recordDate: text("record_date").notNull(),
  storageKey: text("storage_key").notNull(),
  fileName: text("file_name").notNull(),
  relativePath: text("relative_path"),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  fileKind: text("file_kind").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_rdo_files_record_id").on(table.recordId),
  index("idx_rdo_files_date_kind").on(table.recordDate, table.fileKind),
  uniqueIndex("idx_rdo_files_identity").on(table.recordId, table.relativePath, table.sizeBytes),
]);

export const procurementOrders = sqliteTable("procurement_orders", {
  id: text("id").primaryKey(),
  orderNumber: text("order_number").notNull(),
  supplier: text("supplier").notNull(),
  status: text("status").notNull().default("draft"),
  phase: text("phase"),
  scheduleActivity: text("schedule_activity"),
  wbs: text("wbs"),
  requiredBy: text("required_by"),
  notes: text("notes"),
  committedValue: real("committed_value").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("idx_procurement_orders_number").on(table.orderNumber),
  index("idx_procurement_orders_status_updated").on(table.status, table.updatedAt),
  index("idx_procurement_orders_required_by").on(table.requiredBy),
]);

export const procurementOrderLines = sqliteTable("procurement_order_lines", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull(),
  budgetItemId: text("budget_item_id").notNull(),
  budgetCode: text("budget_code").notNull(),
  description: text("description").notNull(),
  unit: text("unit").notNull(),
  budgetQuantity: real("budget_quantity").notNull(),
  budgetUnitCost: real("budget_unit_cost").notNull(),
  budgetTotalCost: real("budget_total_cost").notNull(),
  orderedQuantity: real("ordered_quantity").notNull(),
  orderedUnitPrice: real("ordered_unit_price").notNull(),
  application: text("application").notNull().default(""),
  committedValue: real("committed_value").notNull(),
}, (table) => [
  index("idx_procurement_lines_order_id").on(table.orderId),
  index("idx_procurement_lines_budget_item").on(table.budgetItemId),
]);

export const procurementOrderElements = sqliteTable("procurement_order_elements", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull(),
  elementKey: text("element_key").notNull(),
  expressId: integer("express_id").notNull(),
  globalId: text("global_id"),
  elementType: text("element_type").notNull(),
  elementName: text("element_name").notNull(),
  phase: text("phase"),
  activity: text("activity"),
  wbs: text("wbs"),
  plannedStart: text("planned_start"),
  plannedFinish: text("planned_finish"),
}, (table) => [
  index("idx_procurement_elements_order_id").on(table.orderId),
  index("idx_procurement_elements_element_key").on(table.elementKey),
]);

export const planningMeasurements = sqliteTable("planning_measurements", {
  wbs: text("wbs").primaryKey(),
  actualPercent: real("actual_percent").notNull(),
  statusDate: text("status_date").notNull(),
  notes: text("notes"),
  source: text("source").notNull().default("manual"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_planning_measurements_status_date").on(table.statusDate),
  index("idx_planning_measurements_updated_at").on(table.updatedAt),
]);

export const procurementCostControls = sqliteTable("procurement_cost_controls", {
  orderId: text("order_id").primaryKey(),
  forecastValue: real("forecast_value").notNull().default(0),
  measuredValue: real("measured_value").notNull().default(0),
  paidValue: real("paid_value").notNull().default(0),
  paymentDue: text("payment_due"),
  notes: text("notes"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_procurement_cost_controls_due").on(table.paymentDue),
  index("idx_procurement_cost_controls_updated").on(table.updatedAt),
]);

export const financialPeriods = sqliteTable("financial_periods", {
  period: text("period").primaryKey(),
  plannedValue: real("planned_value").notNull().default(0),
  measuredValue: real("measured_value").notNull().default(0),
  paidValue: real("paid_value").notNull().default(0),
  forecastValue: real("forecast_value").notNull().default(0),
  plannedPhysicalPercent: real("planned_physical_percent").notNull().default(0),
  actualPhysicalPercent: real("actual_physical_percent").notNull().default(0),
  notes: text("notes"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_financial_periods_updated").on(table.updatedAt),
]);
