import {libraryUser,libraryEnv,requiredName,libraryFailure} from "../../../../db/model-library";
export async function GET(request: Request){try{
 const owner=libraryUser(request),{DB}=libraryEnv();
 const rows=await DB.prepare("SELECT p.id,p.name,p.created_at,(SELECT count(*) FROM model_files f WHERE f.project_id=p.id AND f.status='ready') AS file_count FROM model_projects p WHERE p.owner_id=? ORDER BY p.created_at DESC,p.id").bind(owner).all();
 return Response.json({projects:rows.results},{headers:{"Cache-Control":"no-store"}});
}catch(e){return libraryFailure(e);}}
export async function POST(request: Request){try{
 const owner=libraryUser(request),body=await request.json() as {name:unknown},name=requiredName(body.name),id=crypto.randomUUID(),{DB}=libraryEnv();
 await DB.prepare("INSERT INTO model_projects(id,owner_id,name) VALUES(?,?,?)").bind(id,owner,name).run();
 return Response.json({project:{id,name}},{status:201});
}catch(e){return libraryFailure(e);}}
