import {interpretElement} from "./metadata.js";
// Deterministic construction proposal; durations and calendar are explicit assumptions.
export const defaultSequenceOptions = {start:new Date().toLocaleDateString('en-CA'),workdays:true,foundationDays:5,columnDays:3,beamDays:3,slabDays:5,otherDays:3,releaseDays:3};
const clean = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
function category(element) {
 const type=clean(element.type),name=clean(element.name);
 const kind=element.structuralKind;
 if(kind==='Estacas')return ['Estacas',0,'foundationDays'];
 if(kind==='Fundações')return ['Sapatas, blocos e radier',1,'foundationDays'];
 if(kind==='Pilares')return ['Pilares',3,'columnDays'];
 if(kind==='Vigas')return ['Vigas',4,'beamDays'];
 if(kind==='Lajes')return ['Lajes',5,'slabDays'];
 if(kind==='Escadas'||kind==='Rampas')return ['Escadas e rampas',6,'otherDays'];
 if(type==='ifcpile'||/estaca|pile/.test(name))return ['Estacas',0,'foundationDays'];
 if(type==='ifcfooting'||/sapata|bloco de fund|radier|fundacao/.test(name))return ['Sapatas, blocos e radier',1,'foundationDays'];
 if(type==='ifccolumn'||/\bpilar\b|\bpilares\b|\bcolumn\b/.test(name))return ['Pilares',3,'columnDays'];
 if(type==='ifcbeam'||/\bviga\b|\bvigas\b|\bbeam\b/.test(name))return ['Vigas',4,'beamDays'];
 if(type==='ifcslab'||/\blaje\b|\blajes\b|\bslab\b/.test(name))return ['Lajes',5,'slabDays'];
 if(type==='ifcwall'||type==='ifcwallstandardcase')return element.loadBearing||/arrimo|contencao|estrutural/.test(name)?['Paredes estruturais e contenções',2,'otherDays']:['Paredes e alvenaria',7,'otherDays'];
 if(type==='ifcstair'||type==='ifcstairflight'||/escada/.test(name))return ['Escadas',6,'otherDays'];
 return null;
}
function namedLevel(element) {
 const text=clean(`${element.storeyName || ''} ${element.name || ''}`);
 if(/subsolo|basement/.test(text)){const n=Number(text.match(/(?:subsolo|basement)\s*(\d+)/)?.[1]||1);return {name:`Subsolo ${n}`,order:-n,source:'PREMISSA · nome'};}
 if(/fundac/.test(text))return {name:'Fundação',order:-1000,source:'PREMISSA · nome'};
 if(/terreo|ground/.test(text))return {name:'Térreo',order:0,source:'PREMISSA · nome'};
 const match=text.match(/(?:pavimento|pav|andar|nivel|floor)\s*[._-]?\s*(\d+)|(\d+)\s*(?:o|º|°)?\s*(?:pavimento|pav|andar|floor)/);
 if(match){const n=Number(match[1]||match[2]);return {name:`Pavimento ${n}`,order:n,source:'PREMISSA · nome'};}
 if(/cobertura|roof/.test(text))return {name:'Cobertura',order:10000,source:'PREMISSA · nome'};
 return null;
}
function iso(date){return date.toISOString().slice(0,10);}
function date(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error('Informe a data inicial.');const d=new Date(value+'T12:00:00Z');if(!Number.isFinite(d.getTime()))throw new Error('Data inválida.');return d;}
function nextDay(d){const n=new Date(d);n.setUTCDate(n.getUTCDate()+1);return n;}
function working(d,week){while(week&&(d.getUTCDay()===0||d.getUTCDay()===6))d=nextDay(d);return d;}
export function finishDate(start,duration,workdays=true){let d=working(date(start),workdays);for(let i=1;i<duration;i++)d=working(nextDay(d),workdays);return iso(d);}
export function generateSequence(inventory,options={}) {
 if(inventory.complete===false)throw new Error('A composição não foi carregada por completo. Confira os arquivos com falha antes de gerar o cronograma.');
 inventory={...inventory,elements:inventory.elements.map(interpretElement)};
 const settings={...defaultSequenceOptions,...options};date(settings.start);
 for(const key of ['foundationDays','columnDays','beamDays','slabDays','otherDays','releaseDays'])if(!Number.isInteger(Number(settings[key]))||Number(settings[key])<1||Number(settings[key])>365)throw new Error('As durações devem ficar entre 1 e 365 dias.');
 const levels=new Map(),pending=[],excluded=[],seen=new Set();
 const storeyAtElevation=new Map();for(const e of inventory.elements)if(e.storeyId&&Number.isFinite(e.elevation)){if(!storeyAtElevation.has(`${e.sourceId||""}:${e.elevation}`))storeyAtElevation.set(`${e.sourceId||""}:${e.elevation}`,new Set());storeyAtElevation.get(`${e.sourceId||""}:${e.elevation}`).add(e.storeyId);}
 let modelHash=2166136261;for(const ch of inventory.signature)modelHash=Math.imul(modelHash^ch.charCodeAt(0),16777619);const prefix=`IFC-${(modelHash>>>0).toString(16)}`;
 const knownElevations=[...new Set(inventory.elements.filter(e=>e.storeyId&&Number.isFinite(e.elevation)).map(e=>e.elevation))].sort((a,b)=>a-b);
 for(const e of inventory.elements){
  if(String(e.type).toUpperCase()==='IFCOPENINGELEMENT'){excluded.push({...e,reason:'Abertura/vazio; não é peça física a executar'});continue;}
  const key=e.sourceId?`${e.sourceId}:${e.globalId||e.id}`:e.globalId||`express-${e.id}`;if(!e.globalId){pending.push({...e,reason:'GlobalId ausente; vínculo rastreável a confirmar'});continue;}if(seen.has(key)){pending.push({...e,reason:'Identificador duplicado no modelo'});continue;}seen.add(key);
  if(e.sourceId&&e.hasGeometry===false){pending.push({...e,reason:'Representação geométrica não disponível no visualizador'});continue;}
  const c=category(e);if(!c){pending.push({...e,reason:'Função executiva não reconhecida'});continue;}
  let level;
  if(c[1]<=1)level={name:'Fundações',order:-100000,source:'PREMISSA · tipo/nome IFC',key:'foundation'};
  else if(e.storeyId&&Number.isFinite(e.elevation)){
   const named=namedLevel(e);const tied=storeyAtElevation.get(`${e.sourceId||""}:${e.elevation}`).size>1;
   if(tied&&!named){pending.push({...e,reason:'Pavimentos com elevações coincidentes; ordem a confirmar'});continue;}
   level={name:e.storeyName||`Nível ${e.elevation}`,order:knownElevations.indexOf(e.elevation),suborder:tied?(named?.order||0):0,source:tied?'PREMISSA · nome; elevações coincidentes':'EXTRAIDO_METADATA · IfcBuildingStorey',key:String(e.storeyId)};
  }
  else {const named=namedLevel(e);if(named)level={...named,key:clean(named.name)};else {pending.push({...e,reason:'Pavimento ou elevação não identificados'});continue;}}
  if(e.sourceId){level={...level,key:`${e.sourceId}:${level.key}`,name:`${level.name} · ${e.sourceName||e.sourceId}`};}
  if(!levels.has(level.key))levels.set(level.key,{...level,groups:new Map()});
  const item=levels.get(level.key);if(!item.groups.has(c[1]))item.groups.set(c[1],{name:c[0],rank:c[1],durationKey:c[2],elements:[]});item.groups.get(c[1]).elements.push(e);
 }
 const ordered=[...levels.values()].sort((a,b)=>a.order-b.order||(a.suborder||0)-(b.suborder||0)||a.name.localeCompare(b.name,'pt-BR'));
 let cursor=working(date(settings.start),settings.workdays),previous='',counter=0;const rows=[],links=[];
 for(const level of ordered){const structural=[...level.groups.values()].filter(g=>g.rank<=6).sort((a,b)=>a.rank-b.rank),finishing=[...level.groups.values()].filter(g=>g.rank>6);for(const group of structural){add(group,level);}if(structural.length){add({name:'Espera técnica e liberação',rank:8,durationKey:'releaseDays',elements:[]},level);}}
 // Finishes follow the structural cycle and release of all represented levels.
 for(const level of ordered)for(const group of level.groups.values())if(group.rank>6)add(group,level);
 function add(group,level){const wbs=`${prefix}.${++counter}`,duration=Number(settings[group.durationKey]),start=iso(cursor),finish=finishDate(start,duration,settings.workdays);const ids=group.elements.map(e=>e.globalId).filter(Boolean);const sources=[...new Set(group.elements.map(e=>e.classificationSource).filter(Boolean))];const rule=`${level.source}; ${sources.join(" / ")||group.name}; ordem inferior → superior; vínculo término–início`;
 rows.push({wbs,name:`${level.name} · ${group.name}`,start,finish,summary:false,milestone:false,direct_elements:group.elements.length,linked_elements:group.elements.length,measured_elements:0,measurement_coverage_percent:null,phases:[level.name],quantities:[],planned_percent:null,actual_percent:null,reported_percent:null,delta_percent:null,weight:null,duration_days:duration,predecessor:previous,evidence:'PREMISSA',rule,element_guids:ids,hold:group.rank===8});
 for(const e of group.elements)links.push({guid:e.globalId,express_id:e.id,...(e.sourceId?{source_id:e.sourceId,source_name:e.sourceName,element_key:e.key||`${e.sourceId}:${e.id}`} : {}),wbs,action:'Construir',phase:level.name,active_scope:true,source:inventory.name,evidence:'PREMISSA'});
 previous=wbs;cursor=working(nextDay(date(finish)),settings.workdays);}
 const active=links.length;
 return {...(inventory.federationId?{federation_id:inventory.federationId}:{}),schema_version:1,generated_at:new Date().toISOString(),status_date:settings.start,sources:{schedule:{file:inventory.name,format:'IFC_SUGESTAO',name:'Sequência executiva sugerida a partir do IFC',task_count:rows.length},links:{file:inventory.name,row_count:links.length},ifc_models:inventory.models||[{name:inventory.name,schema:inventory.schema||'IFC',elements_in_model:inventory.elements.length,geometry_processed:inventory.elements.length}]},integrity:{task_count:rows.length,link_count:links.length,active_element_count:inventory.elements.length-excluded.length,matched_active_elements:active,mapped_active_elements:active,wbs_match_percent:(inventory.elements.length-excluded.length)?active/(inventory.elements.length-excluded.length)*100:0,geometry_quantity_elements:0,geometry_quantity_coverage_percent:0,measured_elements:0,measurement_coverage_percent:0,weight_total:0,official_progress_ready:false,messages:[{level:'warning',code:'PREMISSA_IFC',title:'Sequência e durações sugeridas',detail:'Estrutura por pavimento; datas sem produtividade, frentes ou feriados comprovados. Confira lajes de piso/teto, método, cura e condições de liberação.'},{level:pending.length?'warning':'info',code:'ESCOPO_REVISAO',title:`${pending.length} elementos para revisar`,detail:'Elementos sem função ou pavimento identificados ficam fora do cronograma. Reveja a classificação antes da aprovação.'}]},progress:{planned_element_proxy_percent:null,actual_element_proxy_percent:null,official_planned_percent:null,official_actual_percent:null},wbs_rows:rows,elements:links,element_type_summary:[],sequence:{settings,model_signature:inventory.signature,pending,excluded,calendar:settings.workdays?'Segunda a sexta, sem feriados':'Dias corridos',method:'Ciclo estrutural sequencial por pavimento; acabamentos após estrutura; sem frentes paralelas',status:'PREMISSA'}};
}
export function editSequenceDate(bundle,wbs,start,finish){date(start);date(finish);if(start>finish)throw new Error('O término não pode ser anterior ao início.');const rows=bundle.wbs_rows.map(r=>r.wbs===wbs?{...r,start,finish,evidence:'INFORMADO'}:{...r});return {...bundle,generated_at:new Date().toISOString(),wbs_rows:rows};}
export function reschedule(bundle,wbs,start,finish,cascade=true){
 let next=editSequenceDate(bundle,wbs,start,finish),index=next.wbs_rows.findIndex(r=>r.wbs===wbs);
 const workdays=next.sequence?.settings?.workdays??true;
 if(index<0)return next;
 const following=next.wbs_rows[index+1];if(!cascade&&following?.start&&finish>=following.start)throw new Error('O término invade a atividade seguinte. Ative a reprogramação ou ajuste as sucessoras primeiro.');
 if(index===0&&next.sequence)next={...next,sequence:{...next.sequence,settings:{...next.sequence.settings,start}}};
 const predecessor=next.wbs_rows[index-1];if(predecessor?.finish&&start<=predecessor.finish)throw new Error('A atividade deve começar após o término da predecessora. Ajuste a predecessora primeiro.');
 let d=working(date(start),workdays),days=0;while(iso(d)<=finish){days++;d=working(nextDay(d),workdays);}next.wbs_rows[index].duration_days=Math.max(1,days);
 if(cascade){let cursor=working(nextDay(date(finish)),workdays);for(let i=index+1;i<next.wbs_rows.length;i++){const row=next.wbs_rows[i];row.start=iso(cursor);row.finish=finishDate(row.start,row.duration_days||1,workdays);cursor=working(nextDay(date(row.finish)),workdays);}}
 return next;
}
