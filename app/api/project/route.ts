import { env } from 'cloudflare:workers';
export async function GET(){const item=await (env.FILES as R2Bucket).get('project/config.json');return Response.json(item?await item.json():{name:'Minha obra'});}
export async function POST(request:Request){const data=await request.json() as {name:string};if(typeof data.name!=='string'||!data.name.trim()||data.name.length>120)return Response.json({error:'Nome inválido'},{status:400});await (env.FILES as R2Bucket).put('project/config.json',JSON.stringify({name:data.name.trim()}));return Response.json({saved:true});}
