import { env } from "cloudflare:workers";

let initialized = false;

export function getRdoEnv() {
  if (!env.DB) throw new Error("Banco de dados do Diário de Obra indisponível.");
  return env as typeof env & { DB: D1Database; FILES: R2Bucket };
}

export async function ensureRdoSchema() {
  if (initialized) return;
  const { DB } = getRdoEnv();
  await DB.batch([
    DB.prepare(`CREATE TABLE IF NOT EXISTS rdo_records (
      id TEXT PRIMARY KEY,
      record_date TEXT NOT NULL UNIQUE,
      report_number TEXT,
      source_folder TEXT,
      status TEXT NOT NULL DEFAULT 'pending_review',
      summary TEXT NOT NULL,
      weather TEXT,
      workforce TEXT,
      activities_json TEXT NOT NULL DEFAULT '[]',
      occurrences_json TEXT NOT NULL DEFAULT '[]',
      document_count INTEGER NOT NULL DEFAULT 0,
      photo_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_rdo_records_date ON rdo_records(record_date)"),
    DB.prepare("CREATE INDEX IF NOT EXISTS idx_rdo_records_updated_at ON rdo_records(updated_at)"),
    DB.prepare(`CREATE TABLE IF NOT EXISTS rdo_files (
      id TEXT PRIMARY KEY,
      record_id TEXT NOT NULL,
      record_date TEXT NOT NULL,
      storage_key TEXT NOT NULL,
      file_name TEXT NOT NULL,
      relative_path TEXT,
      content_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      file_kind TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    DB.prepare("CREATE INDEX IF NOT EXISTS idx_rdo_files_record_id ON rdo_files(record_id)"),
    DB.prepare("CREATE INDEX IF NOT EXISTS idx_rdo_files_date_kind ON rdo_files(record_date, file_kind)"),
    DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_rdo_files_identity ON rdo_files(record_id, relative_path, size_bytes)"),
  ]);
  await DB.prepare("PRAGMA optimize").run();
  initialized = true;
}

export function parseRdoJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}
