import {elementKey} from './federation-rules.js';
import {interpretElement} from './metadata.js';
const text=value=>value?.value??value??'';
export async function readPlanningMetadata(api,modelId,file,geometryRecords){
 const parent=new Map(),storeys=new Map(),elements=[];let lengthScale=1;
 function lines(code,visit){const ids=api.GetLineIDsWithType(modelId,code);for(let i=0;i<ids.size();i++)visit(api.GetLine(modelId,ids.get(i),false));}
 const codes=await import('web-ifc');
 try{lines(codes.IFCSIUNIT,line=>{if(String(text(line.UnitType))==='LENGTHUNIT'&&String(text(line.Name))==='METRE'){lengthScale=({MILLI:.001,CENTI:.01,DECI:.1,KILO:1000})[String(text(line.Prefix))]||1;}});}catch{}
 lines(codes.IFCBUILDINGSTOREY,row=>storeys.set(row.expressID,{storeyId:row.expressID,storeyName:String(text(row.Name)),elevation:row.Elevation!=null?Number(text(row.Elevation))*lengthScale:undefined}));
 for(const code of [codes.IFCRELCONTAINEDINSPATIALSTRUCTURE,codes.IFCRELAGGREGATES])lines(code,row=>{for(const ref of row.RelatedElements||row.RelatedObjects||[])parent.set(ref.value,(row.RelatingStructure||row.RelatingObject).value);});
 const spatial=id=>{let current=id;const seen=new Set();while(current&&!seen.has(current)){if(storeys.has(current))return storeys.get(current);seen.add(current);current=parent.get(current);}return {};};
 const ids=new Set([...geometryRecords.values()].map(r=>r.expressId));
 for(const type of api.GetAllTypesOfModel(modelId)){if(!api.IsIfcElement(type.typeID))continue;const found=api.GetLineIDsWithType(modelId,type.typeID);for(let n=0;n<found.size();n++)ids.add(found.get(n));}
 let index=0;
 for(const id of ids){
  const line=api.GetLine(modelId,id,false),key=elementKey(file.id,id);let sets=[];
  try{sets=[...await api.properties.getPropertySets(modelId,id,true),...await api.properties.getPropertySets(modelId,id,true,true)];}catch{}
  const propertySets=sets.map(ps=>({name:String(text(ps.Name)),properties:(ps.HasProperties||ps.Quantities||[]).map(p=>({name:String(text(p.Name)),value:text(p.NominalValue??p.LengthValue??p.AreaValue??p.VolumeValue??p.WeightValue??p.CountValue)}))}));
  const info=interpretElement({...spatial(id),id,key,sourceId:file.id,sourceName:file.name,globalId:String(text(line.GlobalId)),type:api.GetNameFromTypeCode(api.GetLineType(modelId,id)),name:String(text(line.Name)||''),description:String(text(line.Description)),objectType:String(text(line.ObjectType)),tag:String(text(line.Tag)),propertySets,hasGeometry:geometryRecords.has(key),loadBearing:sets.some(ps=>(ps.HasProperties||[]).some(p=>String(text(p.Name))==='LoadBearing'&&['true','T','1'].includes(String(text(p.NominalValue)))))});
  elements.push(info);const record=geometryRecords.get(key);if(record)record.metadata=info;
  if(++index%100===0)await new Promise(resolve=>setTimeout(resolve,0));
 }
 return {elements,schema:api.GetModelSchema(modelId)};
}
export function federationInventory(manifest,models,failures){
 const elements=models.flatMap(m=>m.inventory?.elements||[]);
 return {name:manifest.federation.name,federationId:manifest.federation.id,signature:`federation:${manifest.federation.id}:${manifest.files.map(f=>f.id).sort().join('|')}`,complete:failures.length===0&&models.length===manifest.files.length,elements,models:models.map(m=>({id:m.id,name:m.name,schema:m.inventory?.schema||'IFC',elements_in_model:m.inventory?.elements.length||m.elements,geometry_processed:m.elements})),failures};
}
export function resolveLinks(records,links){
 const byKey=new Map(links.filter(l=>l.element_key).map(l=>[l.element_key,l])),bySource=new Map(links.filter(l=>l.source_id).map(l=>[`${l.source_id}:${l.guid}`,l])),legacy=new Map(links.filter(l=>!l.element_key&&!l.source_id).map(l=>[l.guid,l]));
 const occurrences=new Map();for(const r of records.values())occurrences.set(r.guid,(occurrences.get(r.guid)||0)+1);
 const result=new Map();for(const r of records.values()){const link=byKey.get(r.key)||bySource.get(`${r.fileId}:${r.guid}`)||(occurrences.get(r.guid)===1?legacy.get(r.guid):null);if(link)result.set(r.key,link);}return result;
}
export function createFederatedPlanner({records,repaint,material,onDate}){
 let bundle=null,rows=new Map(),links=new Map(),measurements={},cutoff=new Date().toISOString().slice(0,10),inventory=null,playback=null;
 const host=document.getElementById('planningPanel'),slider=document.getElementById('planningTimeline'),date=document.getElementById('planningDate'),play=document.getElementById('planningPlay'),future=document.getElementById('planningFuture'),linked=document.getElementById('planningLinked');
 host.hidden=false;document.getElementById('color').value='schedule';let dates=[],externalDate=false;
 function updateDate(value,notify=false){if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return;cutoff=value;date.value=cutoff;let index=0;while(index+1<dates.length&&dates[index+1]<=cutoff)index++;slider.value=String(index);document.getElementById('canvas').dataset.simulationDate=cutoff;repaint();if(notify)onDate(cutoff);}
 function rebuild(){rows=new Map((bundle?.wbs_rows||[]).map(r=>[r.wbs,{...r,start:r.start?.slice(0,10),finish:r.finish?.slice(0,10)}]));links=resolveLinks(records,bundle?.elements||[]);dates=[];const ends=[...rows.values()].flatMap(r=>[r.start,r.finish]).filter(Boolean).sort();if(ends.length){let day=new Date(ends[0]+'T12:00:00Z'),end=new Date(ends.at(-1)+'T12:00:00Z');for(let n=0;day<=end&&n<20000;n++){dates.push(day.toISOString().slice(0,10));day.setUTCDate(day.getUTCDate()+1);}}slider.max=String(Math.max(0,dates.length-1));slider.disabled=!dates.length;play.disabled=!links.size;document.getElementById('canvas').dataset.linkedElements=String(links.size);linked.textContent=`${links.size} elementos vinculados · ${rows.size} atividades`;updateDate(cutoff);}
 function acceptBundle(next){if(inventory&&next?.federation_id!==inventory.federationId)return;bundle=next;if(!externalDate&&next?.status_date)cutoff=next.status_date;playback=null;play.textContent='Reproduzir 4D';rebuild();}
 function presentation(info){const link=links.get(info.key),row=link?rows.get(link.wbs):null;if(!row||!row.start||!row.finish)return {visible:true,material:material('unlinked',0x9aa6a1)};const m=measurements[row.wbs],actual=m&&m.statusDate<=cutoff?m.actualPercent:row.actual_percent;let state=cutoff<row.start?'future':cutoff<=row.finish?'active':actual==null?'due':actual>=100?'done':'late';if(actual>=100)state='done';const colors={future:0xd6dde3,active:0xd99b18,due:0x2e504c,done:0x2f9b62,late:0xc34c47};return {visible:state!=='future'||future.checked,material:material('planning:'+state,colors[state],state==='future'?.22:1),state};}
 function describe(info){const link=links.get(info.key),row=link?rows.get(link.wbs):null;return {wbs:link?.wbs||'',activity:row?.name||'Sem vínculo produtivo',phase:link?.phase||'',start:row?.start||'',finish:row?.finish||''};}
 function publish(){if(inventory)window.parent.postMessage({type:'v2m-ifc-inventory',inventory},location.origin);}
 window.addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==window.parent)return;const data=event.data;if(data?.type==='v2m-sequence-bundle')acceptBundle(data.bundle);if(data?.type==='v2m-request-inventory')publish();if(data?.type==='v2m-planning-update'){if(data.date)externalDate=true;measurements=data.measurements||{};if(data.date&&data.date!==cutoff&&!playback){playback=null;play.textContent='Reproduzir 4D';updateDate(data.date);}else repaint();}if(data?.type==='v2m-focus-wbs'){for(const info of records.values())info.taskSelected=links.get(info.key)?.wbs===data.wbs;repaint();}});
 slider.addEventListener('input',()=>{playback=null;play.textContent='Reproduzir 4D';updateDate(dates[Number(slider.value)],true);});date.addEventListener('change',()=>{playback=null;play.textContent='Reproduzir 4D';updateDate(date.value,true);});future.addEventListener('change',repaint);
 play.addEventListener('click',()=>{if(playback){playback=null;play.textContent='Reproduzir 4D';return;}if(!dates.length)return;playback={start:performance.now(),last:0};play.textContent='Pausar';});
 return {presentation,describe,acceptBundle,ready(next){inventory=next;rebuild();publish();},update(data){if(data.date)externalDate=true;measurements=data.measurements||{};updateDate(data.date||cutoff);},tick(time){if(!playback||time-playback.last<80)return;playback.last=time;const fraction=Math.min(1,(time-playback.start)/30000),index=Math.floor(fraction*(dates.length-1));if(dates[index]!==cutoff)updateDate(dates[index],true);if(fraction===1){playback=null;play.textContent='Reproduzir 4D';}}};
}
