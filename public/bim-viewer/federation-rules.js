export const MAX_FEDERATED_MODELS = 20;
export function validateFederation(files) {
 if(!Array.isArray(files)||!files.length||files.length>MAX_FEDERATED_MODELS)throw new Error('A composição deve conter de 1 a 20 IFCs.');
 if(new Set(files.map(f=>f.id)).size!==files.length||files.some(f=>!f.id||!f.url||!f.name))throw new Error('Composição de modelos inválida.');
 return files;
}
export function elementKey(fileId,expressId){return `${fileId}:${expressId}`;}
// One shared translation preserves relative placement, unlike centering each IFC.
export function relativePlacement(matrix,origin){const result=Array.from(matrix);result[12]-=origin[0];result[13]-=origin[1];result[14]-=origin[2];return result;}
