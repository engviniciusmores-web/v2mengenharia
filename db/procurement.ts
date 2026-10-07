import { env } from "cloudflare:workers";

let initialized = false;

export function getProcurementEnv() {
  if (!env.DB) throw new Error("Banco de dados de Suprimentos indisponível.");
  return env as typeof env & { DB: D1Database };
}

export async function ensureProcurementSchema() {
  if (initialized) return;
  const { DB } = getProcurementEnv();
  await DB.batch([
    DB.prepare(`CREATE TABLE IF NOT EXISTS procurement_orders (
      id TEXT PRIMARY KEY,
      order_number TEXT NOT NULL UNIQUE,
      supplier TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      phase TEXT,
      schedule_activity TEXT,
      wbs TEXT,
      required_by TEXT,
      notes TEXT,
      committed_value REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_procurement_orders_number ON procurement_orders(order_number)"),
    DB.prepare("CREATE INDEX IF NOT EXISTS idx_procurement_orders_status_updated ON procurement_orders(status, updated_at)"),
    DB.prepare("CREATE INDEX IF NOT EXISTS idx_procurement_orders_required_by ON procurement_orders(required_by)"),
    DB.prepare(`CREATE TABLE IF NOT EXISTS procurement_order_lines (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      budget_item_id TEXT NOT NULL,
      budget_code TEXT NOT NULL,
      description TEXT NOT NULL,
      unit TEXT NOT NULL,
      budget_quantity REAL NOT NULL,
      budget_unit_cost REAL NOT NULL,
      budget_total_cost REAL NOT NULL,
      ordered_quantity REAL NOT NULL,
      ordered_unit_price REAL NOT NULL,
      application TEXT NOT NULL DEFAULT '',
      committed_value REAL NOT NULL
    )`),
    DB.prepare("CREATE INDEX IF NOT EXISTS idx_procurement_lines_order_id ON procurement_order_lines(order_id)"),
    DB.prepare("CREATE INDEX IF NOT EXISTS idx_procurement_lines_budget_item ON procurement_order_lines(budget_item_id)"),
    DB.prepare(`CREATE TABLE IF NOT EXISTS procurement_order_elements (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      element_key TEXT NOT NULL,
      express_id INTEGER NOT NULL,
      global_id TEXT,
      element_type TEXT NOT NULL,
      element_name TEXT NOT NULL,
      phase TEXT,
      activity TEXT,
      wbs TEXT,
      planned_start TEXT,
      planned_finish TEXT
    )`),
    DB.prepare("CREATE INDEX IF NOT EXISTS idx_procurement_elements_order_id ON procurement_order_elements(order_id)"),
    DB.prepare("CREATE INDEX IF NOT EXISTS idx_procurement_elements_element_key ON procurement_order_elements(element_key)"),
  ]);
  const lineColumns = await DB.prepare("PRAGMA table_info(procurement_order_lines)").all();
  if (!lineColumns.results.some((column) => (column as { name?: string }).name === "application")) {
    await DB.prepare("ALTER TABLE procurement_order_lines ADD COLUMN application TEXT NOT NULL DEFAULT ''").run();
  }
  await DB.prepare("PRAGMA optimize").run();
  initialized = true;
}
