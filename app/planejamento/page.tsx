"use client";

import {generateSequence,defaultSequenceOptions,reschedule,finishDate,type Inventory} from "../../public/bim-viewer/sequence.js";
import { ChangeEvent, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

type Quantity = {
  kind: "volume" | "area" | "length" | "weight" | "count";
  unit: string;
  value: number;
  source: string;
  element_count: number;
};

type WbsRow = {
  wbs: string;
  outline_level?: number;
  outline_number?: string;
  name: string;
  start: string | null;
  finish: string | null;
  actual_start?: string | null;
  actual_finish?: string | null;
  summary: boolean;
  milestone: boolean;
  critical?: boolean;
  direct_elements: number;
  linked_elements: number;
  measured_elements: number;
  measurement_coverage_percent: number | null;
  phases: string[];
  quantities: Quantity[];
  planned_percent: number | null;
  actual_percent: number | null;
  reported_percent: number | null;
  delta_percent: number | null;
  weight: number | null;
  duration_days?: number;
  predecessor?: string;
  evidence?: string;
  rule?: string;
};

type IntegrityMessage = {
  level: "critical" | "warning" | "info";
  code: string;
  title: string;
  detail: string;
};

type PlanningMeasurement = {
  wbs: string;
  actualPercent: number;
  statusDate: string;
  notes: string;
  source: "manual" | "csv";
  updatedAt?: string;
};

type ViewerElement = {
  id: number;
  globalId: string;
  type: string;
  name: string;
  phase: string;
  activity: string;
  wbs: string;
};

type PlanningBundle = {
  federation_id?:string;
  sequence?: {settings:typeof defaultSequenceOptions;model_signature:string;pending:Array<{id:number;name:string;type:string;globalId:string;reason:string}>;excluded?:Array<{id:number;name:string;reason:string}>;calendar:string;method:string;status:string};
  schema_version: number;
  generated_at: string;
  status_date: string;
  sources: {
    schedule: { file: string; format: string; name: string; task_count: number };
    schedule_comparison?: {
      file: string;
      format: string;
      task_count: number;
      wbs_match_percent: number;
      orphan_wbs: string[];
    } | null;
    links: { file: string; row_count: number };
    ifc_models: Array<{
      name: string;
      schema?: string;
      elements_in_model?: number;
      geometry_processed: number;
    }>;
  };
  integrity: {
    task_count: number;
    link_count: number;
    active_element_count: number;
    matched_active_elements: number;
    mapped_active_elements: number;
    wbs_match_percent: number;
    geometry_quantity_elements: number;
    geometry_quantity_coverage_percent: number;
    measured_elements: number;
    measurement_coverage_percent: number;
    weight_total: number;
    official_progress_ready: boolean;
    messages: IntegrityMessage[];
  };
  progress: {
    planned_element_proxy_percent: number | null;
    actual_element_proxy_percent: number | null;
    official_planned_percent: number | null;
    official_actual_percent: number | null;
  };
  wbs_rows: WbsRow[];
  elements: Array<{
    guid: string;
    wbs: string;
    action: string;
    phase: string;
    active_scope: boolean;
  }>;
  element_type_summary: Array<{ ifc_type: string; count: number }>;
};



const modelOptions = [{ value: "", label: "Abra o IFC no visualizador" }];

function phaseLabel(row: WbsRow) {
  return row.phases?.length ? row.phases.join(" / ") : "Geral";
}

function hasReleasedStructuralModel(bundle: PlanningBundle) {
  return Array.isArray(bundle.wbs_rows);
}

function actualAtDate(row: WbsRow, measurement: PlanningMeasurement | undefined, statusDate: string) {
  if (measurement) return measurement.statusDate <= statusDate ? measurement.actualPercent : null;
  return row.actual_percent;
}

function percentForDate(row: WbsRow, statusDate: string) {
  if (!row.start || !row.finish) return null;
  const start = ganttDate(row.start);
  const finish = ganttDate(row.finish);
  const statusStart = ganttDate(statusDate);
  if (start === null || finish === null || statusStart === null) return null;
  const status = statusStart + DAY_MS - 1;
  if (status < start) return 0;
  if (row.milestone || finish <= start || status >= finish) return 100;
  return Math.max(0, Math.min(100, ((status - start) / (finish - start)) * 100));
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "2-digit", timeZone: "UTC" })
    .format(parsed)
    .replaceAll(" de ", " ")
    .replace(".", "")
    .toUpperCase();
}

function formatNumber(value: number, maximumFractionDigits = 1) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits }).format(value);
}

function navisTaskName(row: WbsRow) {
  return `${row.wbs} | ${row.name}`;
}

function navisDate(value: string | null) {
  if (!value) return "";
  const normalized = value.replace("T", " ");
  return normalized.length > 16 ? normalized : `${normalized}:00`;
}

function csvValue(value: unknown) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function operationalState(row: WbsRow) {
  const planned = row.planned_percent;
  const actual = row.actual_percent;
  if (actual !== null && actual >= 100) return ["executado", "EXECUTADO"];
  if (actual !== null && planned !== null && planned > actual) return ["atrasado", "ATRASADO"];
  if (actual !== null && actual > 0) return ["executado", "EM EXECUCAO"];
  if (planned === null) return ["sem-data", "SEM DATA"];
  if (planned >= 100) return ["deveria", "DEVERIA CONCLUIR"];
  if (planned > 0) return ["em-curso", "PROGRAMADO"];
  return ["futuro", "FUTURO"];
}

const DAY_MS = 86_400_000;

function ganttDate(value: string | null) {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function ganttLevel(row: WbsRow) {
  if (typeof row.outline_level === "number") return Math.max(0, row.outline_level);
  return row.wbs === "0" ? 0 : row.wbs.split(".").length;
}

function ganttAncestors(wbs: string) {
  if (!wbs || wbs === "0") return [];
  const parts = wbs.split(".");
  const ancestors = parts.slice(0, -1).map((_, index) => parts.slice(0, index + 1).join("."));
  return ["0", ...ancestors];
}

function compactDate(value: string | null) {
  if (!value) return "—";
  const parsed = ganttDate(value);
  if (parsed === null) return "—";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(parsed);
}

function getXmlValue(node: Element, localName: string) {
  return Array.from(node.children).find((child) => child.localName === localName)?.textContent?.trim() || null;
}

function mergeProjectXml(bundle: PlanningBundle, text: string): PlanningBundle {
  const document = new DOMParser().parseFromString(text, "application/xml");
  if (document.querySelector("parsererror")) throw new Error("O XML nao e valido.");
  const taskNodes = Array.from(document.getElementsByTagNameNS("*", "Task"));
  const tasks = new Map<string, { name: string; start: string | null; finish: string | null }>();
  for (const task of taskNodes) {
    const wbs = getXmlValue(task, "WBS") || getXmlValue(task, "OutlineNumber");
    const name = getXmlValue(task, "Name");
    if (wbs && name) tasks.set(wbs, { name, start: getXmlValue(task, "Start"), finish: getXmlValue(task, "Finish") });
  }
  if (!tasks.size) throw new Error("Nenhuma tarefa com WBS foi encontrada no XML.");
  
  return {
    ...bundle,
    sources: {
      ...bundle.sources,
      schedule: { ...bundle.sources.schedule, name: "Cronograma da obra", file: "cronograma-importado.xml", format: "MSPDI_XML", task_count: tasks.size },
    },
    integrity: {
      ...bundle.integrity,
      task_count: tasks.size,
      wbs_match_percent: bundle.integrity.wbs_match_percent,
    },
    wbs_rows: [...tasks].map(([wbs, task]) => {
      const existing = bundle.wbs_rows.find(row => row.wbs === wbs);
      return { wbs, summary: [...tasks.keys()].some(key => key.startsWith(wbs + ".")), milestone: task.start === task.finish, direct_elements: 0, linked_elements: 0, measured_elements: 0, measurement_coverage_percent: null, phases: ["Geral"], quantities: [], planned_percent: null, actual_percent: null, reported_percent: null, delta_percent: null, weight: null, ...existing, ...task };
    }),
  };
}

export default function PlanejamentoPage() {
  const [federationId,setFederationId]=useState("");
  const [scopeReady,setScopeReady]=useState(false);
  const [federationOptions,setFederationOptions]=useState<Array<{id:string;name:string;project_name:string}>>([]);
  const scoped=(path:string)=>federationId?`${path}?federation=${encodeURIComponent(federationId)}`:path;
  useEffect(()=>{let alive=true;(async()=>{try{const q=new URLSearchParams(window.location.search);let id=q.get("federation")||"";if(!id&&!q.has("local")){const active=await fetch("/api/models/active",{cache:"no-store"});if(active.ok)id=(await active.json<any>()).federation?.id||"";}if(alive)setFederationId(id);const projects=await fetch("/api/models/projects",{cache:"no-store"});if(projects.ok){const data=await projects.json<any>();const lists=await Promise.all(data.projects.map(async(p:{id:string;name:string})=>{const r=await fetch("/api/models/federations?projectId="+encodeURIComponent(p.id),{cache:"no-store"});return r.ok?(await r.json<any>()).federations.map((f:{id:string;name:string})=>({...f,project_name:p.name})):[];}));if(alive)setFederationOptions(lists.flat());}if(alive)setFederationId(id);}finally{if(alive)setScopeReady(true);}})().catch(()=>{});return()=>{alive=false;};},[]);
  const [bundle, setBundle] = useState<PlanningBundle | null>(null);
  const [inventory,setInventory]=useState<Inventory|null>(null);
  const [sequenceOptions,setSequenceOptions]=useState({...defaultSequenceOptions,start:new Date().toLocaleDateString('en-CA')});
  const [sequenceDirty,setSequenceDirty]=useState(false);
  const [sequenceSaving,setSequenceSaving]=useState(false);
  const [cascade,setCascade]=useState(true);
  useEffect(()=>{function receive(event:MessageEvent){if(event.origin!==window.location.origin||event.source!==viewerRef.current?.contentWindow||event.data?.type!=='v2m-ifc-inventory')return;const data=event.data.inventory as Inventory;if(Array.isArray(data?.elements))setInventory(data);}window.addEventListener('message',receive);return ()=>window.removeEventListener('message',receive);},[]);
  useEffect(()=>{if(!inventory||!bundle||inventory.complete===false)return;if(!bundle.wbs_rows.length&&bundle.sequence?.model_signature!==inventory.signature){const suggestion=generateSequence(inventory,sequenceOptions) as PlanningBundle;setBundle(suggestion);setStatusDate(suggestion.status_date);setSequenceDirty(true);setNotice('Cronograma sugerido automaticamente. Revise as premissas e salve para manter as datas.');}},[inventory,bundle]);
  useEffect(()=>{if(!bundle)return;viewerRef.current?.contentWindow?.postMessage({type:'v2m-sequence-bundle',bundle},window.location.origin);},[bundle]);
  function regenerate(){if(!inventory)return;try{setBundle(generateSequence(inventory,sequenceOptions));setSequenceDirty(true);setCollapsedWbs(new Set());setPhase('Todas');setNotice('Datas recalculadas como PREMISSA. Revise e salve.');setLoadError('');}catch(error){setLoadError(error instanceof Error?error.message:'Falha ao sugerir cronograma.');}}
  async function saveSequence(){if(!bundle)return;setSequenceSaving(true);try{const next={...bundle,status_date:statusDate};await persistBundle(next);setBundle(next);setSequenceDirty(false);setNotice('Cronograma e datas salvos. Os vínculos mantêm o arquivo de origem e os GUIDs dos elementos.');}catch(error){setLoadError(error instanceof Error?error.message:'Falha ao salvar.');}finally{setSequenceSaving(false);}}
  function changeDate(row:WbsRow,field:'start'|'finish',value:string){if(!bundle||!value)return;try{const start=field==='start'?value:row.start?.slice(0,10)||value;const finish=field==='finish'?value:finishDate(start,row.duration_days||1,bundle.sequence?.settings.workdays??true);setBundle(reschedule(bundle,row.wbs,start,finish,cascade));setSequenceDirty(true);setLoadError('');}catch(error){setLoadError(error instanceof Error?error.message:'Data inválida.');}}

  const [measurements, setMeasurements] = useState<Record<string, PlanningMeasurement>>({});
  const [draftActual, setDraftActual] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [savingWbs, setSavingWbs] = useState("");
  const [phase, setPhase] = useState("Todas");
  const [search, setSearch] = useState("");
  const [statusDate, setStatusDate] = useState("2026-10-06");
  const [ganttZoom, setGanttZoom] = useState<"mes" | "semana">("mes");
  const [collapsedWbs, setCollapsedWbs] = useState<Set<string>>(new Set());
  const [selectedWbs, setSelectedWbs] = useState("");
  const [modelPath, setModelPath] = useState(modelOptions[0].value);
  const [viewerBundleUrl, setViewerBundleUrl] = useState("/data/planejamento-ifc.json");
  const [selectedElement, setSelectedElement] = useState<ViewerElement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const measurementFileRef = useRef<HTMLInputElement>(null);
  const viewerRef = useRef<HTMLIFrameElement>(null);
  const ganttScrollRef = useRef<HTMLDivElement>(null);
  const ganttInitializedRef = useRef(false);

  useEffect(() => {
    if(!scopeReady)return;let alive=true;setBundle(null);setInventory(null);setMeasurements({});setDraftActual({});setSequenceDirty(false);setSelectedElement(null);setPhase("Todas");setSelectedWbs("");ganttInitializedRef.current=false;
    Promise.all([
      fetch("/data/planejamento-ifc.json", { cache: "no-store" }).then((response) => {
        if (!response.ok) throw new Error("Pacote de planejamento da versão não encontrado.");
        return response.json<any>() as Promise<PlanningBundle>;
      }),
      fetch(scoped("/api/planning/bundle"), { cache: "no-store" })
        .then((response) => response.ok ? response.json<any>() as Promise<PlanningBundle> : null)
        .catch(() => null),
    ])
      .then(([packaged, persisted]) => {
        const persistedTime = persisted ? Date.parse(persisted.generated_at) || 0 : 0;
        const packagedTime = Date.parse(packaged.generated_at) || 0;
        const usePersisted = Boolean(
          persisted
          && hasReleasedStructuralModel(persisted)
          && (federationId ? persisted.federation_id===federationId : persistedTime >= packagedTime),
        );
        if(!alive)return;
        const data = usePersisted && persisted ? persisted : federationId?{...packaged,federation_id:federationId}:packaged;
        setViewerBundleUrl(usePersisted ? scoped("/api/planning/bundle") : "/data/planejamento-ifc.json");
        setBundle(data);
        if(data.sequence)setSequenceOptions(data.sequence.settings);
        setStatusDate(data.status_date);
      })
      .catch((error: Error) => setLoadError(error.message));

    fetch(scoped("/api/planning"), { cache: "no-store" })
      .then((response) => response.ok ? response.json<any>() : Promise.reject(new Error("Medições persistentes indisponíveis.")))
      .then((data: { measurements?: PlanningMeasurement[] }) => {
        if(!alive)return;
        const next = Object.fromEntries((data.measurements || []).map((item) => [item.wbs, item]));
        setMeasurements(next);
        setDraftActual(Object.fromEntries((data.measurements || []).map((item) => [item.wbs, String(item.actualPercent)])));
      })
      .catch(() => setNotice("O cronograma e o modelo estão disponíveis; o banco de medições não respondeu nesta sessão."));
    return()=>{alive=false;};
  }, [scopeReady,federationId]);

  async function persistBundle(next: PlanningBundle) {
    const response = await fetch(scoped("/api/planning/bundle"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(federationId?{...next,federation_id:federationId}:next),
    });
    const data = await response.json<any>() as { error?: string };
    if (!response.ok) throw new Error(data.error || "Falha ao salvar o cronograma atualizado.");
    setViewerBundleUrl(scoped("/api/planning/bundle"));
  }

  useEffect(() => {
    function receiveViewerMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source!==viewerRef.current?.contentWindow) return;
      if (event.data?.type === "v2m-planning-date-change" && /^\d{4}-\d{2}-\d{2}$/.test(event.data.date || "")) {
        setStatusDate(event.data.date);
      }
      if (event.data?.type === "v2m-ifc-element-selected") setSelectedElement(event.data.element as ViewerElement);
    }
    window.addEventListener("message", receiveViewerMessage);
    return () => window.removeEventListener("message", receiveViewerMessage);
  }, []);

  useEffect(() => {
    viewerRef.current?.contentWindow?.postMessage({
      type: "v2m-planning-update",
      date: statusDate,
      measurements: Object.fromEntries(Object.values(measurements).map((item) => [item.wbs, { actualPercent: item.actualPercent, statusDate: item.statusDate }])),
    }, window.location.origin);
  }, [measurements, statusDate, modelPath,federationId]);
  useEffect(()=>{viewerRef.current?.contentWindow?.postMessage({type:"v2m-focus-wbs",wbs:selectedWbs},window.location.origin);},[selectedWbs]);

  const phaseOptions = ["Todas",...new Set(bundle?.wbs_rows.flatMap(row=>row.phases)||["Geral"])];
  const scheduleRows = useMemo(() => {
    if (!bundle) return [];
    return bundle.wbs_rows
      .map((row) => ({ ...row, planned_percent: percentForDate(row, statusDate), actual_percent: actualAtDate(row, measurements[row.wbs], statusDate) }));
  }, [bundle, measurements, statusDate]);

  const allProductionRows = useMemo(() => scheduleRows.filter((row) => !row.summary), [scheduleRows]);

  useEffect(() => {
    if (!bundle || ganttInitializedRef.current) return;
    ganttInitializedRef.current = true;
    setCollapsedWbs(new Set(bundle.wbs_rows
      .filter((row) => row.summary && ganttLevel(row) >= 2)
      .map((row) => row.wbs)));
  }, [bundle]);

  const visibleGanttRows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    const filtering = Boolean(term || phase !== "Todas");
    const included = new Set<string>();
    if (filtering) {
      for (const row of scheduleRows) {
        const matchesTerm = !term || `${row.wbs} ${row.name}`.toLocaleLowerCase("pt-BR").includes(term);
        const matchesPhase = phase === "Todas" || row.phases?.includes(phase);
        if (!matchesTerm || !matchesPhase) continue;
        included.add(row.wbs);
        ganttAncestors(row.wbs).forEach((ancestor) => included.add(ancestor));
      }
    }
    return scheduleRows.filter((row) => {
      if (filtering) return included.has(row.wbs);
      return !ganttAncestors(row.wbs).some((ancestor) => collapsedWbs.has(ancestor));
    });
  }, [collapsedWbs, phase, scheduleRows, search]);

  const ganttTimeline = useMemo(() => {
    const dated = scheduleRows.flatMap((row) => [ganttDate(row.start), ganttDate(row.finish)]).filter((value): value is number => value !== null);
    const fallback = ganttDate(statusDate) || Date.now();
    const minimum = dated.length ? Math.min(...dated) : fallback;
    const maximum = dated.length ? Math.max(...dated) : fallback + (120 * DAY_MS);
    const minimumDate = new Date(minimum);
    const maximumDate = new Date(maximum);
    const startMs = Date.UTC(minimumDate.getUTCFullYear(), minimumDate.getUTCMonth(), 1);
    const endMs = Date.UTC(maximumDate.getUTCFullYear(), maximumDate.getUTCMonth() + 1, 0);
    const totalDays = Math.max(1, Math.round((endMs - startMs) / DAY_MS) + 1);
    const pxPerDay = ganttZoom === "semana" ? 19 : 6.2;
    const width = Math.max(920, Math.ceil(totalDays * pxPerDay));
    const months: Array<{ label: string; left: number; width: number }> = [];
    let cursor = startMs;
    while (cursor <= endMs) {
      const current = new Date(cursor);
      const next = Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 1);
      const monthEnd = Math.min(next, endMs + DAY_MS);
      months.push({
        label: new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" }).format(cursor).replace(" de ", "/").replace(".", "").toUpperCase(),
        left: ((cursor - startMs) / DAY_MS) * pxPerDay,
        width: ((monthEnd - cursor) / DAY_MS) * pxPerDay,
      });
      cursor = next;
    }
    const tickStep = ganttZoom === "semana" ? 1 : 7;
    const ticks = Array.from({ length: Math.ceil(totalDays / tickStep) }, (_, index) => {
      const dayIndex = index * tickStep;
      const date = new Date(startMs + (dayIndex * DAY_MS));
      return {
        label: new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(date),
        left: dayIndex * pxPerDay,
        width: tickStep * pxPerDay,
      };
    });
    const statusMs = ganttDate(statusDate) ?? startMs;
    return { startMs, endMs, totalDays, pxPerDay, width, months, ticks, statusLeft: ((statusMs - startMs) / DAY_MS) * pxPerDay };
  }, [ganttZoom, scheduleRows, statusDate]);

  function toggleGanttRow(wbs: string) {
    setCollapsedWbs((current) => {
      const next = new Set(current);
      if (next.has(wbs)) next.delete(wbs); else next.add(wbs);
      return next;
    });
  }

  function expandAllGantt() {
    setCollapsedWbs(new Set());
  }

  function collapseAllGantt() {
    setCollapsedWbs(new Set(scheduleRows.filter((row) => row.summary).map((row) => row.wbs)));
  }

  function focusStatusDate() {
    const viewport = ganttScrollRef.current;
    if (!viewport) return;
    const available = Math.max(280, viewport.clientWidth - 630);
    viewport.scrollTo({ left: Math.max(0, ganttTimeline.statusLeft - (available / 2)), behavior: "smooth" });
  }

  const plannedProxy = useMemo(() => {
    const total = allProductionRows.reduce((sum, row) => sum + row.direct_elements, 0);
    if (!total) return null;
    return allProductionRows.reduce((sum, row) => sum + (row.planned_percent || 0) * row.direct_elements, 0) / total;
  }, [allProductionRows]);

  const quantityTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of allProductionRows) {
      for (const quantity of row.quantities) {
        const key = `${quantity.kind}|${quantity.unit}`;
        totals.set(key, (totals.get(key) || 0) + quantity.value);
      }
    }
    return Array.from(totals.entries()).map(([key, value]) => {
      const [kind, unit] = key.split("|");
      return { kind, unit, value };
    });
  }, [allProductionRows]);

  const measurementSummary = useMemo(() => {
    const measured = allProductionRows.filter((row) => row.actual_percent !== null);
    const measuredElements = measured.reduce((sum, row) => sum + row.direct_elements, 0);
    const totalElements = allProductionRows.reduce((sum, row) => sum + row.direct_elements, 0);
    const actualProxy = measuredElements
      ? measured.reduce((sum, row) => sum + (row.actual_percent || 0) * row.direct_elements, 0) / measuredElements
      : null;
    const lateActivities = measured.filter((row) => (row.planned_percent || 0) > (row.actual_percent || 0)).length;
    return {
      actualProxy,
      measuredElements,
      coverage: totalElements ? (measuredElements / totalElements) * 100 : 0,
      lateActivities,
    };
  }, [allProductionRows]);

  async function persistMeasurements(items: PlanningMeasurement[]) {
    const response = await fetch(scoped("/api/planning"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ measurements: items }),
    });
    const data = await response.json<any>() as { measurements?: PlanningMeasurement[]; error?: string };
    if (!response.ok) throw new Error(data.error || "Falha ao salvar a medição.");
    const next = Object.fromEntries((data.measurements || []).map((item) => [item.wbs, item]));
    setMeasurements(next);
    setDraftActual(Object.fromEntries((data.measurements || []).map((item) => [item.wbs, String(item.actualPercent)])));
    return items.length;
  }

  async function saveMeasurement(row: WbsRow) {
    const value = Number(String(draftActual[row.wbs] ?? "").replace(",", "."));
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      setLoadError("Informe um avanço real entre 0% e 100%.");
      return;
    }
    setSavingWbs(row.wbs);
    setLoadError("");
    try {
      await persistMeasurements([{ wbs: row.wbs, actualPercent: value, statusDate, notes: "", source: "manual" }]);
      setNotice(`Medição da EAP ${row.wbs} salva em ${formatDate(statusDate)}.`);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Falha ao salvar a medição.");
    } finally {
      setSavingWbs("");
    }
  }

  async function importMeasurements(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setLoadError("");
    try {
      const lines = (await file.text()).split(/\r?\n/).filter((line) => line.trim());
      if (lines.length < 2) throw new Error("O CSV não possui linhas de medição.");
      const delimiter = lines[0].includes(";") ? ";" : ",";
      const headers = lines[0].split(delimiter).map((item) => item.trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
      const wbsIndex = headers.findIndex((item) => ["wbs", "eap"].includes(item));
      const actualIndex = headers.findIndex((item) => item.includes("avanco") || item.includes("actual") || item.includes("real"));
      const dateIndex = headers.findIndex((item) => item.includes("data"));
      if (wbsIndex < 0 || actualIndex < 0) throw new Error("Use as colunas WBS/EAP e AvancoReal no CSV.");
      const items = lines.slice(1).map((line) => line.split(delimiter)).filter((columns) => columns[wbsIndex]?.trim()).map((columns) => ({
        wbs: columns[wbsIndex].trim(),
        actualPercent: Number((columns[actualIndex] || "").replace("%", "").replace(",", ".")),
        statusDate: dateIndex >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(columns[dateIndex]?.trim() || "") ? columns[dateIndex].trim() : statusDate,
        notes: "",
        source: "csv" as const,
      }));
      if (!items.length || items.some((item) => !Number.isFinite(item.actualPercent))) throw new Error("Há percentuais inválidos no CSV.");
      await persistMeasurements(items);
      setNotice(`${items.length} medições importadas e salvas.`);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Falha ao importar as medições.");
    } finally {
      event.target.value = "";
    }
  }

  function exportMeasurements() {
    const header = "WBS;Atividade;Inicio;Termino;Planejado;AvancoReal;DataMedicao";
    const rows = allProductionRows.map((row) => [
      row.wbs,
      `"${row.name.replaceAll('"', '""')}"`,
      row.start?.slice(0, 10) || "",
      row.finish?.slice(0, 10) || "",
      row.planned_percent === null ? "" : row.planned_percent.toFixed(2).replace(".", ","),
      row.actual_percent === null ? "" : row.actual_percent.toFixed(2).replace(".", ","),
      measurements[row.wbs]?.statusDate || "",
    ].join(";"));
    const blob = new Blob([`\uFEFF${[header, ...rows].join("\n")}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `medicao-planejamento-${statusDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportNavisworks() {
    if (!bundle) return;
    const actionsByWbs = new Map<string, Set<string>>();
    for (const element of bundle.elements || []) {
      if (!element.active_scope || !element.wbs) continue;
      if (!actionsByWbs.has(element.wbs)) actionsByWbs.set(element.wbs, new Set());
      actionsByWbs.get(element.wbs)!.add(element.action || "Construir");
    }
    const headers = [
      "Synchronization ID", "Display ID", "Task Name", "Task Type",
      "Planned Start Date", "Planned End Date", "Actual Start Date", "Actual End Date",
      "Actual % Complete", "WBS", "Phase", "Selection Set",
      "Model Property Category", "Model Property", "Direct Elements",
    ];
    const lines = allProductionRows.filter((row) => row.start && row.finish).map((row) => {
      const actions = [...(actionsByWbs.get(row.wbs) || new Set(["Construir"]))];
      const taskType = actions.some((action) => /demol|remov/i.test(action))
        ? "Demolish"
        : actions.some((action) => /tempor/i.test(action)) ? "Temporary" : "Construct";
      const name = navisTaskName(row);
      return [
        `V2M-WBS-${row.wbs}`,
        row.wbs,
        name,
        taskType,
        navisDate(row.start),
        navisDate(row.finish),
        row.actual_start || "",
        row.actual_finish || "",
        row.actual_percent === null ? "" : row.actual_percent,
        row.wbs,
        phaseLabel(row),
        name,
        "Pset_4D_Planning",
        "WBS",
        row.direct_elements,
      ].map(csvValue).join(",");
    });
    const blob = new Blob([`\uFEFF${[headers.join(","), ...lines].join("\r\n")}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `navisworks-timeliner-v2m-${statusDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice(`${lines.length} tarefas exportadas com os campos nativos do TimeLiner.`);
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !bundle) return;
    setNotice("");
    setLoadError("");
    try {
      const extension = file.name.split(".").pop()?.toLowerCase();
      if (extension === "mpp" || extension === "mpt") {
        setNotice("MPP/MPT binario detectado. Use o leitor local MPXJ para gerar o pacote JSON; a interface web nao tenta decodificar o formato proprietario no navegador.");
        return;
      }
      const text = await file.text();
      if (extension === "xml") {
        const next = mergeProjectXml(bundle, text);
        await persistBundle(next);
        setBundle(next);
        setNotice(`Cronograma XML carregado e salvo: ${next.integrity.task_count} tarefas. Revise a cobertura EAP antes de usar os indicadores.`);
      } else {
        const next = JSON.parse(text) as PlanningBundle;
        if (next.schema_version !== 1 || !Array.isArray(next.wbs_rows)) throw new Error("Pacote JSON incompativel.");
        await persistBundle(next);
        setBundle(next);
        setStatusDate(next.status_date);
        setNotice(`Pacote integrado carregado e salvo: ${next.integrity.active_element_count} elementos ativos.`);
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Falha ao importar o arquivo.");
    } finally {
      event.target.value = "";
    }
  }

  if (!bundle) {
    return <main className="planning-loading">{loadError || "Carregando planejamento integrado…"}</main>;
  }

  const mptAudit = bundle.sources.schedule_comparison;

  return (
    <div className="planning-shell">
      <aside className="planning-sidebar">
        <a className="planning-brand" href="/"><img src="/v2m-brand.svg" alt="V2M ENGENHARIA"/><span>V2M<br/>GESTAO 5D</span></a>
        <div className="planning-project"><b>V2M ENGENHARIA</b><small>Gestão integrada de obras</small></div>
        <p>PLANEJAMENTO</p>
        <nav>
          <a href="/">Visao geral</a><a href="/projetos">Projetos</a>
          <a className="active" href="/planejamento">Cronograma Gantt</a>
          <a href="#cronograma">Lista + Gantt</a>
          <a href="#modelo">Modelo 4D</a>
          <a href="#navisworks">Navisworks TimeLiner</a>
          <a href="#eap">EAP integrada</a>
          <a href="#medicao">Medicao</a>
          <a href="#quantitativos">Quantitativos</a>
          <a href="#integridade">Integridade</a>
        </nav>
        <p>GESTAO</p>
        <nav><a href="/compras?tab=curva">Curva S / Custos</a><a href="/compras?tab=pedidos">Plano de compras</a><a href="/qualidade">Qualidade</a><a href="/diario">Diario de obra</a></nav>
        <div className="planning-side-source"><span>BASE ATIVA</span><b>{bundle.sources.schedule.format}</b><small>{bundle.sources.schedule.task_count} tarefas · {bundle.integrity.active_element_count} elementos</small></div>
      </aside>

      <main className="planning-main">
        <header className="planning-command">
          <div><small>OBRAS / V2M /</small><b> PLANEJAMENTO 4D / 5D</b></div>
          <div>
            <label><span>DATA DE STATUS</span><input type="date" value={statusDate} onChange={(event) => setStatusDate(event.target.value)}/></label>
            <button className="secondary" onClick={exportMeasurements}>EXPORTAR MEDICAO</button>
            <button className="secondary" onClick={() => measurementFileRef.current?.click()}>IMPORTAR MEDICAO</button>
            <button onClick={() => fileRef.current?.click()}>ATUALIZAR CRONOGRAMA</button>
            <input ref={fileRef} type="file" accept=".json,.xml,.mpp,.mpt" onChange={handleFile} hidden/>
            <input ref={measurementFileRef} type="file" accept=".csv" onChange={importMeasurements} hidden/>
          </div>
        </header>

        <section className="planning-hero">
          <div><p>CRONOGRAMA DA OBRA · LISTA + GANTT</p><h1>Planejamento conectado à <span>EAP do modelo</span></h1><small>Importe seu cronograma XML/JSON; para MPP/MPT, exporte primeiro para XML no MS Project.</small></div>
          <div className="planning-source-stamp"><small>CRONOGRAMA ATIVO</small><b>{bundle.sources.schedule.file}</b><span>{bundle.integrity.wbs_match_percent.toFixed(1).replace(".", ",")}% da EAP vinculada</span></div>
        </section>

        {(notice || loadError) && <div className={`planning-notice ${loadError ? "error" : "ok"}`}>{loadError || notice}</div>}

        <section className="planning-federation"><label>Base do modelo<select aria-label="Composição do Planejamento" value={federationId} onChange={event=>{if(sequenceDirty){setLoadError('Salve o cronograma antes de trocar a composição para manter suas alterações.');return;}const id=event.target.value;setFederationId(id);window.history.replaceState(null,'',id?'/planejamento?federation='+encodeURIComponent(id):'/planejamento?local=1');void fetch('/api/models/active',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:id||null})}).catch(()=>{});}}><option value="">IFC local · cronograma da instalação</option>{federationOptions.map(f=><option key={f.id} value={f.id}>{f.project_name} · {f.name}</option>)}</select></label><a href="/projetos">Gerenciar projetos e composições</a><p>{federationId?'O Gantt e as medições são salvos separadamente para esta composição. Os vínculos mantêm o arquivo de origem e o GlobalId de cada elemento.':'Abra um IFC local ou selecione uma composição federada da biblioteca.'}</p></section>
        <section className="sequence-generator" id="sequencia">
          <header><div><p>IFC → SEQUÊNCIA EXECUTIVA → CRONOGRAMA</p><h2>Datas sugeridas, editáveis por atividade</h2></div>{federationId?<a href="/projetos">Abrir composição na biblioteca</a>:<button onClick={()=>viewerRef.current?.contentWindow?.postMessage({type:'v2m-open-ifc'},window.location.origin)}>Abrir IFC</button>}</header>
          <p>{inventory ? `${inventory.name} · ${inventory.elements.length} elementos analisados` : 'Abra seu IFC no visualizador. A proposta será montada por fundações e pavimentos, com os elementos realmente encontrados.'}</p>
          {inventory?.complete===false&&<p className="sequence-premise">A composição não foi carregada por completo. Confira os arquivos com falha no visualizador antes de gerar um novo cronograma.</p>}
          {inventory&&bundle?.sequence&&bundle.sequence.model_signature!==inventory.signature&&<p className="sequence-premise">O IFC aberto é diferente do modelo usado neste cronograma. Gere uma nova proposta para vincular os elementos atuais; o cronograma anterior permanece salvo até você salvar a substituição.</p>}
          {inventory&&<details className="ifc-information"><summary>Informações lidas do IFC · {inventory.elements.length} objetos</summary><p>Classes IFC, códigos P/PJ, V e L, propriedades de ocorrência/tipo, pavimentos, materiais e unidades. A ISO 19650 orienta a gestão e rastreabilidade; os códigos e campos dependem da convenção acordada no projeto/BEP.</p><button onClick={()=>{const blob=new Blob([JSON.stringify(inventory,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='informacoes-ifc.json';link.click();URL.revokeObjectURL(url);}}>Baixar informações completas do IFC</button><div className="sequence-table-wrap"><table className="sequence-edit-table"><thead><tr><th>Código / nome</th><th>Classe IFC</th><th>Função reconhecida</th><th>Pavimento / fonte</th><th>Propriedades disponíveis</th></tr></thead><tbody>{inventory.elements.slice(0,100).map(element=><tr key={element.key||element.globalId||element.id}><td>{element.code||element.name}<small>{element.sourceName}</small><small>{element.globalId}</small></td><td>{element.type}</td><td>{element.structuralKind||'A_CONFIRMAR'}<small>{element.classificationSource}</small></td><td>{element.storeyName||'A_CONFIRMAR'}<small>{element.levelSource}</small></td><td>{(element.propertySets||[]).map(ps=><div key={ps.name}><b>{ps.name}</b><small>{ps.properties.map(p=>`${p.name}: ${String(p.value??'—')}`).join(' · ')}</small></div>)}</td></tr>)}</tbody></table></div><p>Primeiros 100 objetos na tela; o arquivo JSON inclui todos os objetos lidos. As quantidades de objetos IFC não equivalem automaticamente a peças físicas ou quantitativos de medição.</p></details>}
          <div className="sequence-settings"><label>Início sugerido<input type="date" value={sequenceOptions.start} onChange={e=>setSequenceOptions({...sequenceOptions,start:e.target.value})}/></label><label>Calendário<select value={sequenceOptions.workdays?'uteis':'corridos'} onChange={e=>setSequenceOptions({...sequenceOptions,workdays:e.target.value==='uteis'})}><option value="uteis">Segunda a sexta · sem feriados</option><option value="corridos">Dias corridos</option></select></label>{([['foundationDays','Fundações'],['columnDays','Pilares'],['beamDays','Vigas'],['slabDays','Lajes'],['otherDays','Outros serviços'],['releaseDays','Espera e liberação']] as const).map(([key,label])=><label key={key}>{label} · dias<input type="number" min="1" max="365" value={sequenceOptions[key]} onChange={e=>setSequenceOptions({...sequenceOptions,[key]:Number(e.target.value)})}/></label>)}</div>
          <p className="sequence-premise">PREMISSA: ciclo estrutural sequencial, sem frentes paralelas. Durações por pacote, sem cálculo de produtividade. A espera é uma reserva editável; não representa prazo comprovado de cura ou autorização para carregar/desescorar.</p>
          <div className="sequence-actions"><button disabled={!inventory||inventory.complete===false} onClick={regenerate}>{bundle?.sequence?'Regerar com estas premissas':'Gerar proposta do IFC'}</button><button disabled={!bundle?.sequence||sequenceSaving} onClick={()=>void saveSequence()}>{sequenceSaving?'Salvando…':sequenceDirty?'Salvar cronograma sugerido':'Salvar cronograma'}</button><label><input type="checkbox" checked={cascade} onChange={e=>setCascade(e.target.checked)}/>Reprogramar atividades seguintes ao editar datas</label></div>
          {bundle?.sequence&&<><p><b>{bundle.wbs_rows.length} atividades · {bundle.elements.length} elementos vinculados · {bundle.sequence.pending.length} para revisar · {bundle.sequence.excluded?.length||0} vazios separados</b> · {sequenceDirty?'Alterações ainda não salvas':'Cronograma salvo'}</p><div className="sequence-table-wrap"><table className="sequence-edit-table"><thead><tr><th>EAP</th><th>Atividade / fonte</th><th>Elementos</th><th>Predecessora</th><th>Início</th><th>Término</th><th>Dias</th></tr></thead><tbody>{bundle.wbs_rows.map(row=><tr key={row.wbs}><td>{row.wbs}</td><td><b>{row.name}</b><small>{row.evidence} · {row.rule}</small></td><td>{row.direct_elements}</td><td>{row.predecessor||'—'}</td><td><input aria-label={`Início ${row.wbs}`} type="date" value={row.start?.slice(0,10)||''} onInput={e=>changeDate(row,'start',e.currentTarget.value)}/></td><td><input aria-label={`Término ${row.wbs}`} type="date" value={row.finish?.slice(0,10)||''} onInput={e=>changeDate(row,'finish',e.currentTarget.value)}/></td><td>{row.duration_days}</td></tr>)}</tbody></table></div><details><summary>Elementos fora do cronograma · {bundle.sequence.pending.length}</summary><p>Confira o pavimento e a classificação no modelo e recarregue, ou revise o pacote JSON. Nenhum desses elementos foi descartado do visualizador. A lista mostra os primeiros 100; o pacote do cronograma mantém todos os registros.</p>{bundle.sequence.pending.slice(0,100).map((item,index)=><p key={`${item.id}-${index}`}><b>{item.name}</b> · {item.type} · {item.globalId||item.id} · {item.reason}</p>)}</details></>}
          {inventory&&bundle?.wbs_rows.length&&!bundle.sequence&&<p>Há um cronograma ativo. “Gerar proposta do IFC” substitui a programação no rascunho; a substituição só é mantida após salvar.</p>}
        </section>

        {mptAudit && mptAudit.wbs_match_percent < 100 && (
        <section className="planning-critical" id="integridade">
            <span>RISCO EAP</span>
            <div><b>O MPT original foi lido, mas nao pode substituir a base 4D diretamente.</b><p>Ele possui {mptAudit.task_count} tarefas e apenas {formatNumber(mptAudit.wbs_match_percent)}% de compatibilidade com os codigos WBS gravados nos vinculos IFC. E necessario aprovar um mapa de correspondencia antes da troca.</p></div>
            <em>{mptAudit.orphan_wbs.length} WBS SEM PAR</em>
          </section>
        )}

        <section className="schedule-gantt" id="cronograma">
          <header>
            <div><p>CRONOGRAMA INTEGRADO</p><h2>{bundle.sources.schedule.name}</h2><small>{bundle.sources.schedule.task_count} tarefas · data de status {formatDate(statusDate)}</small></div>
            <span className="schedule-view-badge">LISTA + GANTT</span>
          </header>
          <div className="schedule-toolbar" id="eap">
            <div className="schedule-toolbar-primary">
              <button className="primary" onClick={() => fileRef.current?.click()}>↥ ATUALIZAR CRONOGRAMA</button>
              <button onClick={expandAllGantt}>EXPANDIR</button>
              <button onClick={collapseAllGantt}>RECOLHER</button>
              <button onClick={focusStatusDate}>◉ DATA DE STATUS</button>
            </div>
            <div className="schedule-toolbar-filters">
              <label className="schedule-search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar atividade ou WBS"/></label>
              <label><span>FASE</span><select value={phase} onChange={(event) => setPhase(event.target.value)}>{phaseOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
              <div className="schedule-zoom"><button className={ganttZoom === "mes" ? "active" : ""} onClick={() => setGanttZoom("mes")}>MÊS</button><button className={ganttZoom === "semana" ? "active" : ""} onClick={() => setGanttZoom("semana")}>SEMANA</button></div>
            </div>
          </div>
          <div className="schedule-gantt-legend">
            <span><i className="summary"/>RESUMO EAP</span>
            <span><i className="critical"/>CRÍTICA / ATRASADA</span>
            <span><i className="running"/>PROGRAMADA</span>
            <span><i className="done"/>EXECUTADA</span>
            <span><i className="status"/>DATA DE STATUS</span>
          </div>
          <div
            className="schedule-gantt-scroll"
            ref={ganttScrollRef}
            style={{ "--gantt-chart-width": `${ganttTimeline.width}px`, "--gantt-week-width": `${ganttTimeline.pxPerDay * 7}px` } as CSSProperties}
          >
            <div className="schedule-gantt-grid">
              <div className="schedule-list-head"><span>ID</span><span>ATIVIDADE</span><span>INÍCIO</span><span>TÉRMINO</span><span>PLAN.</span><span>REAL</span></div>
              <div className="schedule-time-head">
                <div className="schedule-months">{ganttTimeline.months.map((month) => <span key={`${month.label}-${month.left}`} style={{ left: month.left, width: month.width }}>{month.label}</span>)}</div>
                <div className="schedule-ticks">{ganttTimeline.ticks.map((tick) => <span key={`${tick.label}-${tick.left}`} style={{ left: tick.left, width: tick.width }}>{tick.label}</span>)}</div>
                <i className="schedule-status-line" style={{ left: ganttTimeline.statusLeft }}/>
              </div>
              {visibleGanttRows.map((row) => {
                const level = ganttLevel(row);
                const [stateClass, stateLabel] = operationalState(row);
                const start = ganttDate(row.start);
                const finish = ganttDate(row.finish);
                const left = start === null ? 0 : ((start - ganttTimeline.startMs) / DAY_MS) * ganttTimeline.pxPerDay;
                const durationDays = start === null || finish === null ? 0 : Math.max(1, Math.round((finish - start) / DAY_MS) + 1);
                const width = Math.max(row.milestone ? 10 : 5, durationDays * ganttTimeline.pxPerDay);
                const barClass = row.summary ? "summary" : row.milestone ? "milestone" : stateClass === "executado" ? "done" : stateClass === "atrasado" || row.critical ? "critical" : stateClass === "em-curso" || stateClass === "deveria" ? "running" : "future";
                const isSelected = selectedWbs === row.wbs || selectedElement?.wbs === row.wbs;
                return <div className={`schedule-gantt-row ${row.summary ? "is-summary" : ""} ${isSelected ? "selected" : ""}`} key={row.wbs}>
                  <div className="schedule-list-row" role="button" tabIndex={0} onClick={() => setSelectedWbs(row.wbs)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelectedWbs(row.wbs); }}>
                    <span className="schedule-id">{row.wbs}</span>
                    <span className="schedule-activity" style={{ paddingLeft: `${Math.min(level, 6) * 13 + 7}px` }} title={row.name}>
                      {row.summary ? <button aria-label={`${collapsedWbs.has(row.wbs) ? "Expandir" : "Recolher"} ${row.name}`} onClick={(event) => { event.stopPropagation(); toggleGanttRow(row.wbs); }}>{collapsedWbs.has(row.wbs) ? "▸" : "▾"}</button> : <i/>}
                      <b>{row.name}</b>
                    </span>
                    <span>{compactDate(row.start)}</span>
                    <span>{compactDate(row.finish)}</span>
                    <span className="schedule-percent">{row.planned_percent === null ? "—" : `${formatNumber(row.planned_percent)}%`}</span>
                    <span className="schedule-real">
                      {!row.summary ? <><input aria-label={`Avanço real da EAP ${row.wbs}`} type="number" min="0" max="100" step="0.1" value={draftActual[row.wbs] ?? (row.actual_percent === null ? "" : String(row.actual_percent))} onClick={(event) => event.stopPropagation()} onChange={(event) => setDraftActual((current) => ({ ...current, [row.wbs]: event.target.value }))} placeholder="—"/><button aria-label={`Salvar avanço da EAP ${row.wbs}`} disabled={savingWbs === row.wbs} onClick={(event) => { event.stopPropagation(); void saveMeasurement(row); }}>{savingWbs === row.wbs ? "…" : "✓"}</button></> : <em>—</em>}
                    </span>
                  </div>
                  <div className="schedule-chart-row" role="button" tabIndex={0} title={`${row.wbs} · ${row.name} · ${stateLabel}`} onClick={() => setSelectedWbs(row.wbs)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelectedWbs(row.wbs); }}>
                    <i className="schedule-status-line" style={{ left: ganttTimeline.statusLeft }}/>
                    {start !== null && finish !== null && (row.milestone
                      ? <span className="schedule-milestone" style={{ left }}><i/></span>
                      : <span className={`schedule-bar ${barClass}`} style={{ left, width }}><i style={{ width: `${Math.max(0, Math.min(100, row.actual_percent || 0))}%` }}/><b>{row.summary ? "" : row.name}</b></span>)}
                  </div>
                </div>;
              })}
            </div>
          </div>
          <footer id="medicao"><span>{visibleGanttRows.length} DE {scheduleRows.length} LINHAS EXIBIDAS</span><span>CLIQUE NA SETA PARA ABRIR A EAP</span><span>O REAL É SALVO POR WBS E ATUALIZA O MODELO 4D</span></footer>
        </section>

        <section className="planning-model" id="modelo">
          <header>
            <div><p>MODELO IFC 4D INTERATIVO</p><h2>O que deveria estar programado até {formatDate(statusDate)}</h2><small>Arraste, aproxime, selecione elementos e mova a linha do tempo. A data do modelo e do painel ficam sincronizadas.</small></div>
            <div className="planning-model-actions">
              {federationId?<a href="/projetos">TROCAR COMPOSIÇÃO</a>:<button onClick={() => viewerRef.current?.contentWindow?.postMessage({type:"v2m-open-ifc"},window.location.origin)}>ABRIR IFC</button>}
              <button onClick={() => viewerRef.current?.requestFullscreen()}>TELA CHEIA</button>
            </div>
          </header>
          <iframe
            ref={viewerRef}
            title="Modelo IFC 4D conectado ao cronograma preliminar"
            src={federationId?`/bim-viewer/federated.html?mode=planning&federation=${encodeURIComponent(federationId)}&v=2`:`/bim-viewer/index.html?mode=planning&model=${encodeURIComponent(modelPath)}&bundle=${encodeURIComponent(viewerBundleUrl)}&v=2`}
            onLoad={() => {viewerRef.current?.contentWindow?.postMessage({type:"v2m-planning-update",date:statusDate,measurements:Object.fromEntries(Object.values(measurements).map(item=>[item.wbs,{actualPercent:item.actualPercent,statusDate:item.statusDate}]))},window.location.origin);viewerRef.current?.contentWindow?.postMessage({type:"v2m-request-inventory"},window.location.origin);if(bundle)viewerRef.current?.contentWindow?.postMessage({type:"v2m-sequence-bundle",bundle},window.location.origin);}}
          />
          <footer className="planning-model-legend">
            <span><i className="done"/>EXECUTADO INFORMADO</span>
            <span><i className="late"/>ATRASADO COM MEDICAO</span>
            <span><i className="due"/>DEVERIA ESTAR CONCLUIDO</span>
            <span><i className="running"/>PROGRAMADO EM EXECUCAO</span>
            <span><i className="future"/>FUTURO</span>
          </footer>
        </section>

        <section className="planning-navisworks" id="navisworks">
          <header>
            <div><p>INTEGRAÇÃO NAVISWORKS TIMELINER</p><h2>Task Name, Task Type e datas no padrão do TimeLiner</h2><small>Para vincular o modelo, utilize GUIDs ou a propriedade Pset_4D_Planning.WBS e confira os vínculos antes da simulação.</small></div>
            <button onClick={exportNavisworks}>BAIXAR CSV TIMELINER</button>
          </header>
          <div className="planning-navisworks-grid">
            <article><i>01</i><div><b>Importar o CSV</b><span>TimeLiner → Data Sources → Add → CSV Import.</span></div></article>
            <article><i>02</i><div><b>Mapear os campos</b><span>Task Name, Synchronization ID, Task Type, Display ID e datas planejadas.</span></div></article>
            <article><i>03</i><div><b>Anexar pela propriedade</b><span>Auto-Attach → Category/Property: comparar Display ID com Pset_4D_Planning → WBS.</span></div></article>
          </div>
          <footer><span>Exporte o cronograma da sua obra pelo botão acima.</span></footer>
        </section>

        {selectedElement && <section className="planning-selection">
          <div><small>ELEMENTO SELECIONADO NO MODELO</small><b>{selectedElement.type} · {selectedElement.name}</b><span>{selectedElement.wbs ? `EAP ${selectedElement.wbs} · ${selectedElement.activity}` : "Sem vínculo produtivo"}</span></div>
          {selectedElement.wbs && <button onClick={() => { setSearch(selectedElement.wbs); document.getElementById("eap")?.scrollIntoView({ behavior: "smooth" }); }}>LOCALIZAR NA EAP</button>}
        </section>}

        <section className="planning-kpis">
          <article><header><span>AVANCO PLANEJADO</span><i>01</i></header><strong>{plannedProxy === null ? "—" : `${formatNumber(plannedProxy)}%`}</strong><footer><span>proxy ponderado por elementos</span><b>{formatDate(statusDate)}</b></footer></article>
          <article className={measurementSummary.actualProxy === null ? "pending" : "ready"}><header><span>AVANCO REAL INFORMADO</span><i>02</i></header><strong>{measurementSummary.actualProxy === null ? "SEM MEDICAO" : `${formatNumber(measurementSummary.actualProxy)}%`}</strong><footer><span>{formatNumber(measurementSummary.coverage)}% do modelo medido</span><b>{measurementSummary.actualProxy === null ? "PENDENTE" : "PARCIAL"}</b></footer></article>
          <article><header><span>VINCULO EAP ↔ IFC</span><i>03</i></header><strong>{formatNumber(bundle.integrity.wbs_match_percent)}%</strong><footer><span>{bundle.integrity.mapped_active_elements || 0} elementos traduzidos</span><b>{bundle.integrity.wbs_match_percent === 100 ? "MAPEADO" : "REVISAR"}</b></footer></article>
          <article className={measurementSummary.lateActivities ? "danger" : ""}><header><span>ATIVIDADES ATRASADAS</span><i>04</i></header><strong>{measurementSummary.lateActivities}</strong><footer><span>com medicao abaixo do planejado</span><b>{measurementSummary.measuredElements} elementos medidos</b></footer></article>
        </section>

        <section className="planning-flow">
          <div><small>01 · CRONOGRAMA</small><b>{bundle.integrity.task_count} tarefas</b><span>XML/JSON direto · MPP/MPT via MPXJ</span></div><i>→</i>
          <div><small>02 · CHAVE</small><b>WBS + GUID</b><span>vinculo deterministico e auditavel</span></div><i>→</i>
          <div><small>03 · MODELO</small><b>{bundle.integrity.active_element_count} elementos</b><span>escopo construir / demolir</span></div><i>→</i>
          <div><small>04 · RESULTADO</small><b>QTO + avanco</b><span>real somente com medicao aprovada</span></div>
        </section>

        <section className="planning-quantity-panel" id="quantitativos">
          <header><div><p>QUANTITATIVOS DA OBRA</p><h2>Escopo produtivo vinculado</h2></div><span>NÃO SOMAR UNIDADES DIFERENTES</span></header>
          <div className="planning-quantity-grid">
            {quantityTotals.map((item) => <article key={`${item.kind}-${item.unit}`}><small>{item.kind.toUpperCase()}</small><b>{formatNumber(item.value, 2)} <em>{item.unit}</em></b><span>elementos com essa base de medicao</span></article>)}
            <article><small>ELEMENTOS ATIVOS</small><b>{formatNumber(bundle.integrity.active_element_count, 0)} <em>un</em></b><span>construir ou demolir</span></article>
          </div>
          <p className="planning-method-note">Quantidades e pesos devem ter origem verificável. Valide o vínculo IFC–EAP e os pesos antes de usar o avanço geral.</p>
        </section>

        <section className="planning-integrity-list">
          <header><h2>Regras de integridade</h2><span>{bundle.integrity.messages.length} PONTOS</span></header>
          <div>{bundle.integrity.messages.map((message) => <article className={message.level} key={message.code}><i>{message.level === "critical" ? "!" : message.level === "warning" ? "△" : "i"}</i><p><b>{message.title}</b><span>{message.detail}</span></p><small>{message.code}</small></article>)}</div>
        </section>

        <footer className="planning-footer"><span>CRONOGRAMA · {bundle.sources.schedule.format}</span><span>VINCULOS · {bundle.sources.links.row_count} LINHAS</span><span>IFC · {bundle.sources.ifc_models.length} MODELOS</span><span>STATUS · {formatDate(statusDate)}</span></footer>
      </main>
    </div>
  );
}
