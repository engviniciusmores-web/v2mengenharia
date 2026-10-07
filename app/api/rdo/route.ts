import { ensureRdoSchema, getRdoEnv, parseRdoJson } from "../../../db/rdo";

type RdoPayload = {
  recordDate?: string; reportNumber?: string; sourceFolder?: string; status?: string;
  summary?: string; weather?: string; workforce?: string; activities?: string[];
  occurrences?: string[]; documentCount?: number; photoCount?: number;
};

function serialize(row: Record<string, unknown>) {
  return {
    id: row.id, recordDate: row.record_date, reportNumber: row.report_number,
    sourceFolder: row.source_folder, status: row.status, summary: row.summary,
    weather: row.weather, workforce: row.workforce,
    activities: parseRdoJson(row.activities_json, [] as string[]),
    occurrences: parseRdoJson(row.occurrences_json, [] as string[]),
    documentCount: row.document_count, photoCount: row.photo_count,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export async function GET(request: Request) {
  try {
    await ensureRdoSchema();
    const { DB } = getRdoEnv();
    const date = new URL(request.url).searchParams.get("date");
    if (date) {
      const row = await DB.prepare("SELECT * FROM rdo_records WHERE record_date = ? LIMIT 1").bind(date).first();
      return Response.json({ record: row ? serialize(row as Record<string, unknown>) : null });
    }
    const rows = await DB.prepare("SELECT * FROM rdo_records ORDER BY record_date DESC LIMIT 366").all();
    return Response.json({ records: rows.results.map((row) => serialize(row as Record<string, unknown>)) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Falha ao consultar os diários." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureRdoSchema();
    const payload = await request.json() as RdoPayload;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.recordDate || "") || !payload.summary?.trim()) {
      return Response.json({ error: "Data e resumo do diário são obrigatórios." }, { status: 400 });
    }
    const status = new Set(["pending_review", "reviewed", "approved"]).has(payload.status || "") ? payload.status! : "pending_review";
    const id = `rdo-${payload.recordDate}`;
    const { DB } = getRdoEnv();
    await DB.prepare(`INSERT INTO rdo_records (
      id, record_date, report_number, source_folder, status, summary, weather, workforce,
      activities_json, occurrences_json, document_count, photo_count, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(record_date) DO UPDATE SET
      report_number=excluded.report_number, source_folder=excluded.source_folder,
      status=excluded.status, summary=excluded.summary, weather=excluded.weather,
      workforce=excluded.workforce, activities_json=excluded.activities_json,
      occurrences_json=excluded.occurrences_json, document_count=excluded.document_count,
      photo_count=excluded.photo_count, updated_at=CURRENT_TIMESTAMP`).bind(
      id, payload.recordDate, payload.reportNumber || null, payload.sourceFolder || null, status,
      payload.summary.trim(), payload.weather || null, payload.workforce || null,
      JSON.stringify(payload.activities || []), JSON.stringify(payload.occurrences || []),
      Math.max(0, Number(payload.documentCount) || 0), Math.max(0, Number(payload.photoCount) || 0),
    ).run();
    const row = await DB.prepare("SELECT * FROM rdo_records WHERE record_date = ? LIMIT 1").bind(payload.recordDate).first();
    return Response.json({ record: serialize(row as Record<string, unknown>) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Falha ao salvar o diário." }, { status: 500 });
  }
}
