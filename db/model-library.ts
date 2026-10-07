import { env } from "cloudflare:workers";
export const MAX_IFC_FILES = 20;
export const MAX_IFC_BYTES = 100_000_000;
export class LibraryError extends Error { constructor(message: string, public status = 400) { super(message); } }
export function libraryEnv() {
  if (!env.DB || !env.FILES) throw new LibraryError("Biblioteca temporariamente indisponível.", 503);
  return env as typeof env & { DB: D1Database; FILES: R2Bucket };
}
export function libraryUser(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin && origin !== "https://v2m-engenharia.engviniciusmores.chatgpt.site") throw new LibraryError("Origem não autorizada.",403);
  const id = request.headers.get("oai-authenticated-user-id");
  if (id && request.headers.get("oai-authenticated-user-email")) return id;
  if (process.env.NODE_ENV === "development" && ["localhost","127.0.0.1","[::1]"].includes(new URL(request.url).hostname)) return "local-development";
  throw new LibraryError("Entre na sua conta para acessar os projetos.", 401);
}
export function requiredName(value: unknown, max = 120) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new LibraryError("Informe um nome válido.");
  return value.trim();
}
export async function ownedProject(projectId: string, owner: string) {
  const {DB}=libraryEnv();
  const row=await DB.prepare("SELECT * FROM model_projects WHERE id = ? AND owner_id = ?").bind(projectId,owner).first();
  if(!row)throw new LibraryError("Projeto não encontrado.",404);
  return row;
}
export async function ownedFile(id: string, owner: string) {
  const {DB}=libraryEnv();
  const row=await DB.prepare("SELECT f.* FROM model_files f JOIN model_projects p ON p.id=f.project_id WHERE f.id=? AND p.owner_id=?").bind(id,owner).first<{id:string;project_id:string;name:string;size_bytes:number;storage_key:string;status:string}>();
  if(!row)throw new LibraryError("Arquivo não encontrado.",404);
  return row;
}
export function libraryFailure(error: unknown) {
  if(error instanceof LibraryError)return Response.json({error:error.message},{status:error.status});
  if(error instanceof SyntaxError)return Response.json({error:"Dados inválidos."},{status:400});
  console.error("Model library error", error);
  return Response.json({error:"Não foi possível concluir a operação. Tente novamente."},{status:503});
}
