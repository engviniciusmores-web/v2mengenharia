import {libraryUser,libraryEnv,ownedFederation,libraryFailure,LibraryError} from '../../../../db/model-library';
const key=(owner:string)=>`model-library/owners/${encodeURIComponent(owner)}/active.json`;
export async function GET(request:Request){try{
 const owner=libraryUser(request),object=await libraryEnv().FILES.get(key(owner));if(!object)return Response.json({federation:null},{headers:{'Cache-Control':'no-store'}});
 const saved=await object.json<{id:string}>();return Response.json({federation:await ownedFederation(saved.id,owner)},{headers:{'Cache-Control':'no-store'}});
}catch(e){return libraryFailure(e);}}
export async function POST(request:Request){try{
 const owner=libraryUser(request),body=await request.json() as {id:string|null};if(body.id===null){await libraryEnv().FILES.delete(key(owner));return Response.json({federation:null});}if(typeof body.id!=='string')throw new LibraryError('Selecione uma composição.');
 const federation=await ownedFederation(body.id,owner);await libraryEnv().FILES.put(key(owner),JSON.stringify({id:federation.id}),{httpMetadata:{contentType:'application/json'}});
 return Response.json({federation});
}catch(e){return libraryFailure(e);}}
