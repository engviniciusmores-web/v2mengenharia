import { env } from "cloudflare:workers";

let initialized = false;

export function getPlanningEnv() {
  if (!env.DB) throw new Error("Banco de dados do Planejamento indisponível.");
  return env as typeof env & { DB: D1Database };
}

export async function ensurePlanningSchema() {
  if (initialized) return;
  const { DB } = getPlanningEnv();
  await DB.batch([
    DB.prepare(`CREATE TABLE IF NOT EXISTS planning_measurements (
      wbs TEXT PRIMARY KEY,
      actual_percent REAL NOT NULL,
      status_date TEXT NOT NULL,
      notes TEXT,
      source TEXT NOT NULL DEFAULT 'manual',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    DB.prepare("CREATE INDEX IF NOT EXISTS idx_planning_measurements_status_date ON planning_measurements(status_date)"),
    DB.prepare("CREATE INDEX IF NOT EXISTS idx_planning_measurements_updated_at ON planning_measurements(updated_at)"),
  ]);
  await DB.prepare("PRAGMA optimize").run();
  initialized = true;
}
