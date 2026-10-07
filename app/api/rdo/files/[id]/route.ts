import { ensureRdoSchema, getRdoEnv } from "../../../../../db/rdo";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await ensureRdoSchema();
    const { id } = await context.params;
    const { DB, FILES } = getRdoEnv();
    const row = await DB.prepare("SELECT storage_key, content_type, file_name FROM rdo_files WHERE id = ?").bind(id).first<Record<string, string>>();
    if (!row) return new Response("Arquivo não encontrado.", { status: 404 });
    const object = await FILES.get(row.storage_key);
    if (!object) return new Response("Arquivo não encontrado.", { status: 404 });
    const inline = row.content_type.startsWith("image/") || row.content_type === "application/pdf";
    return new Response(object.body, { headers: {
      "Content-Type": row.content_type,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${row.file_name.replace(/[\r\n"]/g, "")}"`,
      "Cache-Control": "private, max-age=3600",
    } });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Falha ao abrir o arquivo.", { status: 500 });
  }
}
