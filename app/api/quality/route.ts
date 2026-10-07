import { ensureQualitySchema, getQualityEnv, parseJson } from "../../../db/quality";

type QualityPayload = {
  elementKey?: string; elementExpressId?: number; elementGlobalId?: string; elementType?: string;
  elementName?: string; phase?: string; templateCode?: string; serviceType?: string; status?: string;
  inspectorName?: string; inspectionDate?: string; location?: string; projectRef?: string;
  observations?: string; risAnswers?: Record<string,string>; concreteAnswers?: Record<string,string>;
  concreteData?: Record<string,string>; releasedAt?: string | null;
};

function serializeRecord(row: Record<string, unknown>) {
  return {
    id: row.id, elementKey: row.element_key, elementExpressId: row.element_express_id,
    elementGlobalId: row.element_global_id, elementType: row.element_type, elementName: row.element_name,
    phase: row.phase, templateCode: row.template_code, serviceType: row.service_type, status: row.status,
    inspectorName: row.inspector_name, inspectionDate: row.inspection_date, location: row.location,
    projectRef: row.project_ref, observations: row.observations,
    risAnswers: parseJson(row.ris_answers_json, {}), concreteAnswers: parseJson(row.concrete_answers_json, {}),
    concreteData: parseJson(row.concrete_data_json, {}), releasedAt: row.released_at,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export async function GET(request: Request) {
  try {
    await ensureQualitySchema();
    const { DB } = getQualityEnv();
    const url = new URL(request.url);
    const elementKey = url.searchParams.get("elementKey");
    const templateCode = url.searchParams.get("templateCode");
    if (elementKey) {
      const result = templateCode
        ? await DB.prepare("SELECT * FROM quality_records WHERE element_key = ? AND template_code = ? LIMIT 1").bind(elementKey, templateCode).first()
        : await DB.prepare("SELECT * FROM quality_records WHERE element_key = ? ORDER BY updated_at DESC LIMIT 1").bind(elementKey).first();
      return Response.json({ record: result ? serializeRecord(result as Record<string, unknown>) : null });
    }
    const rows = await DB.prepare("SELECT * FROM quality_records ORDER BY updated_at DESC LIMIT 200").all();
    return Response.json({ records: rows.results.map((row) => serializeRecord(row as Record<string, unknown>)) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Falha ao consultar os registros." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureQualitySchema();
    const payload = await request.json() as QualityPayload;
    const required = [payload.elementKey, payload.elementType, payload.elementName, payload.templateCode, payload.serviceType];
    if (required.some((value) => !String(value || "").trim()) || !Number.isFinite(payload.elementExpressId)) {
      return Response.json({ error: "Elemento IFC e modelo de RIS são obrigatórios." }, { status: 400 });
    }
    const allowedStatus = new Set(["draft", "in_progress", "nonconforming", "ready", "released"]);
    const status = allowedStatus.has(payload.status || "") ? payload.status! : "draft";
    const id = `${payload.elementKey}:${payload.templateCode}`;
    const { DB } = getQualityEnv();
    await DB.prepare(`INSERT INTO quality_records (
      id, element_key, element_express_id, element_global_id, element_type, element_name, phase,
      template_code, service_type, status, inspector_name, inspection_date, location, project_ref,
      observations, ris_answers_json, concrete_answers_json, concrete_data_json, released_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(element_key, template_code) DO UPDATE SET
      element_express_id=excluded.element_express_id, element_global_id=excluded.element_global_id,
      element_type=excluded.element_type, element_name=excluded.element_name, phase=excluded.phase,
      service_type=excluded.service_type, status=excluded.status, inspector_name=excluded.inspector_name,
      inspection_date=excluded.inspection_date, location=excluded.location, project_ref=excluded.project_ref,
      observations=excluded.observations, ris_answers_json=excluded.ris_answers_json,
      concrete_answers_json=excluded.concrete_answers_json, concrete_data_json=excluded.concrete_data_json,
      released_at=excluded.released_at, updated_at=CURRENT_TIMESTAMP`).bind(
      id, payload.elementKey, payload.elementExpressId, payload.elementGlobalId || null, payload.elementType,
      payload.elementName, payload.phase || null, payload.templateCode, payload.serviceType, status,
      payload.inspectorName || null, payload.inspectionDate || null, payload.location || null,
      payload.projectRef || null, payload.observations || null, JSON.stringify(payload.risAnswers || {}),
      JSON.stringify(payload.concreteAnswers || {}), JSON.stringify(payload.concreteData || {}),
      payload.releasedAt || null,
    ).run();
    const row = await DB.prepare("SELECT * FROM quality_records WHERE element_key = ? AND template_code = ? LIMIT 1").bind(payload.elementKey, payload.templateCode).first();
    return Response.json({ record: serializeRecord(row as Record<string, unknown>) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Falha ao salvar o registro." }, { status: 500 });
  }
}
