import { env } from "cloudflare:workers";

let initialized = false;

export function getCostControlEnv() {
  if (!env.DB) throw new Error("Banco de dados do Controle de Custos indisponível.");
  return env as typeof env & { DB: D1Database };
}

export async function ensureCostControlSchema() {
  if (initialized) return;
  const { DB } = getCostControlEnv();
  await DB.batch([
    DB.prepare(`CREATE TABLE IF NOT EXISTS procurement_cost_controls (
      order_id TEXT PRIMARY KEY,
      forecast_value REAL NOT NULL DEFAULT 0,
      measured_value REAL NOT NULL DEFAULT 0,
      paid_value REAL NOT NULL DEFAULT 0,
      payment_due TEXT,
      notes TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    DB.prepare("CREATE INDEX IF NOT EXISTS idx_procurement_cost_controls_due ON procurement_cost_controls(payment_due)"),
    DB.prepare("CREATE INDEX IF NOT EXISTS idx_procurement_cost_controls_updated ON procurement_cost_controls(updated_at)"),
    DB.prepare(`CREATE TABLE IF NOT EXISTS financial_periods (
      period TEXT PRIMARY KEY,
      planned_value REAL NOT NULL DEFAULT 0,
      measured_value REAL NOT NULL DEFAULT 0,
      paid_value REAL NOT NULL DEFAULT 0,
      forecast_value REAL NOT NULL DEFAULT 0,
      planned_physical_percent REAL NOT NULL DEFAULT 0,
      actual_physical_percent REAL NOT NULL DEFAULT 0,
      notes TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    DB.prepare("CREATE INDEX IF NOT EXISTS idx_financial_periods_updated ON financial_periods(updated_at)"),
  ]);
  await DB.prepare("PRAGMA optimize").run();
  initialized = true;
}
