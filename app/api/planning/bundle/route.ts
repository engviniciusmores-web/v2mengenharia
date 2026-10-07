import {planningScope,libraryFailure,LibraryError} from "../../../../db/model-library";
import { env } from "cloudflare:workers";

const bundleKey = "planning/current-bundle.json";

function getFiles() {
  if (!env.FILES) throw new Error("Armazenamento do Planejamento indisponível.");
  return env.FILES as R2Bucket;
}

export async function GET(request: Request) {
  try {
    const federation = await planningScope(request);
    const object = await getFiles().get(federation ? `planning/federations/${federation}/bundle.json` : bundleKey);
    if (!object) return Response.json({ error: "Nenhum pacote atualizado foi salvo." }, { status: 404 });
    return new Response(object.body, {
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch (error) {
    return libraryFailure(error);
  }
}

export async function POST(request: Request) {
  try {
    const federation = await planningScope(request);
    const text = await request.text();
    if (text.length > 20_000_000) return Response.json({ error: "O pacote excede o limite de 20 MB." }, { status: 413 });
    const bundle = JSON.parse(text) as { schema_version?: number; wbs_rows?: unknown[]; elements?: unknown[]; federation_id?: string };
    if (bundle.schema_version !== 1 || !Array.isArray(bundle.wbs_rows) || !Array.isArray(bundle.elements)) {
      return Response.json({ error: "Pacote de planejamento incompatível." }, { status: 400 });
    }
    if(federation && bundle.federation_id !== federation) throw new LibraryError("O cronograma não pertence à composição selecionada.");
    if(!federation && bundle.federation_id) throw new LibraryError("Salve o cronograma no escopo da composição federada.");
    await getFiles().put(federation ? `planning/federations/${federation}/bundle.json` : bundleKey, text, {
      httpMetadata: { contentType: "application/json; charset=utf-8" },
      customMetadata: { savedAt: new Date().toISOString() },
    });
    return Response.json({ saved: true, tasks: bundle.wbs_rows.length, elements: bundle.elements.length });
  } catch (error) {
    return libraryFailure(error);
  }
}
