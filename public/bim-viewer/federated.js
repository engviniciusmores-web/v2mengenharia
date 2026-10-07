import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import * as WebIFC from 'web-ifc';
import {readPlanningMetadata,federationInventory,createFederatedPlanner} from './federated-planning.js';
import {validateFederation,elementKey,relativePlacement} from './federation-rules.js';
const ui=Object.fromEntries(['canvas','fit','color','status','loading','title','project','counts','models','properties','failures'].map(id=>[id,document.getElementById(id)]));
const scene=new THREE.Scene();scene.background=new THREE.Color(0xf2ede5);
const renderer=new THREE.WebGLRenderer({canvas:ui.canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;
const camera=new THREE.PerspectiveCamera(42,1,.05,100000),controls=new OrbitControls(camera,ui.canvas);controls.enableDamping=true;
scene.add(new THREE.HemisphereLight(0xffffff,0xb5ad91,2.4));const sun=new THREE.DirectionalLight(0xffffff,2.3);sun.position.set(80,100,60);scene.add(sun);
const grid=new THREE.GridHelper(200,40,0xc8c0b1,0xe2dccf);scene.add(grid);
const palette=[0x2e504c,0xb89863,0x698d9e,0xa88a9f,0x829568,0xa3675e,0x6476a2,0x9f914f,0x537f73,0xbb926a];
const materials=new Map(),records=new Map(),models=[],raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();let dirty=true,origin=null,selected=null,totalTriangles=0,totalElements=0;
const planningMode=new URLSearchParams(location.search).get('mode')==='planning';let planner=null;
const selectedMaterial=new THREE.MeshStandardMaterial({color:0xffc400,emissive:0x503800,side:THREE.DoubleSide});
function mat(key,color,alpha=1){if(!materials.has(key))materials.set(key,new THREE.MeshStandardMaterial({color,roughness:.82,side:THREE.DoubleSide,opacity:alpha,transparent:alpha<1}));return materials.get(key);}
function native(value){return value?.value??value??'';}
function resize(){const box=ui.canvas.parentElement;const w=Math.max(1,box.clientWidth),h=Math.max(1,box.clientHeight);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();dirty=true;}
function render(time=performance.now()){requestAnimationFrame(render);planner?.tick(time);controls.update();if(dirty){renderer.render(scene,camera);dirty=false;}}
controls.addEventListener('change',()=>{dirty=true;});window.addEventListener('resize',resize);
function fit(){const box=new THREE.Box3();for(const model of models)if(model.group.visible)box.union(new THREE.Box3().setFromObject(model.group));if(box.isEmpty())return;const center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3()),span=Math.max(1,size.x,size.y,size.z),d=span/(2*Math.tan(camera.fov*Math.PI/360));camera.position.set(center.x+d*.8,center.y+d*.6,center.z+d*.8);camera.near=Math.max(.02,d/2000);camera.far=Math.max(100,d*30);camera.updateProjectionMatrix();controls.target.copy(center);grid.position.set(center.x,box.min.y-.03,center.z);grid.scale.setScalar(Math.max(1,span/200));controls.update();dirty=true;}
function typeColor(type){if(/FOOTING|PILE/i.test(type))return 0xcbb99b;if(/COLUMN/i.test(type))return 0x244b43;if(/BEAM/i.test(type))return 0x52786a;if(/SLAB/i.test(type))return 0xa8bba3;if(/WALL/i.test(type))return 0xb5ad91;return 0x8fa5aa;}
function recolor(){for(const info of records.values()){for(const mesh of info.meshes){const presentation=planner?.presentation(info);mesh.visible=presentation?.visible??true;mesh.material=(selected===info.key||info.taskSelected)?selectedMaterial:ui.color.value==='schedule'&&presentation?presentation.material:ui.color.value==='original'?mesh.userData.originalMaterial:ui.color.value==='type'?mat('type:'+info.type,typeColor(info.type)):mat('file:'+info.fileId,info.color);}}dirty=true;}
function properties(info){ui.properties.replaceChildren();const task=planner?.describe(info);if(task)window.parent.postMessage({type:'v2m-ifc-element-selected',element:{id:info.expressId,key:info.key,sourceId:info.fileId,sourceName:info.fileName,globalId:info.guid,type:info.type,name:info.name,...task}},location.origin);for(const [label,value] of [['Arquivo',info.fileName],['Classe IFC',info.type],['Elemento',info.name],['GlobalId',info.guid||'Ausente no IFC'],['ExpressID',info.expressId],['Identidade federada',info.key],...(task?[['WBS',task.wbs||'Sem vínculo'],['Atividade',task.activity],['Início',task.start],['Término',task.finish]]:[])]){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=String(value);ui.properties.append(dt,dd);}}
ui.canvas.addEventListener('pointerdown',e=>{const r=ui.canvas.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-((e.clientY-r.top)/r.height)*2+1);raycaster.setFromCamera(pointer,camera);const hit=raycaster.intersectObjects(models.filter(m=>m.group.visible).map(m=>m.group),true).find(x=>x.object.visible);if(!hit)return;selected=hit.object.userData.key;recolor();const info=records.get(selected);if(info)properties(info);});
ui.fit.addEventListener('click',fit);ui.color.addEventListener('change',recolor);
function modelList(){ui.models.replaceChildren();for(const model of models){const label=document.createElement('label'),input=document.createElement('input'),span=document.createElement('span'),small=document.createElement('small');label.className='model-row';input.type='checkbox';input.checked=model.group.visible;input.setAttribute('aria-label','Mostrar '+model.name);input.addEventListener('change',()=>{model.group.visible=input.checked;dirty=true;});span.textContent=model.name;small.textContent=`${model.elements} elementos · ${model.triangles.toLocaleString('pt-BR')} triângulos`;span.append(small);label.append(input,span);ui.models.append(label);}ui.counts.textContent=`${models.length} / ${manifestCount} IFCs · ${totalElements.toLocaleString('pt-BR')} elementos`;}
let manifestCount=0,api;
async function loadFile(file,index){
 const group=new THREE.Group();group.name=file.name;const fileRecords=new Map();let modelId=null,triangles=0;
 ui.loading.textContent=`Baixando IFC ${index+1} de ${manifestCount}: ${file.name}`;
 const response=await fetch(file.url,{cache:'no-store'});if(!response.ok)throw new Error(`Arquivo indisponível (HTTP ${response.status}).`);
 const buffer=await response.arrayBuffer();if(buffer.byteLength!==file.size_bytes)throw new Error('O tamanho baixado não corresponde ao arquivo salvo.');
 try{
  ui.loading.textContent=`Processando IFC ${index+1} de ${manifestCount}: ${file.name}`;
  // No independent recentering: all source transforms use the same reference.
  modelId=api.OpenModel(new Uint8Array(buffer),{COORDINATE_TO_ORIGIN:false,USE_FAST_BOOLS:true});
  const fileColor=palette[index%palette.length];
  api.StreamAllMeshes(modelId,flat=>{
   const id=Number(flat.expressID),key=elementKey(file.id,id),line=api.GetLine(modelId,id,false),type=api.GetNameFromTypeCode(api.GetLineType(modelId,id));
   const record={key,expressId:id,fileId:file.id,fileName:file.name,guid:String(native(line.GlobalId)),name:String(native(line.Name)||`${type} ${id}`),type,color:fileColor,meshes:[]};
   for(let n=0;n<flat.geometries.size();n++){
    const placed=flat.geometries.get(n),shape=api.GetGeometry(modelId,placed.geometryExpressID);let geometry;
    try{
     const vertices=api.GetVertexArray(shape.GetVertexData(),shape.GetVertexDataSize()),indices=api.GetIndexArray(shape.GetIndexData(),shape.GetIndexDataSize());
     if(!vertices.length||!indices.length)continue;
     triangles+=indices.length/3;if(totalTriangles+triangles>5_000_000)throw new Error('Conjunto excede o limite de geometria desta prévia (5 milhões de triângulos). Abra menos disciplinas.');
     const placement=Array.from(placed.flatTransformation);
     if(!origin){const first=new THREE.Vector3(vertices[0],vertices[1],vertices[2]).applyMatrix4(new THREE.Matrix4().fromArray(placement));origin=[first.x,first.y,first.z];}
     const positions=new Float32Array(vertices.length/2),normals=new Float32Array(vertices.length/2);
     for(let a=0,b=0;a<vertices.length;a+=6,b+=3){positions[b]=vertices[a];positions[b+1]=vertices[a+1];positions[b+2]=vertices[a+2];normals[b]=vertices[a+3];normals[b+1]=vertices[a+4];normals[b+2]=vertices[a+5];}
     geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.BufferAttribute(normals,3));geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices),1));geometry.applyMatrix4(new THREE.Matrix4().fromArray(relativePlacement(placement,origin)));geometry.computeBoundingSphere();
     const color=placed.color,alpha=Math.max(.1,Number(color?.w??1)),original=new THREE.Color(Number(color?.x??.6),Number(color?.y??.6),Number(color?.z??.6)),originalMaterial=mat(`rgb:${original.getHex()}:${alpha}`,original,alpha);
     const mesh=new THREE.Mesh(geometry,mat('file:'+file.id,fileColor));mesh.userData={key,originalMaterial};group.add(mesh);record.meshes.push(mesh);
    }finally{shape.delete?.();}
   }
   if(record.meshes.length)fileRecords.set(key,record);
  });
  if(!fileRecords.size)throw new Error('O motor não encontrou geometria suportada neste IFC.');
  const inventory=planningMode?await readPlanningMetadata(api,modelId,file,fileRecords):null;
  scene.add(group);for(const [key,record] of fileRecords)records.set(key,record);models.push({id:file.id,name:file.name,group,elements:fileRecords.size,triangles,inventory});totalElements+=fileRecords.size;totalTriangles+=triangles;modelList();recolor();fit();
 }catch(error){group.traverse(o=>o.geometry?.dispose());group.clear();throw error;}finally{if(modelId!==null)api.CloseModel(modelId);}
}
async function init(){resize();render();const federation=new URLSearchParams(location.search).get('federation');try{
 if(!federation)throw new Error('Abra uma composição salva na biblioteca de projetos.');
 const response=await fetch('/api/models/federations/'+encodeURIComponent(federation),{cache:'no-store'}),manifest=await response.json();if(!response.ok)throw new Error(manifest.error||'Composição indisponível.');
 const files=validateFederation(manifest.files);manifestCount=files.length;ui.title.textContent=manifest.federation.name;ui.project.textContent=manifest.federation.project_name;
 api=new WebIFC.IfcAPI();api.SetWasmPath('https://unpkg.com/web-ifc@0.0.77/',true);await api.Init(undefined,true);
 if(planner){const suffix='?federation='+encodeURIComponent(federation);try{const saved=await fetch('/api/planning/bundle'+suffix,{cache:'no-store'});if(saved.ok)planner.acceptBundle(await saved.json());const measurements=await fetch('/api/planning'+suffix,{cache:'no-store'});if(measurements.ok){const data=await measurements.json();planner.update({measurements:Object.fromEntries((data.measurements||[]).map(m=>[m.wbs,m]))});}}catch(error){console.warn('Planejamento federado ainda não disponível',error);}}
 const failures=[];
 for(let i=0;i<files.length;i++){try{await loadFile(files[i],i);}catch(e){console.error(e);failures.push(`${files[i].name}: ${e.message}`);}await new Promise(resolve=>setTimeout(resolve,0));}
 if(planner)planner.ready(federationInventory(manifest,models,failures));
 ui.failures.textContent=failures.join(' · ');ui.fit.disabled=!models.length;ui.loading.hidden=true;ui.status.textContent=`${models.length} de ${files.length} IFCs abertos${failures.length?' · '+failures.length+' com falha — confira a lista':''}. Orbite com o mouse; use a roda para aproximar e o botão direito para deslocar.`;ui.canvas.dataset.loadedModels=String(models.length);ui.canvas.dataset.elements=String(totalElements);ui.canvas.dataset.triangles=String(totalTriangles);ui.canvas.dataset.failures=String(failures.length);ui.canvas.dataset.sharedOrigin=JSON.stringify(origin);if(!models.length)ui.status.classList.add('error');
 }catch(error){console.error(error);ui.loading.hidden=true;ui.status.textContent=error.message;ui.status.classList.add('error');}
}
window.addEventListener('pagehide',()=>{for(const m of models)m.group.traverse(o=>o.geometry?.dispose());for(const m of materials.values())m.dispose();selectedMaterial.dispose();api?.Dispose?.();renderer.dispose();});
if(!planningMode)ui.color.querySelector('[value="schedule"]')?.remove();
if(planningMode)planner=createFederatedPlanner({records,repaint:recolor,material:mat,onDate:date=>window.parent.postMessage({type:'v2m-planning-date-change',date},location.origin)});
init();
