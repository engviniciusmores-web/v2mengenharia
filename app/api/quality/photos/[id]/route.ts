import { ensureQualitySchema, getQualityEnv } from "../../../../../db/quality";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await ensureQualitySchema();
    const { id } = await context.params;
    const { DB, FILES } = getQualityEnv();
    const row = await DB.prepare("SELECT storage_key, content_type, file_name FROM quality_photos WHERE id = ?").bind(id).first<Record<string, string>>();
    if (!row) return new Response("Foto não encontrada.", { status: 404 });
    const object = await FILES.get(row.storage_key);
    if (!object) return new Response("Arquivo não encontrado.", { status: 404 });
    return new Response(object.body, { headers: { "Content-Type": row.content_type, "Content-Disposition": `inline; filename="${row.file_name.replace(/[\r\n"]/g, "")}"`, "Cache-Control": "private, max-age=3600" } });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Falha ao abrir a foto.", { status: 500 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await ensureQualitySchema();
    const { id } = await context.params;
    const { DB, FILES } = getQualityEnv();
    const row = await DB.prepare("SELECT storage_key FROM quality_photos WHERE id = ?").bind(id).first<{ storage_key: string }>();
    if (!row) return Response.json({ ok: true });
    await FILES.delete(row.storage_key);
    await DB.prepare("DELETE FROM quality_photos WHERE id = ?").bind(id).run();
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Falha ao excluir a foto." }, { status: 500 });
  }
}
