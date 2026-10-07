import {libraryUser,libraryEnv,libraryFailure,LibraryError,MAX_IFC_FILES} from "../../../../../db/model-library";
export async function GET(request:Request,context:{params:Promise<{id:string}>}){try{
 const owner=libraryUser(request),{id}=await context.params,{DB}=libraryEnv();
 const federation=await DB.prepare("SELECT f.id,f.name,f.project_id,p.name AS project_name FROM model_federations f JOIN model_projects p ON p.id=f.project_id WHERE f.id=? AND p.owner_id=?").bind(id,owner).first();
 if(!federation)throw new LibraryError("Modelo federado não encontrado.",404);
 const rows=await DB.prepare("SELECT f.id,f.name,f.size_bytes,f.status,i.position FROM model_federation_items i JOIN model_files f ON f.id=i.file_id WHERE i.federation_id=? ORDER BY i.position").bind(id).all();
 if(!rows.results.length||rows.results.length>MAX_IFC_FILES||rows.results.some(f=>f.status!=="ready"))throw new LibraryError("A composição contém arquivos indisponíveis.",409);
 return Response.json({federation,files:rows.results.map(f=>({...f,url:`/api/models/files/${f.id}`})),maxModels:MAX_IFC_FILES},{headers:{"Cache-Control":"no-store"}});
}catch(e){return libraryFailure(e);}}
