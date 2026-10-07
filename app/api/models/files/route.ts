import {libraryUser,libraryEnv,ownedProject,requiredName,libraryFailure,LibraryError,MAX_IFC_BYTES} from "../../../../db/model-library";
export async function GET(request: Request){try{
 const owner=libraryUser(request),projectId=new URL(request.url).searchParams.get("projectId")||"";
 await ownedProject(projectId,owner);const {DB}=libraryEnv();
 const rows=await DB.prepare("SELECT id,name,size_bytes,status,created_at FROM model_files WHERE project_id=? ORDER BY created_at DESC,id").bind(projectId).all();
 return Response.json({files:rows.results,maxFileBytes:MAX_IFC_BYTES},{headers:{"Cache-Control":"no-store"}});
}catch(e){return libraryFailure(e);}}
export async function POST(request: Request){try{
 const owner=libraryUser(request),body=await request.json() as {projectId:string;name:unknown;size:number};
 await ownedProject(body.projectId,owner);const name=requiredName(body.name,240);
 if(!name.toLowerCase().endsWith(".ifc"))throw new LibraryError("Selecione um arquivo IFC.");
 if(!Number.isSafeInteger(body.size)||body.size<1||body.size>MAX_IFC_BYTES)throw new LibraryError("Cada IFC deve ter até 100 MB.",413);
 const id=crypto.randomUUID(),storageKey=`model-library/${body.projectId}/${id}.ifc`,{DB}=libraryEnv();
 await DB.prepare("INSERT INTO model_files(id,project_id,name,size_bytes,storage_key) VALUES(?,?,?,?,?)").bind(id,body.projectId,name,body.size,storageKey).run();
 return Response.json({file:{id,name,size_bytes:body.size},uploadUrl:`/api/models/files/${id}`},{status:201});
}catch(e){return libraryFailure(e);}}
