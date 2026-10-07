import { env } from "cloudflare:workers";

let initialized = false;

export function getQualityEnv() {
  if (!env.DB) throw new Error("Banco de dados da Qualidade indisponível.");
  return env as typeof env & { DB: D1Database; FILES: R2Bucket };
}

export async function ensureQualitySchema() {
  if (initialized) return;
  const { DB } = getQualityEnv();
  await DB.batch([
    DB.prepare(`CREATE TABLE IF NOT EXISTS quality_records (
      id TEXT PRIMARY KEY,
      element_key TEXT NOT NULL,
      element_express_id INTEGER NOT NULL,
      element_global_id TEXT,
      element_type TEXT NOT NULL,
      element_name TEXT NOT NULL,
      phase TEXT,
      template_code TEXT NOT NULL,
      service_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      inspector_name TEXT,
      inspection_date TEXT,
      location TEXT,
      project_ref TEXT,
      observations TEXT,
      ris_answers_json TEXT NOT NULL DEFAULT '{}',
      concrete_answers_json TEXT NOT NULL DEFAULT '{}',
      concrete_data_json TEXT NOT NULL DEFAULT '{}',
      released_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_quality_records_element_template ON quality_records(element_key, template_code)"),
    DB.prepare("CREATE INDEX IF NOT EXISTS idx_quality_records_status ON quality_records(status)"),
    DB.prepare("CREATE INDEX IF NOT EXISTS idx_quality_records_updated_at ON quality_records(updated_at)"),
    DB.prepare(`CREATE TABLE IF NOT EXISTS quality_photos (
      id TEXT PRIMARY KEY,
      record_id TEXT NOT NULL,
      element_key TEXT NOT NULL,
      storage_key TEXT NOT NULL,
      file_name TEXT NOT NULL,
      content_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    DB.prepare("CREATE INDEX IF NOT EXISTS idx_quality_photos_record_id ON quality_photos(record_id)"),
    DB.prepare("CREATE INDEX IF NOT EXISTS idx_quality_photos_element_key ON quality_photos(element_key)"),
  ]);
  await DB.prepare("PRAGMA optimize").run();
  initialized = true;
}

export function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}
