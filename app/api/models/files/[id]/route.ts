import {libraryUser,libraryEnv,ownedFile,libraryFailure,LibraryError,MAX_IFC_BYTES} from "../../../../../db/model-library";
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context){try{
 const owner=libraryUser(request),{id}=await context.params,file=await ownedFile(id,owner);
 if(file.status!=="ready")throw new LibraryError("Arquivo ainda não disponível.",409);
 const object=await libraryEnv().FILES.get(file.storage_key);
 if(!object)throw new LibraryError("Arquivo não encontrado no armazenamento.",404);
 return new Response(object.body,{headers:{"Content-Type":"application/octet-stream","Content-Length":String(object.size),"Content-Disposition":`attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
}catch(e){return libraryFailure(e);}}
export async function PUT(request:Request,context:Context){let reserved:{id:string;key:string}|null=null;try{
 const owner=libraryUser(request),{id}=await context.params,file=await ownedFile(id,owner),{DB,FILES}=libraryEnv();
 if(!request.body)throw new LibraryError("Envie o conteúdo do IFC.");
 const length=Number(request.headers.get("content-length"));
 if(length&&length!==file.size_bytes)throw new LibraryError("O tamanho do arquivo não corresponde ao informado.");
 const claim=await DB.prepare("UPDATE model_files SET status='uploading' WHERE id=? AND status='pending'").bind(id).run();
 if(!claim.meta.changes)throw new LibraryError("Esse envio já foi iniciado. Atualize a biblioteca.",409);
 reserved={id,key:file.storage_key};let size=0,prefix="",tail="",checked=false;
 const decoder=new TextDecoder();
 const stream=request.body.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({
  transform(chunk,controller){size+=chunk.byteLength;if(size>MAX_IFC_BYTES||size>file.size_bytes)throw new LibraryError("Arquivo excede o tamanho permitido.",413);
   if(!checked){prefix+=(decoder.decode(chunk.subarray(0,4096-prefix.length)));if(prefix.length>=32||size===file.size_bytes){if(!/^\s*(?:\uFEFF)?ISO-10303-21;/i.test(prefix))throw new LibraryError("O conteúdo não é um IFC STEP válido.");checked=true;}}
   tail=(tail+decoder.decode(chunk.subarray(Math.max(0,chunk.length-256)))).slice(-256);controller.enqueue(chunk);
  },
  flush(){if(size!==file.size_bytes||!checked||!/END-ISO-10303-21;\s*$/i.test(tail))throw new LibraryError("IFC incompleto ou inválido. Envie novamente o arquivo original.");}
 }));
 const fixed = new FixedLengthStream(file.size_bytes);
 await Promise.all([stream.pipeTo(fixed.writable),FILES.put(file.storage_key,fixed.readable,{httpMetadata:{contentType:"application/octet-stream"}})]);
 await DB.prepare("UPDATE model_files SET status='ready' WHERE id=? AND status='uploading'").bind(id).run();
 reserved=null;return Response.json({saved:true,id},{status:201});
}catch(e){if(reserved){const {DB,FILES}=libraryEnv();await FILES.delete(reserved.key).catch(()=>{});await DB.prepare("UPDATE model_files SET status='failed' WHERE id=?").bind(reserved.id).run().catch(()=>{});}return libraryFailure(e);}}
