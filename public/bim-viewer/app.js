import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import * as WebIFC from "web-ifc";
import {generateSequence} from "./sequence.js";
import {interpretElement} from "./metadata.js";
let modelMetadata = {};
let classificationIndex = new Map();
let lastInventory = null;

const CONTRACT_TOTAL = 0;
const PHASE_COSTS = {};
const PROJECT_START = parseDate(new Date().toISOString().slice(0,10));
const PROJECT_END = new Date(PROJECT_START.getTime() + 86400000);
const urlParams = new URLSearchParams(window.location.search);
const requestedModel = urlParams.get("model");
const planningMode = urlParams.get("mode") === "planning";
const bundleUrl = urlParams.get("bundle") || "/data/planejamento-ifc.json";
const initialDate = urlParams.get("date");
let externalStatusDate = initialDate;
let renderDirty = true;
let playback = null;
let simulationDate = null;
let metadataPasses = 0;
let geometryPasses = 0;
let lastCurveKey = "";
const DEFAULT_MODEL = requestedModel || "";
const DEFAULT_MODEL_NAME = DEFAULT_MODEL.split("/").pop() || "modelo.ifc";

const ui = Object.fromEntries([
  "canvas", "fileInput", "defaultBtn", "fitBtn", "colorMode", "modelName", "modelStatus",
  "loading", "loadingText", "linkQuality", "physicalValue", "costValue", "balanceValue",
  "linkedValue", "dateValue", "phaseValue", "timeline", "timeProgress", "playBtn", "endBtn",
  "costCurve", "selectionId", "properties", "notice", "timelineRange", "showFuture", "playDuration",
].map((id) => [id, document.getElementById(id)]));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf2ede5);
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100000);
camera.position.set(55, 42, 55);
const renderer = new THREE.WebGLRenderer({ canvas: ui.canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = false;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const controls = new OrbitControls(camera, ui.canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.addEventListener("change",()=>{renderDirty=true;});
controls.screenSpacePanning = true;
scene.add(new THREE.HemisphereLight(0xffffff, 0xccc5b8, 2.2));
const sun = new THREE.DirectionalLight(0xffffff, 2.5);
sun.position.set(45, 70, 35);
sun.castShadow = false;
scene.add(sun);
const grid = new THREE.GridHelper(240, 48, 0xc8c0b1, 0xe2dccf);
grid.material.transparent = true;
grid.material.opacity = 0.65;
scene.add(grid);

let ifcApi;
let modelID = null;
let modelGroup = new THREE.Group();
let elementMeshes = new Map();
let schedule = new Map();
let elementInfo = new Map();
let phaseCounts = new Map();
let planningByGuid = new Map();
let planningRows = new Map();
let actualByWbs = new Map();
let timelineDates = [];
let playTimer = null;
let selectedId = null;
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
scene.add(modelGroup);

const materials = {
  done: material(0x2f9b62),
  late: material(0xc34c47),
  due: material(0x2e504c),
  active: material(0xd99b18),
  preserve: material(0x9aa6b3),
  demolish: material(0x8d4bb7),
  neutral: material(0xaeb3a6),
  phaseStacker: material(0x2e504c),
  phaseIndustrial: material(0x2e504c),
  phasePatio: material(0x81877b),
};
materials.future = new THREE.MeshStandardMaterial({ color: 0xd6dde3, roughness: 0.9, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
materials.selected = new THREE.MeshStandardMaterial({
  color: 0xffc400,
  emissive: 0x5c3b00,
  emissiveIntensity: 0.95,
  roughness: 0.25,
  metalness: 0.02,
  side: THREE.DoubleSide,
});

function material(color) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0.02, side: THREE.DoubleSide });
}

function parseDate(value) {
  if (!value) return null;
  const text = String(value).slice(0, 10);
  const parts = text.split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function formatDate(date) {
  if (!date) return "SEM DATA";
  const months = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
  return `${String(date.getDate()).padStart(2, "0")} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function formatMoney(value) {
  if (!CONTRACT_TOTAL) return "A CONFIRMAR";
  return `R$ ${(value / 1_000_000).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} mi`;
}

function setLoading(show, text = "") {
  ui.loading.classList.toggle("show", show);
  if (text) ui.loadingText.textContent = text;
}

function resize() {
  const host = ui.canvas.parentElement;
  const width = Math.max(1, host.clientWidth);
  const height = Math.max(1, host.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderDirty=true;
}

function animate(time=performance.now()) {
  requestAnimationFrame(animate);
  if(playback && time-playback.lastUpdate>=80){
    const fraction=Math.min(1,playback.offset+(time-playback.startedAt)/playback.duration);
    const first=timelineDates[0].getTime(),last=timelineDates.at(-1).getTime();
    const cutoff=new Date(first+(last-first)*fraction);
    let index=0;while(index+1<timelineDates.length&&timelineDates[index+1]<=cutoff)index++;
    ui.timeline.value=String(index);applyTimeline(index,cutoff);ui.timeProgress.style.width=`${fraction*100}%`;
    const day=cutoff.toISOString().slice(0,10);if(day!==playback.lastDay){playback.lastDay=day;notifyParentDate(index,cutoff);}playback.lastUpdate=time;
    if(fraction>=1){ui.timeline.value=ui.timeline.max;stopPlayback();}
  }
  controls.update();
  if(renderDirty){renderer.render(scene,camera);renderDirty=false;}
}

function clearModel() {
  stopPlayback();
  renderDirty=true;
  modelGroup.traverse((object) => {
    if (object.geometry) object.geometry.dispose();
  });
  modelGroup.clear();
  elementMeshes = new Map();
  schedule = new Map();
  elementInfo = new Map();
  phaseCounts = new Map();
  timelineDates = [];
  selectedId = null;
  ui.properties.innerHTML = "<div><dt>Orientação</dt><dd>Clique em um elemento para consultar o vínculo, a atividade e o custo planejado atribuído.</dd></div>";
  ui.selectionId.textContent = "SEM SELEÇÃO";
  if (modelID !== null && ifcApi) {
    try { ifcApi.CloseModel(modelID); } catch { /* model already closed */ }
  }
  modelID = null;
}

function matrixFrom(values) {
  const matrix = new THREE.Matrix4();
  matrix.fromArray(Array.from(values));
  return matrix;
}

function buildGeometry(placedGeometry) {
  const ifcGeometry = ifcApi.GetGeometry(modelID, placedGeometry.geometryExpressID);
  const vertices = ifcApi.GetVertexArray(ifcGeometry.GetVertexData(), ifcGeometry.GetVertexDataSize());
  const indices = ifcApi.GetIndexArray(ifcGeometry.GetIndexData(), ifcGeometry.GetIndexDataSize());
  const positions = new Float32Array((vertices.length / 6) * 3);
  const normals = new Float32Array((vertices.length / 6) * 3);
  for (let source = 0, target = 0; source < vertices.length; source += 6, target += 3) {
    positions[target] = vertices[source];
    positions[target + 1] = vertices[source + 1];
    positions[target + 2] = vertices[source + 2];
    normals[target] = vertices[source + 3];
    normals[target + 1] = vertices[source + 4];
    normals[target + 2] = vertices[source + 5];
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
  geometry.applyMatrix4(matrixFrom(placedGeometry.flatTransformation));
  geometry.computeBoundingSphere();
  return geometry;
}

function streamGeometry() {
  ui.canvas.dataset.geometryPasses=String(++geometryPasses);
  ui.canvas.dataset.generation=String(performance.now());
  return new Promise((resolve, reject) => {
    try {
      ifcApi.StreamAllMeshes(modelID, (flatMesh) => {
        const expressID = Number(flatMesh.expressID);
        const fragments = [];
        for (let i = 0; i < flatMesh.geometries.size(); i += 1) {
          const placedGeometry = flatMesh.geometries.get(i);
          const mesh = new THREE.Mesh(buildGeometry(placedGeometry), materials.neutral);
          mesh.userData.expressID = expressID;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          modelGroup.add(mesh);
          fragments.push(mesh);
        }
        if (fragments.length) elementMeshes.set(expressID, fragments);
      });
      resolve();
    } catch (error) { reject(error); }
  });
}

function unwrap(value) {
  if (value == null) return "";
  if (typeof value !== "object") return String(value);
  if ("value" in value) return unwrap(value.value);
  if ("wrappedValue" in value) return unwrap(value.wrappedValue);
  if ("valueComponent" in value) return unwrap(value.valueComponent);
  return "";
}

function getPsetProperties(pset) {
  const output = {};
  const list = pset?.HasProperties || pset?.hasProperties || [];
  for (const prop of list) {
    const name = unwrap(prop?.Name || prop?.name);
    if (!name) continue;
    output[name] = unwrap(prop?.NominalValue ?? prop?.nominalValue ?? prop?.Value ?? prop?.value);
  }
  return output;
}

function normalizePhase(value) {
  const text = String(value || "").toLowerCase().replaceAll(" ", "");
  if (text.includes("stacker")) return "Stacker";
  if (text.includes("moega")) return "Moegas";
  if (text.includes("patio") || text.includes("pátio")) return "Pátios";
  if (text.includes("transport")) return "Transportadores";
  if (text.includes("aterr")) return "Aterramento";
  if (text.includes("prepar")) return "Preparação";
  return "Sem fase";
}

function normalizeAction(value) {
  const text = String(value || "Construir").toLowerCase();
  if (text.includes("preserv") || text.includes("manter")) return "Preservar";
  if (text.includes("demol") || text.includes("remov")) return "Demolir";
  return "Construir";
}

function actualFor(info, cutoff = null) {
  const record = info?.wbs ? actualByWbs.get(info.wbs) : null;
  if (record && typeof record === "object") {
    const measuredAt = parseDate(record.statusDate);
    if (cutoff && measuredAt && cutoff < measuredAt) return null;
    const value = Number(record.actualPercent);
    return Number.isFinite(value) ? value : null;
  }
  const value = record ?? info?.actualPercent ?? null;
  return value === null || !Number.isFinite(Number(value)) ? null : Number(value);
}

async function loadPlanningBundle() {
  if (!planningMode) return;
  const response = await fetch(bundleUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`Pacote de planejamento HTTP ${response.status}`);
  const bundle = await response.json();
  planningRows = new Map((bundle.wbs_rows || []).map((row) => [row.wbs, row]));
  planningByGuid = new Map((bundle.elements || []).filter((element) => element.guid).map((element) => [element.guid, element]));
  for (const row of bundle.wbs_rows || []) {
    if (row.actual_percent !== null && row.actual_percent !== undefined) actualByWbs.set(row.wbs, { actualPercent: Number(row.actual_percent), statusDate: bundle.status_date });
  }
}

function spatialAssignments() {
  const parent = new Map(),storeys=new Map();
  function lines(code,read) {try {const ids=ifcApi.GetLineIDsWithType(modelID,code);for(let i=0;i<ids.size();i++){try{read(ifcApi.GetLine(modelID,ids.get(i),false));}catch{}}}catch{}}
  const id=ref=>Number(ref?.value ?? ref);
  lines(WebIFC.IFCBUILDINGSTOREY,row=>storeys.set(row.expressID,{storeyId:row.expressID,storeyName:unwrap(row.Name),elevation:row.Elevation!=null?Number(unwrap(row.Elevation)):undefined}));
  lines(WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE,row=>{for(const ref of row.RelatedElements || [])parent.set(id(ref),id(row.RelatingStructure));});
  lines(WebIFC.IFCRELVOIDSELEMENT,row=>parent.set(id(row.RelatedOpeningElement),id(row.RelatingBuildingElement)));
  lines(WebIFC.IFCRELAGGREGATES,row=>{for(const ref of row.RelatedObjects || [])if(!parent.has(id(ref)))parent.set(id(ref),id(row.RelatingObject));});
  return product=>{let current=product;const seen=new Set();while(current&&!seen.has(current)){if(storeys.has(current))return storeys.get(current);seen.add(current);current=parent.get(current);}return {};};
}
function publishInventory(fileName) {
  const elements=[...elementInfo.values()].map(e=>({id:e.id,globalId:e.globalId,type:e.type,name:e.name,description:e.description,objectType:e.objectType,tag:e.tag,predefinedType:e.predefinedType,storeyId:e.storeyId,storeyName:e.storeyName,elevation:e.elevation,levelIndex:e.levelIndex,levelSource:e.levelSource,loadBearing:e.loadBearing,propertySets:e.propertySets,typeProperties:e.typeProperties,materialProperties:e.materialProperties,classificationProperties:e.classificationProperties,hasGeometry:e.hasGeometry,code:e.code,structuralKind:e.structuralKind,classificationSource:e.classificationSource}));
  let hash=2166136261;for(const ch of elements.map(e=>e.globalId||e.id).sort().join('|'))hash=Math.imul(hash^ch.charCodeAt(0),16777619);
  lastInventory={...modelMetadata,name:fileName,signature:`${fileName}:${elements.length}:${hash>>>0}`,elements};
  window.parent.postMessage({type:'v2m-ifc-inventory',inventory:lastInventory},window.location.origin);
  const suggestion=generateSequence(lastInventory);
  const box=document.getElementById('sequenceSummary');
  if(box)box.textContent=`${elements.length} objetos IFC · ${elements.filter(e=>e.structuralKind).length} com função estrutural reconhecida · ${suggestion.wbs_rows.length} atividades sugeridas · ${suggestion.sequence.pending.length} para revisar.`;
}
async function applyBundle(bundle) {
  stopPlayback();
  planningRows=new Map((bundle.wbs_rows||[]).map(r=>[r.wbs,r]));
  planningByGuid=new Map((bundle.elements||[]).map(e=>[e.guid,e]));
  schedule.clear();
  for(const info of elementInfo.values()) {const link=planningByGuid.get(info.globalId);const row=link?planningRows.get(link.wbs):null;info.action=link?.action||'Construir';info.wbs=row?.wbs||'';info.activity=row?.name||'Sem atividade vinculada';info.phase=link?.phase||'Geral';info.start=row?parseDate(row.start):null;info.finish=row?parseDate(row.finish):null;info.actualPercent=row?.actual_percent??null;if(row&&info.start&&info.finish)schedule.set(info.id,info);}
  createTimeline();ui.linkedValue.textContent=String(schedule.size);ui.modelStatus.textContent=`${elementMeshes.size} elementos geométricos · ${schedule.size} vínculos de planejamento`;ui.linkQuality.textContent='SEQUÊNCIA SUGERIDA · PREMISSA';ui.playBtn.disabled=!schedule.size;ui.endBtn.disabled=!schedule.size;applyTimeline(0);
}
async function readMetadata() {
  ui.canvas.dataset.metadataPasses=String(++metadataPasses);
  const ids = [...elementMeshes.keys()];
  const seenIds = new Set(ids);
  try {for(const type of ifcApi.GetAllTypesOfModel(modelID)){if(!ifcApi.IsIfcElement(type.typeID)||["IFCBUILDING","IFCBUILDINGSTOREY","IFCSITE","IFCSPACE","IFCPROJECT"].includes(String(type.typeName||ifcApi.GetNameFromTypeCode(type.typeID)).toUpperCase()))continue;const found=ifcApi.GetLineIDsWithType(modelID,type.typeID);for(let n=0;n<found.size();n++)if(!seenIds.has(found.get(n))){seenIds.add(found.get(n));ids.push(found.get(n));}}}catch{}
  modelMetadata={schema:ifcApi.GetModelSchema(modelID),geometryElements:elementMeshes.size,semanticElements:ids.length,revision:ui.modelName.textContent.match(/(?:^|[-_])(R\d+)(?:[._-]|$)/i)?.[1]||'A_CONFIRMAR'};
  modelMetadata.storeys=[];
  try {const levels=ifcApi.GetLineIDsWithType(modelID,WebIFC.IFCBUILDINGSTOREY);for(let n=0;n<levels.size();n++){const id=levels.get(n);modelMetadata.storeys.push({attributes:ifcApi.GetLine(modelID,id,false),propertySets:await ifcApi.properties.getPropertySets(modelID,id,true)});}}catch{}
  classificationIndex=new Map();
  try {const rels=ifcApi.GetLineIDsWithType(modelID,WebIFC.IFCRELASSOCIATESCLASSIFICATION);for(let n=0;n<rels.size();n++){const rel=ifcApi.GetLine(modelID,rels.get(n),false);const classification=ifcApi.GetLine(modelID,rel.RelatingClassification.value,true);for(const ref of rel.RelatedObjects||[]){if(!classificationIndex.has(ref.value))classificationIndex.set(ref.value,[]);classificationIndex.get(ref.value).push(classification);}}}catch{}
  try {const units=ifcApi.GetLineIDsWithType(modelID,WebIFC.IFCUNITASSIGNMENT);modelMetadata.units=[];for(let n=0;n<units.size();n++)modelMetadata.units.push(ifcApi.GetLine(modelID,units.get(n),true));}catch{}
  const spatial = spatialAssignments();
  let linked = 0;
  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index];
    if (index % 80 === 0) setLoading(true, `Lendo propriedades 4D e 5D: ${index.toLocaleString("pt-BR")} de ${ids.length.toLocaleString("pt-BR")} elementos.`);
    let line = {};
    let psets = [];
    try {
      line = await Promise.resolve(ifcApi.GetLine(modelID, id, true));
      if (ifcApi.properties?.getPropertySets) {
        const direct=await ifcApi.properties.getPropertySets(modelID,id,true);
        const inherited=await ifcApi.properties.getPropertySets(modelID,id,true,true).catch(()=>[]);
        psets=[...direct,...inherited];
      } else if (ifcApi.GetPropertySets) {
        psets = await Promise.resolve(ifcApi.GetPropertySets(modelID, id, true));
      }
    } catch { /* some non-product entities do not expose property sets */ }
    const pset = Array.from(psets || []).find((item) => unwrap(item?.Name || item?.name) === "Pset_4D_Planning");
    const props = getPsetProperties(pset);
    const typeCode = (() => { try { return ifcApi.GetLineType(modelID, id); } catch { return 0; } })();
    const typeName = (() => { try { return ifcApi.GetNameFromTypeCode(typeCode) || "IFC ELEMENT"; } catch { return "IFC ELEMENT"; } })();
    const propertySets=Array.from(psets||[]).map(p=>({id:p.expressID,name:unwrap(p.Name),ifcType:ifcApi.GetNameFromTypeCode(p.type),properties:(p.HasProperties||p.Quantities||[]).map(prop=>({id:prop.expressID,name:unwrap(prop.Name),description:unwrap(prop.Description),ifcType:ifcApi.GetNameFromTypeCode(prop.type),value:unwrap(prop.NominalValue??prop.EnumerationValues??prop.ListValues??prop.LengthValue??prop.AreaValue??prop.VolumeValue??prop.WeightValue??prop.CountValue),valueType:prop.NominalValue?.name||prop.NominalValue?.type,unit:prop.Unit||null,raw:prop}))}));
    const commonProps=Object.assign({},...Array.from(psets||[]).map(getPsetProperties));
    let typeProperties=[],materialProperties=[];
    try {typeProperties=await ifcApi.properties.getTypeProperties(modelID,id,true);}catch{}
    try {materialProperties=[...await ifcApi.properties.getMaterialsProperties(modelID,id,true),...await ifcApi.properties.getMaterialsProperties(modelID,id,true,true).catch(()=>[])];}catch{}
    const info = {
      ...spatial(id),
      classificationProperties:classificationIndex.get(id)||[],
      description:unwrap(line.Description),objectType:unwrap(line.ObjectType),tag:unwrap(line.Tag),predefinedType:unwrap(line.PredefinedType),propertySets,typeProperties,materialProperties,hasGeometry:elementMeshes.has(id),
      loadBearing: String(commonProps.LoadBearing).toLowerCase()==="true" || commonProps.LoadBearing===1,
      id,
      type: typeName,
      name: unwrap(line?.Name) || unwrap(line?.ObjectType) || `${typeName} ${id}`,
      globalId: unwrap(line?.GlobalId),
      activity: props.ActivityName || props.TaskName || "Sem atividade vinculada",
      task: props.TaskName || "",
      wbs: props.WBS || "",
      phase: normalizePhase(props.Phase4D),
      start: parseDate(props.StartDate),
      finish: parseDate(props.FinishDate),
      action: normalizeAction(props.Action4D),
      confidence: props.LinkConfidence || "",
    };
    const plannedElement = planningByGuid.get(info.globalId) || (info.wbs && planningRows.has(info.wbs) ? {wbs:info.wbs,active_scope:true} : null);
    const plannedRow = plannedElement?.wbs ? planningRows.get(plannedElement.wbs) : null;
    if (planningMode && plannedElement) {
      info.wbs = plannedElement.wbs || "";
      info.phase = plannedElement.phase || info.phase;
      info.action = normalizeAction(plannedElement.action);
      info.confidence = plannedElement.confidence || info.confidence;
      info.activity = plannedRow?.name || plannedElement.name || info.activity;
      info.task = plannedRow?.name || info.task;
      info.start = parseDate(plannedRow?.start);
      info.finish = parseDate(plannedRow?.finish);
      info.actualPercent = plannedRow?.actual_percent ?? plannedElement.actual_percent ?? null;
      info.activeScope = Boolean(plannedElement.active_scope);
    }
    Object.assign(info,interpretElement(info));
    elementInfo.set(id, info);
    if ((pset || plannedElement) && info.start && info.finish && info.action !== "Preservar") {
      schedule.set(id, info);
      if (info.action === "Construir") phaseCounts.set(info.phase, (phaseCounts.get(info.phase) || 0) + 1);
      linked += 1;
    }
    if (index % 80 === 0) await new Promise(requestAnimationFrame);
  }
  for (const info of schedule.values()) {
    const count = phaseCounts.get(info.phase) || 1;
    info.cost = info.action === "Construir" ? (PHASE_COSTS[info.phase] || 0) / count : 0;
  }
  return linked;
}

function createTimeline() {
  const dates = new Set();
  if(planningMode){for(const row of planningRows.values()){const start=parseDate(row.start),finish=parseDate(row.finish);if(start)dates.add(start.getTime());if(finish)dates.add(finish.getTime());}const status=parseDate(externalStatusDate);if(status)dates.add(status.getTime());}
  for (const info of schedule.values()) {
    if (info.start) dates.add(info.start.getTime());
    if (info.finish) dates.add(info.finish.getTime());
  }
  if (!dates.size) {
    dates.add(PROJECT_START.getTime());
    dates.add(PROJECT_END.getTime());
  }
  timelineDates = [...dates].sort((a, b) => a - b).map((time) => new Date(time));
  if (timelineDates.length < 3) {
    timelineDates = [];
    for (let i = 0; i <= 40; i += 1) timelineDates.push(new Date(PROJECT_START.getTime() + ((PROJECT_END - PROJECT_START) * i) / 40));
  }
  ui.timeline.min = "0";
  ui.timeline.max = String(timelineDates.length - 1);
  ui.timeline.value = "0";
  ui.timelineRange.textContent = `${formatDate(timelineDates[0])} — ${formatDate(timelineDates[timelineDates.length - 1])}`;
}

function phaseMaterial(phase) {
  if (phase === "Stacker") return materials.phaseStacker;
  if (phase === "Moegas" || phase === "Transportadores") return materials.phaseIndustrial;
  if (phase === "Pátios" || phase === "Aterramento") return materials.phasePatio;
  return materials.neutral;
}

const typePalette = {
  foundation: material(0xcbb99b),
  column: material(0x244b43),
  beam: material(0x52786a),
  slab: material(0xa8bba3),
  stair: material(0xb5ad91),
  other: material(0x87968b),
};
const typeActive = Object.fromEntries(Object.entries(typePalette).map(([key,base])=>{const active=base.clone();active.emissive=new THREE.Color(0xc9bc90);active.emissiveIntensity=0.28;return [key,active];}));
const typeFuture = Object.fromEntries(Object.entries(typePalette).map(([key,base])=>{const future=base.clone();future.transparent=true;future.opacity=0.16;future.depthWrite=false;return [key,future];}));
function typeKey(info) {
  const kind=info?.structuralKind,type=String(info?.type||'').toUpperCase();
  if(kind==='Fundações'||kind==='Estacas'||type.includes('FOOTING')||type.includes('PILE'))return 'foundation';
  if(kind==='Pilares'||type.includes('COLUMN'))return 'column';
  if(kind==='Vigas'||type.includes('BEAM'))return 'beam';
  if(kind==='Lajes'||type.includes('SLAB'))return 'slab';
  if(kind==='Escadas'||kind==='Rampas'||type.includes('STAIR')||type.includes('RAMP'))return 'stair';
  return 'other';
}
function typeMaterial(info,state='normal') {
  const key=typeKey(info);
  return state==='active'?typeActive[key]:state==='future'?typeFuture[key]:typePalette[key];
}

function stateAt(info, cutoff) {
  if (info?.action === "Preservar") return "preserve";
  if (!info?.start || !info?.finish) return info?.action === "Demolir" ? "demolish" : "unlinked";
  if (info.action === "Demolir") return cutoff >= info.finish ? "removed" : "demolish";
  const actual = actualFor(info, cutoff);
  if (actual !== null && actual >= 100) return "done";
  if (actual !== null && cutoff >= info.finish && actual < 100) return "late";
  if (actual !== null && actual > 0) return "done";
  if (cutoff < info.start) return "future";
  if (cutoff < info.finish) return "active";
  return "due";
}

function costAt(cutoff) {
  let cost = 0;
  let measured = 0;
  let actualTotal = 0;
  for (const info of schedule.values()) {
    if (info.action !== "Construir") continue;
    const actual = actualFor(info, cutoff);
    if (actual !== null && Number.isFinite(Number(actual))) {
      measured += 1;
      actualTotal += Number(actual);
    }
    if (cutoff >= info.finish) {
      cost += info.cost || 0;
    } else if (cutoff > info.start) {
      const duration = Math.max(1, info.finish - info.start);
      const progress = Math.min(1, Math.max(0, (cutoff - info.start) / duration));
      cost += (info.cost || 0) * progress;
    }
  }
  return { cost, measured, actualTotal };
}

function currentPhase(cutoff) {
  const active=[...planningRows.values()].find(row=>row.start&&row.finish&&cutoff>=parseDate(row.start)&&cutoff<=parseDate(row.finish));
  return active?.name || (cutoff<timelineDates[0]?'A INICIAR':'ENTRE ATIVIDADES / CONCLUÍDO');
}

function applyTimeline(index = Number(ui.timeline.value), forcedDate = null) {
  if (!timelineDates.length) return;
  const began=performance.now();
  const cutoff = forcedDate || timelineDates[Math.max(0, Math.min(index, timelineDates.length - 1))];
  simulationDate=cutoff;
  const mode = ui.colorMode.value;
  for (const [id, meshes] of elementMeshes) {
    const info = schedule.get(id) || elementInfo.get(id);
    const state = stateAt(info, cutoff);
    for (const mesh of meshes) {
      const visible=state!=="removed" && (state!=="future" || ui.showFuture?.checked);
      if(mesh.visible!==Boolean(visible)){mesh.visible=Boolean(visible);renderDirty=true;}
      if (!mesh.visible) continue;
      const oldMaterial=mesh.material;
      if (mode === "phase") mesh.material = phaseMaterial(info?.phase);
      else if (mode === "type") mesh.material = typeMaterial(info);
      else if(mode === "construction") mesh.material=typeMaterial(info,state);
      else if (state === "active") mesh.material = materials.active;
      else if (state === "done") mesh.material = materials.done;
      else if (state === "late") mesh.material = materials.late;
      else if (state === "due") mesh.material = materials.due;
      else if (state === "preserve") mesh.material = materials.preserve;
      else if (state === "demolish") mesh.material = materials.demolish;
      else if (state === "future") mesh.material = materials.future;
      else mesh.material = materials.neutral;
      if(oldMaterial!==mesh.material)renderDirty=true;
    }
  }
  applySelectionHighlight();
  const { cost, measured, actualTotal } = costAt(cutoff);
  const physical = measured ? actualTotal / measured : null;
  ui.dateValue.textContent = formatDate(cutoff);
  ui.phaseValue.textContent = currentPhase(cutoff);
  ui.physicalValue.textContent = physical === null ? "—" : `${physical.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  ui.costValue.textContent = formatMoney(cost);
  ui.balanceValue.textContent = formatMoney(Math.max(0, CONTRACT_TOTAL - cost));
  ui.timeProgress.style.width = `${(index / Math.max(1, timelineDates.length - 1)) * 100}%`;
  const curveKey=`${index}:${ui.costCurve.clientWidth}:${ui.costCurve.clientHeight}`;if(curveKey!==lastCurveKey){drawCostCurve(index);lastCurveKey=curveKey;}
  ui.canvas.dataset.timelineApplyMs=(performance.now()-began).toFixed(2);
  ui.canvas.dataset.simulationDate=cutoff.toISOString();
}

function applyExternalDate(value) {
  const cutoff = parseDate(value);
  if (!cutoff || !timelineDates.length) return;
  let nearestIndex = 0;
  let nearestDistance = Infinity;
  timelineDates.forEach((date, index) => {
    const distance = Math.abs(date - cutoff);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });
  ui.timeline.value = String(nearestIndex);
  applyTimeline(nearestIndex, cutoff);
}

function applySelectionHighlight() {
  if (selectedId === null) return;
  const meshes = elementMeshes.get(selectedId) || [];
  for (const mesh of meshes) {
    if (!mesh.visible) continue;
    mesh.material = materials.selected;
    renderDirty=true;
  }
}

function drawCostCurve(currentIndex) {
  const canvas = ui.costCurve;
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(rect.width * ratio));
  canvas.height = Math.max(1, Math.round(rect.height * ratio));
  const ctx = canvas.getContext("2d");
  ctx.scale(ratio, ratio);
  const width = rect.width;
  const height = rect.height;
  const pad = 10;
  ctx.clearRect(0, 0, width, height);
  if (!CONTRACT_TOTAL) {
    ctx.fillStyle = "#6b716b";
    ctx.font = "600 10px sans-serif";
    ctx.fillText("CUSTO A CONFIRMAR", pad, Math.max(16, height / 2));
    return;
  }
  ctx.strokeStyle = "#ddd7cb";
  ctx.lineWidth = 1;
  for (let i = 1; i <= 3; i += 1) {
    const y = pad + ((height - pad * 2) * i) / 4;
    ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(width - pad, y); ctx.stroke();
  }
  const data = timelineDates.map((date) => costAt(date).cost);
  ctx.strokeStyle = "#2e504c";
  ctx.lineWidth = 2;
  ctx.beginPath();
  data.forEach((value, index) => {
    const x = pad + (index / Math.max(1, data.length - 1)) * (width - pad * 2);
    const y = height - pad - (value / CONTRACT_TOTAL) * (height - pad * 2);
    if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();
  const dotValue = data[currentIndex] || 0;
  const dotX = pad + (currentIndex / Math.max(1, data.length - 1)) * (width - pad * 2);
  const dotY = height - pad - (dotValue / CONTRACT_TOTAL) * (height - pad * 2);
  ctx.fillStyle = "#2e504c";
  ctx.beginPath(); ctx.arc(dotX, dotY, 3.5, 0, Math.PI * 2); ctx.fill();
}

function fitModel() {
  const box = new THREE.Box3().setFromObject(modelGroup);
  if (box.isEmpty()) return;
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const max = Math.max(size.x, size.y, size.z);
  const distance = max / (2 * Math.tan((camera.fov * Math.PI) / 360));
  camera.position.set(center.x + distance * 0.7, center.y + distance * 0.48, center.z + distance * 0.72);
  camera.near = Math.max(0.05, distance / 1000);
  camera.far = distance * 20;
  camera.updateProjectionMatrix();
  controls.target.copy(center);
  controls.update();
  grid.position.y = box.min.y - 0.02;
}

function renderProperties(id) {
  const info = elementInfo.get(id) || { id, type: "IFC ELEMENT", name: `Elemento ${id}` };
  const actual = actualFor(info);
  ui.selectionId.textContent = `ID ${id}`;
  const fields = [
    ["Classe IFC", info.type], ["Elemento", info.name], ["GlobalId", info.globalId],
    ["Código",info.code],["Função",info.structuralKind],["Fonte da função",info.classificationSource],["Pavimento",info.storeyName],["Fonte do pavimento",info.levelSource],["Material TQS",info.material],
    ["Fase", info.phase], ["WBS", info.wbs], ["Atividade", info.activity],
    ["Início", info.start ? formatDate(info.start) : "Sem vínculo"],
    ["Término", info.finish ? formatDate(info.finish) : "Sem vínculo"],
    ["Avanço real", actual === null ? "Sem medição" : `${Number(actual).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`],
    ["Ação 4D", info.action], ["Custo alocado", info.cost ? formatMoney(info.cost) : "Não atribuído"],
  ];
  for(const ps of info.propertySets||[])for(const property of ps.properties||[])fields.push([`${ps.name}.${property.name}`,property.value]);
  const visibleFields=fields.filter(([,value])=>value!==null&&value!==undefined&&value!=='');
  ui.properties.innerHTML = visibleFields.map(([key, value]) => `<div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("");
  if (window.parent !== window) {
    window.parent.postMessage({ type: "v2m-ifc-element-selected", element: {
      id, globalId: info.globalId || "", type: info.type || "IFC ELEMENT", name: info.name || `Elemento ${id}`,
      phase: info.phase || "", activity: info.activity || "", wbs: info.wbs || "",
      startDate: info.start ? info.start.toISOString().slice(0, 10) : "",
      finishDate: info.finish ? info.finish.toISOString().slice(0, 10) : "",
    } }, window.location.origin);
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

async function loadBytes(bytes, fileName) {
  setLoading(true, "Abrindo a geometria IFC no navegador.");
  clearModel();
  ui.modelName.textContent = fileName;
  try {
    modelID = ifcApi.OpenModel(bytes, { COORDINATE_TO_ORIGIN: true, USE_FAST_BOOLS: true });
    setLoading(true, "Construindo a geometria tridimensional.");
    await streamGeometry();
    fitModel();
    const linked = await readMetadata();
    ui.playBtn.disabled = !linked; ui.endBtn.disabled = !linked;
    createTimeline();
    ui.linkedValue.textContent = linked.toLocaleString("pt-BR");
    ui.linkQuality.textContent = linked ? (planningMode ? "EAP PRELIMINAR + GUID IFC" : "PSET 4D PREPARADO") : "SEM VÍNCULO 4D";
    ui.modelStatus.textContent = `${elementMeshes.size.toLocaleString("pt-BR")} elementos geométricos · ${linked.toLocaleString("pt-BR")} vínculos de planejamento`;
    ui.notice.textContent = linked
      ? (planningMode ? "As cores usam os vínculos do cronograma por GUID. Confira as datas, os pesos e as associações antes de medir o avanço." : "Vínculo lido do Pset_4D_Planning. O custo 5D permanece a confirmar porque a planilha recebida não contém preços.")
      : "Nenhum vínculo com datas foi identificado. O modelo permanece disponível para inspeção geométrica e de propriedades.";
    ui.notice.classList.remove("error");
    if (externalStatusDate) applyExternalDate(externalStatusDate); else applyTimeline(0);
    if (!linked) { ui.dateValue.textContent = "—"; ui.phaseValue.textContent = "SEM VÍNCULO"; ui.timelineRange.textContent = "CRONOGRAMA A VINCULAR"; }
    setLoading(false);
    publishInventory(fileName);
  } catch (error) {
    console.error(error);
    setLoading(false);
    ui.modelStatus.textContent = "Falha ao processar o modelo";
    ui.notice.textContent = `Não foi possível abrir ${fileName}. Verifique se o arquivo está no formato IFC. ${error?.message || ""}`;
    ui.notice.classList.add("error");
  }
}

async function loadUrl(url, name) {
  setLoading(true, "Baixando o modelo estrutural integrado ao planejamento.");
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    await loadBytes(bytes, name);
  } catch (error) {
    setLoading(false);
    ui.notice.textContent = `Não foi possível carregar o modelo padrão. ${error?.message || ""}`;
    ui.notice.classList.add("error");
  }
}

function stopPlayback() {
  playback=null;
  if(ui.playBtn)ui.playBtn.textContent='REPRODUZIR';
}
function togglePlayback() {
  if(playback){stopPlayback();return;}
  if(!timelineDates.length||!schedule.size)return;
  if(Number(ui.timeline.value)>=Number(ui.timeline.max)){ui.timeline.value='0';simulationDate=null;}
  const first=timelineDates[0].getTime(),last=timelineDates.at(-1).getTime();
  const offset=simulationDate?Math.max(0,Math.min(1,(simulationDate.getTime()-first)/Math.max(1,last-first))):0;
  playback={startedAt:performance.now(),duration:Math.max(10,Number(ui.playDuration?.value)||30)*1000,offset,lastUpdate:0,lastDay:''};
  ui.playBtn.textContent='PAUSAR';
}
function notifyParentDate(index=Number(ui.timeline.value),dateOverride=null) {
  const date=dateOverride||timelineDates[index];if(!date||window.parent===window)return;
  window.parent.postMessage({type:'v2m-planning-date-change',date:date.toISOString().slice(0,10)},window.location.origin);
}

ui.timeline.addEventListener("input", () => { stopPlayback(); applyTimeline(); notifyParentDate(); });
ui.playBtn.addEventListener("click", togglePlayback);
ui.endBtn.addEventListener("click", () => { stopPlayback(); ui.timeline.value = ui.timeline.max; applyTimeline(Number(ui.timeline.max)); notifyParentDate(Number(ui.timeline.max)); });
ui.fitBtn.addEventListener("click", fitModel);
ui.defaultBtn.addEventListener("click", () => ui.fileInput.click());
ui.colorMode.addEventListener("change", () => applyTimeline(Number(ui.timeline.value),simulationDate));
ui.showFuture?.addEventListener("change",()=>applyTimeline(Number(ui.timeline.value),simulationDate));
ui.fileInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const bytes = new Uint8Array(await file.arrayBuffer());
  await loadBytes(bytes, file.name);
  if (modelID !== null && elementMeshes.size) {try {await localModel({bytes,name:file.name});sessionStorage.setItem("v2m-ifc-loaded","1");}catch{ui.notice.textContent += " O modelo não pôde ser mantido entre módulos neste navegador.";}}
  event.target.value = "";
});

ui.canvas.addEventListener("pointerdown", (event) => {
  const rect = ui.canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(modelGroup.children, true).find((item) => item.object.visible);
  if (!hit) return;
  selectedId = hit.object.userData.expressID;
  applyTimeline(Number(ui.timeline.value));
  renderProperties(selectedId);
  renderer.render(scene, camera);
});

window.addEventListener("resize", () => { resize(); if (timelineDates.length) drawCostCurve(Number(ui.timeline.value)); });
window.addEventListener("message", (event) => {
  if(event.origin===window.location.origin&&event.data?.type==="v2m-request-inventory"){if(lastInventory)window.parent.postMessage({type:"v2m-ifc-inventory",inventory:lastInventory},window.location.origin);return;}
  if(event.origin===window.location.origin&&event.data?.type==="v2m-sequence-bundle"){void applyBundle(event.data.bundle);return;}
  if (event.origin === window.location.origin && event.data?.type === "v2m-open-ifc") {ui.fileInput.click();return;}
  if (event.origin !== window.location.origin || event.data?.type !== "v2m-planning-update") return;
  actualByWbs = new Map(Object.entries(event.data.measurements || {}));
  if (event.data.date) {externalStatusDate=event.data.date;if(!playback)applyExternalDate(event.data.date);}
  else applyTimeline();
  if (selectedId !== null) renderProperties(selectedId);
});

async function localModel(value) {
  const db = await new Promise((resolve,reject) => {const r=indexedDB.open("v2m-ifc",1);r.onupgradeneeded=()=>r.result.createObjectStore("models");r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  try { return await new Promise((resolve,reject)=>{const tx=db.transaction("models",value?"readwrite":"readonly");const store=tx.objectStore("models");const r=value?store.put(value,"current"):store.get("current");tx.oncomplete=()=>resolve(value || r.result);tx.onerror=()=>reject(tx.error);}); } finally {db.close();}
}
async function init() {
  resize();
  animate();
  try {
    if (planningMode) {
      try { await loadPlanningBundle(); }
      catch (error) { console.warn("Pacote de planejamento indisponível", error); }
    }
    ifcApi = new WebIFC.IfcAPI();
    ifcApi.SetWasmPath("https://unpkg.com/web-ifc@0.0.77/", true);
    await ifcApi.Init(undefined, true);
    const cached = sessionStorage.getItem("v2m-ifc-loaded") ? await localModel().catch(()=>null) : null;
    if (cached) await loadBytes(cached.bytes,cached.name); else if (DEFAULT_MODEL) await loadUrl(DEFAULT_MODEL, DEFAULT_MODEL_NAME); else { setLoading(false); ui.modelName.textContent = "Nenhum IFC carregado"; ui.modelStatus.textContent = "Selecione ABRIR IFC para começar"; ui.linkQuality.textContent = "SEM VÍNCULO"; ui.dateValue.textContent = "—"; ui.phaseValue.textContent = "SEM CRONOGRAMA"; ui.timelineRange.textContent = "A IMPORTAR"; ui.costValue.textContent = "A CONFIRMAR"; ui.playBtn.disabled = true; ui.endBtn.disabled = true; }
  } catch (error) {
    console.error(error);
    setLoading(false);
    ui.notice.textContent = `Falha ao inicializar o motor IFC. ${error?.message || ""}`;
    ui.notice.classList.add("error");
  }
}

init();
