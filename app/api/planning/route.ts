import { ensurePlanningSchema, getPlanningEnv } from "../../../db/planning";

type MeasurementPayload = {
  wbs?: string;
  actualPercent?: number;
  statusDate?: string;
  notes?: string;
  source?: string;
};

function serialize(row: Record<string, unknown>) {
  return {
    wbs: row.wbs,
    actualPercent: Number(row.actual_percent),
    statusDate: row.status_date,
    notes: row.notes || "",
    source: row.source || "manual",
    updatedAt: row.updated_at,
  };
}

function validate(item: MeasurementPayload) {
  const wbs = item.wbs?.trim();
  const actualPercent = Number(item.actualPercent);
  const statusDate = item.statusDate?.trim();
  if (!wbs) throw new Error("A EAP/WBS é obrigatória.");
  if (!Number.isFinite(actualPercent) || actualPercent < 0 || actualPercent > 100) {
    throw new Error(`O avanço de ${wbs} deve estar entre 0% e 100%.`);
  }
  if (!statusDate || !/^\d{4}-\d{2}-\d{2}$/.test(statusDate)) {
    throw new Error(`A data de medição de ${wbs} é inválida.`);
  }
  return {
    wbs,
    actualPercent,
    statusDate,
    notes: item.notes?.trim() || null,
    source: item.source === "csv" ? "csv" : "manual",
  };
}

export async function GET() {
  try {
    await ensurePlanningSchema();
    const { DB } = getPlanningEnv();
    const result = await DB.prepare("SELECT * FROM planning_measurements ORDER BY wbs").all();
    return Response.json({ measurements: result.results.map((row) => serialize(row as Record<string, unknown>)) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Falha ao consultar as medições." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensurePlanningSchema();
    const payload = await request.json() as MeasurementPayload & { measurements?: MeasurementPayload[] };
    const items = (payload.measurements?.length ? payload.measurements : [payload]).map(validate);
    if (items.length > 500) return Response.json({ error: "Limite de 500 medições por importação." }, { status: 400 });
    const { DB } = getPlanningEnv();
    await DB.batch(items.map((item) => DB.prepare(`INSERT INTO planning_measurements (
      wbs, actual_percent, status_date, notes, source, updated_at
    ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(wbs) DO UPDATE SET
      actual_percent=excluded.actual_percent,
      status_date=excluded.status_date,
      notes=excluded.notes,
      source=excluded.source,
      updated_at=CURRENT_TIMESTAMP`).bind(
      item.wbs, item.actualPercent, item.statusDate, item.notes, item.source,
    )));
    const result = await DB.prepare("SELECT * FROM planning_measurements ORDER BY wbs").all();
    return Response.json({ measurements: result.results.map((row) => serialize(row as Record<string, unknown>)) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Falha ao salvar as medições." }, { status: 400 });
  }
}
