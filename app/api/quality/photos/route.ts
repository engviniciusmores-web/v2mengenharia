import { ensureQualitySchema, getQualityEnv } from "../../../../db/quality";

function serialize(row: Record<string, unknown>) {
  return { id: row.id, recordId: row.record_id, elementKey: row.element_key, fileName: row.file_name,
    contentType: row.content_type, sizeBytes: row.size_bytes, createdAt: row.created_at,
    url: `/api/quality/photos/${row.id}` };
}

export async function GET(request: Request) {
  try {
    await ensureQualitySchema();
    const recordId = new URL(request.url).searchParams.get("recordId");
    if (!recordId) return Response.json({ photos: [] });
    const { DB } = getQualityEnv();
    const result = await DB.prepare("SELECT * FROM quality_photos WHERE record_id = ? ORDER BY created_at DESC").bind(recordId).all();
    return Response.json({ photos: result.results.map((row) => serialize(row as Record<string, unknown>)) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Falha ao listar fotos." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureQualitySchema();
    const form = await request.formData();
    const file = form.get("file");
    const recordId = String(form.get("recordId") || "");
    const elementKey = String(form.get("elementKey") || "");
    if (!(file instanceof File) || !recordId || !elementKey) return Response.json({ error: "Arquivo e registro são obrigatórios." }, { status: 400 });
    if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(file.type)) return Response.json({ error: "Use foto JPG, PNG ou WEBP." }, { status: 400 });
    if (file.size > 10 * 1024 * 1024) return Response.json({ error: "A foto deve ter no máximo 10 MB." }, { status: 400 });
    const { DB, FILES } = getQualityEnv();
    if (!FILES) throw new Error("Armazenamento de evidências indisponível.");
    const id = crypto.randomUUID();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-100);
    const storageKey = `quality/${recordId}/${id}-${safeName}`;
    await FILES.put(storageKey, file.stream(), { httpMetadata: { contentType: file.type } });
    await DB.prepare("INSERT INTO quality_photos (id, record_id, element_key, storage_key, file_name, content_type, size_bytes) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(id, recordId, elementKey, storageKey, file.name, file.type, file.size).run();
    const row = await DB.prepare("SELECT * FROM quality_photos WHERE id = ?").bind(id).first();
    return Response.json({ photo: serialize(row as Record<string, unknown>) }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Falha ao enviar a foto." }, { status: 500 });
  }
}
