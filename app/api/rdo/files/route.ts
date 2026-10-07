import { ensureRdoSchema, getRdoEnv } from "../../../../db/rdo";

function serialize(row: Record<string, unknown>) {
  return {
    id: row.id, recordId: row.record_id, recordDate: row.record_date,
    fileName: row.file_name, relativePath: row.relative_path, contentType: row.content_type,
    sizeBytes: row.size_bytes, kind: row.file_kind, createdAt: row.created_at,
    url: `/api/rdo/files/${row.id}`,
  };
}

export async function GET(request: Request) {
  try {
    await ensureRdoSchema();
    const recordId = new URL(request.url).searchParams.get("recordId");
    if (!recordId) return Response.json({ files: [] });
    const { DB } = getRdoEnv();
    const rows = await DB.prepare("SELECT * FROM rdo_files WHERE record_id = ? ORDER BY file_kind DESC, created_at ASC").bind(recordId).all();
    return Response.json({ files: rows.results.map((row) => serialize(row as Record<string, unknown>)) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Falha ao listar os arquivos do diário." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureRdoSchema();
    const form = await request.formData();
    const file = form.get("file");
    const recordId = String(form.get("recordId") || "");
    const recordDate = String(form.get("recordDate") || "");
    const relativePath = String(form.get("relativePath") || "");
    const kind = String(form.get("kind") || "document") === "photo" ? "photo" : "document";
    if (!(file instanceof File) || !recordId || !/^\d{4}-\d{2}-\d{2}$/.test(recordDate)) {
      return Response.json({ error: "Arquivo e diário são obrigatórios." }, { status: 400 });
    }
    if (file.size > 30 * 1024 * 1024) return Response.json({ error: `${file.name} excede o limite de 30 MB.` }, { status: 400 });
    const { DB, FILES } = getRdoEnv();
    if (!FILES) throw new Error("Armazenamento do Diário de Obra indisponível.");
    const identity = relativePath || file.name;
    const existing = await DB.prepare("SELECT * FROM rdo_files WHERE record_id = ? AND relative_path = ? AND size_bytes = ? LIMIT 1").bind(recordId, identity, file.size).first();
    if (existing) return Response.json({ file: serialize(existing as Record<string, unknown>), duplicate: true });
    const id = crypto.randomUUID();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-120);
    const storageKey = `rdo/${recordDate}/${id}-${safeName}`;
    await FILES.put(storageKey, file.stream(), { httpMetadata: { contentType: file.type || "application/octet-stream" } });
    await DB.prepare(`INSERT INTO rdo_files (
      id, record_id, record_date, storage_key, file_name, relative_path, content_type, size_bytes, file_kind
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      id, recordId, recordDate, storageKey, file.name, identity,
      file.type || "application/octet-stream", file.size, kind,
    ).run();
    const row = await DB.prepare("SELECT * FROM rdo_files WHERE id = ?").bind(id).first();
    return Response.json({ file: serialize(row as Record<string, unknown>) }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Falha ao enviar o arquivo." }, { status: 500 });
  }
}
