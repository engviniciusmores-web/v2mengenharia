import {libraryUser,libraryEnv,ownedProject,requiredName,libraryFailure,LibraryError,MAX_IFC_FILES} from "../../../../db/model-library";
export async function GET(request:Request){try{
 const owner=libraryUser(request),projectId=new URL(request.url).searchParams.get("projectId")||"";await ownedProject(projectId,owner);const {DB}=libraryEnv();
 const rows=await DB.prepare("SELECT f.id,f.name,f.created_at,(SELECT count(*) FROM model_federation_items i WHERE i.federation_id=f.id) AS file_count FROM model_federations f WHERE f.project_id=? ORDER BY f.created_at DESC,f.id").bind(projectId).all();
 return Response.json({federations:rows.results,maxModels:MAX_IFC_FILES},{headers:{"Cache-Control":"no-store"}});
}catch(e){return libraryFailure(e);}}
export async function POST(request:Request){try{
 const owner=libraryUser(request),body=await request.json() as {projectId:string;name:unknown;fileIds:unknown};await ownedProject(body.projectId,owner);
 const name=requiredName(body.name),ids=body.fileIds;
 if(!Array.isArray(ids)||ids.length<1||ids.length>MAX_IFC_FILES||ids.some(id=>typeof id!=="string")||new Set(ids).size!==ids.length)throw new LibraryError("Selecione entre 1 e 20 IFCs distintos.");
 const {DB}=libraryEnv();const files=await DB.prepare(`SELECT id FROM model_files WHERE project_id=? AND status='ready' AND id IN (${ids.map(()=>"?").join(",")})`).bind(body.projectId,...ids).all();
 if(files.results.length!==ids.length)throw new LibraryError("Todos os IFCs devem estar disponíveis neste projeto.");
 const id=crypto.randomUUID();await DB.batch([DB.prepare("INSERT INTO model_federations(id,project_id,name) VALUES(?,?,?)").bind(id,body.projectId,name),...ids.map((fileId,position)=>DB.prepare("INSERT INTO model_federation_items(id,federation_id,file_id,position) VALUES(?,?,?,?)").bind(crypto.randomUUID(),id,fileId,position))]);
 return Response.json({federation:{id,name,file_count:ids.length}},{status:201});
}catch(e){return libraryFailure(e);}}
