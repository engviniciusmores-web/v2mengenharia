import { env } from "cloudflare:workers";

const bundleKey = "planning/current-bundle.json";

function getFiles() {
  if (!env.FILES) throw new Error("Armazenamento do Planejamento indisponível.");
  return env.FILES as R2Bucket;
}

export async function GET() {
  try {
    const object = await getFiles().get(bundleKey);
    if (!object) return Response.json({ error: "Nenhum pacote atualizado foi salvo." }, { status: 404 });
    return new Response(object.body, {
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Falha ao carregar o cronograma atualizado." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const text = await request.text();
    if (text.length > 20_000_000) return Response.json({ error: "O pacote excede o limite de 20 MB." }, { status: 413 });
    const bundle = JSON.parse(text) as { schema_version?: number; wbs_rows?: unknown[]; elements?: unknown[] };
    if (bundle.schema_version !== 1 || !Array.isArray(bundle.wbs_rows) || !Array.isArray(bundle.elements)) {
      return Response.json({ error: "Pacote de planejamento incompatível." }, { status: 400 });
    }
    await getFiles().put(bundleKey, text, {
      httpMetadata: { contentType: "application/json; charset=utf-8" },
      customMetadata: { savedAt: new Date().toISOString() },
    });
    return Response.json({ saved: true, tasks: bundle.wbs_rows.length, elements: bundle.elements.length });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Falha ao salvar o cronograma atualizado." }, { status: 400 });
  }
}
