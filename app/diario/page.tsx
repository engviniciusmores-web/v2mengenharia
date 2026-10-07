"use client";
/* eslint-disable @next/next/no-html-link-for-pages, @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type RdoRecord = {
  id: string; recordDate: string; reportNumber?: string; sourceFolder?: string;
  status: "pending_review" | "reviewed" | "approved"; summary: string; weather?: string;
  workforce?: string; activities: string[]; occurrences: string[]; documentCount: number;
  photoCount: number; updatedAt?: string;
};
type RdoFile = { id: string; fileName: string; relativePath?: string; contentType: string; sizeBytes: number; kind: "photo" | "document"; url: string };
type PreparedFile = { file: File; date: string; path: string; kind: "photo" | "document"; text?: string };

const supported = /\.(pdf|docx|xlsx|xls|txt|csv|jpe?g|png|webp|heic)$/i;
const imageTypes = /\.(jpe?g|png|webp|heic)$/i;
const statusLabels = { pending_review: "AGUARDANDO REVISÃO", reviewed: "REVISADO", approved: "APROVADO" };

function isoDate(year: number, month: number, day: number) {
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function detectDate(value: string, fallback: number) {
  const ymd = value.match(/(?:^|\D)(20\d{2})[-_.\s]?(0?[1-9]|1[0-2])[-_.\s]?(0?[1-9]|[12]\d|3[01])(?:\D|$)/);
  if (ymd) return isoDate(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));
  const dmy = value.match(/(?:^|\D)(0?[1-9]|[12]\d|3[01])[-_./\s](0?[1-9]|1[0-2])[-_./\s](20\d{2})(?:\D|$)/);
  if (dmy) return isoDate(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));
  const date = new Date(fallback || Date.now());
  return isoDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function formatDate(value: string, long = false) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", long ? { weekday: "long", day: "2-digit", month: "long", year: "numeric" } : { day: "2-digit", month: "short", year: "numeric" }).format(new Date(year, month - 1, day));
}

function cleanLines(text: string) {
  const seen = new Set<string>();
  return text.split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim()).filter((line) => {
    if (line.length < 4 || line.length > 240 || /^p[aá]gina\s+\d/i.test(line)) return false;
    const key = line.toLocaleLowerCase("pt-BR");
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

function selectLines(lines: string[], matcher: RegExp, max: number) {
  return lines.filter((line) => matcher.test(line) && !/relat[oó]rio di[aá]rio|construtora viero|berneck s\.a\./i.test(line)).slice(0, max);
}

function analyzeText(text: string, date: string) {
  const lines = cleanLines(text);
  const activityMatcher = /concret|arma[cç]|forma|monta|instala|execut|demoli|escava|funda|estaca|pilar|viga|laje|alvenaria|terraplan|impermeabil|pintura|estrutura|servi[cç]o/i;
  let activities = selectLines(lines, activityMatcher, 7);
  if (!activities.length) activities = lines.filter((line) => line.length > 18 && !/data|cliente|obra|contratada|assinatura|respons[aá]vel/i.test(line)).slice(0, 5);
  const occurrences = selectLines(lines, /ocorr[eê]ncia|observa[cç]|impedimento|atraso|paralisa|interfer[eê]ncia|acidente|n[aã]o conform|chuva/i, 5);
  const weather = selectLines(lines, /clima|tempo|ensolar|nublado|chuv|precipita|temperatura/i, 2).join(" · ");
  const workforce = selectLines(lines, /efetivo|m[aã]o de obra|colaborador|funcion[aá]rio|total.*(homens|pessoas)|equipe.*\d/i, 2).join(" · ");
  const report = text.match(/\bRDO\s*[-–_ Nº.:]*\s*(\d{1,6})\b/i)?.[1] || "";
  const day = formatDate(date);
  const summary = activities.length
    ? `Em ${day}, os registros indicam atuação em ${activities.slice(0, 3).map((item) => item.replace(/[.:;]+$/, "").toLocaleLowerCase("pt-BR")).join("; ")}. ${occurrences.length ? `Também foram apontados: ${occurrences.slice(0, 2).join("; ")}.` : "Não foram identificadas ocorrências críticas no conteúdo importado."}`
    : `O diário de ${day} foi importado, mas não apresentou texto suficiente para detalhar a produção. Consulte os documentos e o registro fotográfico.`;
  return { summary, activities, occurrences, weather, workforce, report };
}

async function extractText(file: File) {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".txt") || lower.endsWith(".csv")) return file.text();
  if (lower.endsWith(".docx")) {
    const mammoth = await import("mammoth/mammoth.browser");
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return result.value;
  }
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
    return workbook.SheetNames.map((name) => `${name}\n${XLSX.utils.sheet_to_csv(workbook.Sheets[name])}`).join("\n");
  }
  if (lower.endsWith(".pdf")) {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = "https://unpkg.com/pdfjs-dist@6.2.108/legacy/build/pdf.worker.min.mjs";
    const document = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => "str" in item ? item.str : "").join(" "));
    }
    return pages.join("\n");
  }
  return "";
}

export default function DiarioPage() {
  const [records, setRecords] = useState<RdoRecord[]>([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [files, setFiles] = useState<RdoFile[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");
  const folderInput = useRef<HTMLInputElement>(null);
  const selected = records.find((record) => record.recordDate === selectedDate) || records[0] || null;

  const loadFiles = useCallback(async (recordId: string) => {
    const response = await fetch(`/api/rdo/files?recordId=${encodeURIComponent(recordId)}`);
    if (response.ok) setFiles((await response.json<any>()).files || []);
  }, []);

  const loadRecords = useCallback(async (preferredDate?: string) => {
    const response = await fetch("/api/rdo");
    if (!response.ok) return;
    const next = (await response.json<any>()).records || [];
    setRecords(next);
    const nextDate = preferredDate || selectedDate || next[0]?.recordDate || "";
    setSelectedDate(nextDate);
    const record = next.find((item: RdoRecord) => item.recordDate === nextDate) || next[0];
    if (record) await loadFiles(record.id); else setFiles([]);
  }, [loadFiles, selectedDate]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/rdo").then((response) => response.ok ? response.json<any>() : { records: [] }).then(async (data) => {
      if (cancelled) return;
      const next = data.records || [];
      setRecords(next); setSelectedDate(next[0]?.recordDate || "");
      if (next[0]) {
        const response = await fetch(`/api/rdo/files?recordId=${encodeURIComponent(next[0].id)}`);
        if (!cancelled && response.ok) setFiles((await response.json<any>()).files || []);
      }
    });
    return () => { cancelled = true; };
  }, []);

  async function selectDay(record: RdoRecord) {
    setSelectedDate(record.recordDate); setFiles([]); await loadFiles(record.id);
  }

  async function synchronize(inputFiles: FileList | null) {
    if (!inputFiles?.length) return;
    setSyncing(true); setMessage("Lendo os documentos e organizando as fotos por data...");
    try {
      const sourceFolder = inputFiles[0].webkitRelativePath?.split("/")[0] || "Pasta de RDO";
      const prepared: PreparedFile[] = [];
      for (const file of Array.from(inputFiles).filter((item) => supported.test(item.name))) {
        const path = file.webkitRelativePath || file.name;
        const kind = imageTypes.test(file.name) ? "photo" : "document";
        let text = "";
        if (kind === "document") {
          setMessage(`Lendo ${file.name}...`);
          try { text = await extractText(file); } catch { text = ""; }
        }
        const date = detectDate(`${path}\n${text.slice(0, 2500)}`, file.lastModified);
        prepared.push({ file, path, kind, text, date });
      }
      if (!prepared.length) throw new Error("A pasta não contém PDF, Word, Excel, texto ou fotos compatíveis.");
      const groups = new Map<string, PreparedFile[]>();
      for (const item of prepared) groups.set(item.date, [...(groups.get(item.date) || []), item]);
      let completed = 0;
      for (const [date, items] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
        const documents = items.filter((item) => item.kind === "document");
        const photos = items.filter((item) => item.kind === "photo");
        const text = documents.map((item) => item.text || "").join("\n");
        const analysis = analyzeText(text, date);
        setMessage(`Resumindo ${formatDate(date)} e enviando ${items.length} arquivo(s)...`);
        const response = await fetch("/api/rdo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          recordDate: date, reportNumber: analysis.report, sourceFolder, status: "pending_review",
          summary: analysis.summary, weather: analysis.weather, workforce: analysis.workforce,
          activities: analysis.activities, occurrences: analysis.occurrences,
          documentCount: documents.length, photoCount: photos.length,
        }) });
        const data = await response.json<any>();
        if (!response.ok) throw new Error(data.error || `Falha ao salvar o diário de ${formatDate(date)}.`);
        for (const item of items) {
          const form = new FormData(); form.append("file", item.file); form.append("recordId", data.record.id);
          form.append("recordDate", date); form.append("relativePath", item.path); form.append("kind", item.kind);
          const upload = await fetch("/api/rdo/files", { method: "POST", body: form });
          if (!upload.ok) { const error = await upload.json<any>(); throw new Error(error.error || `Falha ao enviar ${item.file.name}.`); }
        }
        completed += 1;
      }
      const newest = [...groups.keys()].sort().at(-1) || "";
      await loadRecords(newest);
      setMessage(`${completed} dia(s) sincronizado(s). Resumos e fotos atualizados.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível sincronizar a pasta."); }
    finally { setSyncing(false); if (folderInput.current) folderInput.current.value = ""; }
  }

  const photos = files.filter((file) => file.kind === "photo");
  const documents = files.filter((file) => file.kind === "document");
  const metrics = useMemo(() => ({
    days: records.length,
    photos: records.reduce((sum, record) => sum + Number(record.photoCount || 0), 0),
    pending: records.filter((record) => record.status === "pending_review").length,
    latest: records[0]?.recordDate || "",
  }), [records]);

  return <main className="rdo-page">
    <header className="quality-topbar rdo-topbar"><a href="/">V2M ENGENHARIA · PAINEL EXECUTIVO</a><nav><a href="/">Visão geral</a><a href="/projetos">Projetos</a><a href="/qualidade">Qualidade</a><b>Diário de Obra</b><a href="/#visualizador">BIM 4D / 5D</a></nav></header>
    <section className="rdo-heading"><div><p>GESTÃO DIÁRIA DA PRODUÇÃO</p><h1>Diário de Obra</h1><span>Resumo executivo dos RDOs, ocorrências e evidências fotográficas organizados automaticamente por data.</span></div><div className="rdo-sync"><input ref={(element)=>{folderInput.current=element;if(element)element.setAttribute("webkitdirectory","")}} type="file" multiple hidden onChange={(event)=>void synchronize(event.target.files)}/><button disabled={syncing} onClick={()=>folderInput.current?.click()}>{syncing ? "SINCRONIZANDO..." : "SINCRONIZAR PASTA DE RDO"}</button><small>PDF · WORD · EXCEL · TXT · FOTOS</small></div></section>
    <section className="rdo-kpis"><article><small>DIAS REGISTRADOS</small><b>{metrics.days}</b></article><article><small>FOTOS DE CAMPO</small><b>{metrics.photos}</b></article><article><small>AGUARDANDO REVISÃO</small><b>{metrics.pending}</b></article><article><small>ÚLTIMO REGISTRO</small><b className="date">{metrics.latest ? formatDate(metrics.latest) : "—"}</b></article></section>
    {message && <p className={`rdo-message ${/falha|não foi|não contém|excede/i.test(message) ? "error" : ""}`}>{message}</p>}

    {!records.length ? <section className="rdo-empty"><div><small>PASTA AINDA NÃO SINCRONIZADA</small><h2>Salve os diários e as fotos em uma pasta</h2><p>Organize cada dia em uma subpasta com a data — por exemplo, <b>2026-09-01</b>. Depois clique em “Sincronizar pasta de RDO”. O sistema lê o conteúdo, cria o resumo do dia e apresenta as fotos na mesma página.</p><button disabled={syncing} onClick={()=>folderInput.current?.click()}>SELECIONAR PASTA</button></div><aside><span>01</span><p><b>PREENCHER RDO</b><small>Contratada · durante o dia</small></p><i/><span>02</span><p><b>REVISAR</b><small>Até o início do próximo dia</small></p><i/><span>03</span><p><b>APROVAR / COMENTAR</b><small>Engenharia responsável</small></p></aside></section> : <section className="rdo-workspace">
      <aside className="rdo-calendar"><header><div><small>HISTÓRICO</small><b>{records.length} DIA(S)</b></div><span>MAIS RECENTE</span></header><div>{records.map((record)=><button key={record.id} className={selected?.id===record.id?"active":""} onClick={()=>void selectDay(record)}><time><strong>{record.recordDate.slice(8,10)}</strong><span>{formatDate(record.recordDate).split(" ")[1]}</span></time><p><b>{record.reportNumber?`RDO ${record.reportNumber}`:"REGISTRO DIÁRIO"}</b><small>{record.activities[0] || "Registro importado"}</small></p><em className={record.status}>{statusLabels[record.status]}</em></button>)}</div></aside>
      {selected && <article className="rdo-detail"><header><div><small>{selected.reportNumber?`RDO ${selected.reportNumber}`:"RELATÓRIO DIÁRIO DE OBRA"}</small><h2>{formatDate(selected.recordDate, true)}</h2><span>{selected.sourceFolder || "Pasta de RDO"} · atualizado automaticamente</span></div><em className={selected.status}>{statusLabels[selected.status]}</em></header>
        <section className="rdo-summary"><small>RESUMO EXECUTIVO DO DIA</small><p>{selected.summary}</p></section>
        <section className="rdo-facts"><article><small>CONDIÇÕES CLIMÁTICAS</small><p>{selected.weather || "Não identificadas no documento."}</p></article><article><small>EFETIVO / EQUIPES</small><p>{selected.workforce || "Não identificado no documento."}</p></article></section>
        <section className="rdo-content"><article><header><b>ATIVIDADES REGISTRADAS</b><span>{selected.activities.length}</span></header>{selected.activities.length?<ol>{selected.activities.map((activity,index)=><li key={`${activity}-${index}`}><i>{String(index+1).padStart(2,"0")}</i><span>{activity}</span></li>)}</ol>:<p>Nenhuma atividade textual identificada.</p>}</article><article><header><b>OCORRÊNCIAS E PONTOS DE ATENÇÃO</b><span>{selected.occurrences.length}</span></header>{selected.occurrences.length?<ul>{selected.occurrences.map((occurrence,index)=><li key={`${occurrence}-${index}`}>{occurrence}</li>)}</ul>:<p>Sem ocorrências críticas identificadas no conteúdo importado.</p>}</article></section>
        <section className="rdo-photos"><header><div><small>REGISTRO FOTOGRÁFICO</small><h3>{photos.length} foto(s) do dia</h3></div><span>CLIQUE PARA AMPLIAR</span></header>{photos.length?<div>{photos.map((photo)=><a href={photo.url} target="_blank" rel="noreferrer" key={photo.id}><img src={photo.url} alt={photo.fileName}/><span>{photo.fileName}</span></a>)}</div>:<p>Nenhuma foto associada a este dia. Salve as imagens na subpasta da data e sincronize novamente.</p>}</section>
        <section className="rdo-documents"><header><b>DOCUMENTOS DE ORIGEM</b><span>{documents.length} arquivo(s)</span></header><div>{documents.map((document)=><a href={document.url} target="_blank" rel="noreferrer" key={document.id}><span>{document.fileName}</span><small>{(document.sizeBytes/1024/1024).toLocaleString("pt-BR",{maximumFractionDigits:1})} MB · ABRIR ORIGINAL</small></a>)}</div></section>
      </article>}
    </section>}
    <footer className="rdo-foot">Fluxo adotado: preenchimento pela contratada, revisão até o próximo dia de trabalho e aprovação/comentário pela Engenharia responsável.</footer>
  </main>;
}
