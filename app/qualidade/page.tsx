"use client";
/* eslint-disable @next/next/no-html-link-for-pages, @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { concreteGroup, concreteItems, resolveRisTemplate, risTemplates, statusLabels } from "./quality-data";

type SelectedElement = { id: number; globalId?: string; type: string; name: string; phase?: string; activity?: string; wbs?: string };
type Answers = Record<string, string>;
type ConcreteData = { client: string; work: string; concreteType: string; slump: string; supplier: string; area: string; projectRef: string; date: string; invoices: string };
type QualityRecord = { id: string; elementKey: string; elementExpressId: number; elementGlobalId?: string; elementType: string; elementName: string; phase?: string; templateCode: string; serviceType: string; status: string; inspectorName?: string; inspectionDate?: string; location?: string; projectRef?: string; observations?: string; risAnswers?: Answers; concreteAnswers?: Answers; concreteData?: Partial<ConcreteData>; releasedAt?: string; updatedAt?: string };
type Photo = { id: string; fileName: string; url: string; sizeBytes: number };

const defaultConcrete: ConcreteData = { client: "", work: "", concreteType: "", slump: "", supplier: "", area: "", projectRef: "", date: "", invoices: "" };

export default function QualidadePage() {
  const [selected, setSelected] = useState<SelectedElement | null>(null);
  const [templateCode, setTemplateCode] = useState("03");
  const [activeForm, setActiveForm] = useState<"ris" | "concrete">("ris");
  const [risAnswers, setRisAnswers] = useState<Answers>({});
  const [concreteAnswers, setConcreteAnswers] = useState<Answers>({});
  const [concreteData, setConcreteData] = useState<ConcreteData>(defaultConcrete);
  const [inspectorName, setInspectorName] = useState("");
  const [inspectionDate, setInspectionDate] = useState("");
  const [location, setLocation] = useState("");
  const [projectRef, setProjectRef] = useState("");
  const [observations, setObservations] = useState("");
  const [recordId, setRecordId] = useState("");
  const [releasedAt, setReleasedAt] = useState("");
  const [records, setRecords] = useState<QualityRecord[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const template = useMemo(() => risTemplates.find((item) => item.ris === templateCode) || risTemplates[0], [templateCode]);
  const elementKey = selected ? selected.globalId || `express-${selected.id}` : "";

  const resetForm = useCallback((element?: SelectedElement, nextTemplateCode?: string) => {
    setRisAnswers({}); setConcreteAnswers({}); setConcreteData({ ...defaultConcrete, area: element?.name || "" });
    setInspectorName(""); setInspectionDate(""); setLocation(element?.name || ""); setProjectRef(""); setObservations("");
    setRecordId(""); setReleasedAt(""); setPhotos([]); setMessage("");
    if (nextTemplateCode) setTemplateCode(nextTemplateCode);
  }, []);

  const loadPhotos = useCallback(async (id: string) => {
    if (!id) { setPhotos([]); return; }
    const response = await fetch(`/api/quality/photos?recordId=${encodeURIComponent(id)}`);
    if (response.ok) setPhotos((await response.json<any>()).photos || []);
  }, []);

  const applyRecord = useCallback((record: QualityRecord | null, element?: SelectedElement, nextTemplateCode?: string) => {
    if (!record) { resetForm(element, nextTemplateCode); return; }
    setRecordId(record.id); setTemplateCode(record.templateCode); setRisAnswers(record.risAnswers || {});
    setConcreteAnswers(record.concreteAnswers || {}); setConcreteData({ ...defaultConcrete, ...(record.concreteData || {}) });
    setInspectorName(record.inspectorName || ""); setInspectionDate(record.inspectionDate || ""); setLocation(record.location || "");
    setProjectRef(record.projectRef || ""); setObservations(record.observations || ""); setReleasedAt(record.releasedAt || ""); setMessage("");
    void loadPhotos(record.id);
  }, [loadPhotos, resetForm]);

  const loadRecord = useCallback(async (element: SelectedElement, code: string) => {
    const key = element.globalId || `express-${element.id}`;
    const response = await fetch(`/api/quality?elementKey=${encodeURIComponent(key)}&templateCode=${encodeURIComponent(code)}`);
    if (!response.ok) { resetForm(element, code); setMessage("Não foi possível consultar o histórico deste elemento."); return; }
    applyRecord((await response.json<any>()).record, element, code);
  }, [applyRecord, resetForm]);

  const loadRecords = useCallback(async () => {
    const response = await fetch("/api/quality");
    if (response.ok) setRecords((await response.json<any>()).records || []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/quality").then((response) => response.ok ? response.json<any>() : { records: [] }).then((data) => {
      if (!cancelled) setRecords(data.records || []);
    });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.type !== "v2m-ifc-element-selected") return;
      const element = event.data.element as SelectedElement;
      const matched = resolveRisTemplate(element.type, element.name);
      setSelected(element); setActiveForm("ris"); setTemplateCode(matched.ris); void loadRecord(element, matched.ris);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [loadRecord]);

  const concreteComplete = concreteItems.every((item) => ["C", "NC", "NA"].includes(concreteAnswers[String(item.index)]));
  const hasNc = Object.values(risAnswers).includes("NC") || Object.values(concreteAnswers).includes("NC");
  const concreteFieldsComplete = Boolean(inspectorName && inspectionDate && concreteData.concreteType && concreteData.slump && concreteData.supplier && concreteData.area && concreteData.projectRef && concreteData.date);
  const canRelease = concreteComplete && concreteFieldsComplete && !hasNc;
  const derivedStatus = hasNc ? "nonconforming" : releasedAt ? "released" : canRelease ? "ready" : Object.keys(risAnswers).length || Object.keys(concreteAnswers).length ? "in_progress" : "draft";
  const risProgress = template.items.length ? Math.round((Object.keys(risAnswers).length / template.items.length) * 100) : 0;
  const concreteProgress = concreteItems.length ? Math.round((Object.keys(concreteAnswers).length / concreteItems.length) * 100) : 0;

  async function saveRecord(statusOverride?: string) {
    if (!selected) { setMessage("Selecione um elemento no modelo IFC."); return null; }
    setSaving(true); setMessage("");
    const finalStatus = statusOverride || derivedStatus;
    const finalReleasedAt = finalStatus === "released" ? releasedAt || new Date().toISOString() : releasedAt || null;
    try {
      const response = await fetch("/api/quality", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        elementKey, elementExpressId: selected.id, elementGlobalId: selected.globalId, elementType: selected.type,
        elementName: selected.name, phase: selected.phase, templateCode: template.ris, serviceType: template.service,
        status: finalStatus, inspectorName, inspectionDate, location, projectRef, observations,
        risAnswers, concreteAnswers, concreteData, releasedAt: finalReleasedAt,
      }) });
      const data = await response.json<any>();
      if (!response.ok) throw new Error(data.error || "Falha ao salvar.");
      setRecordId(data.record.id); setReleasedAt(data.record.releasedAt || "");
      setMessage(finalStatus === "released" ? "Elemento liberado para concretagem e registro salvo." : "Registro salvo com sucesso.");
      await loadRecords(); return data.record as QualityRecord;
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao salvar."); return null; }
    finally { setSaving(false); }
  }

  async function releaseConcrete() {
    if (!canRelease) { setMessage("Preencha todos os itens e dados obrigatórios da liberação, sem não conformidades."); return; }
    await saveRecord("released");
  }

  async function uploadPhoto(file: File) {
    let id = recordId;
    if (!id) id = (await saveRecord())?.id || "";
    if (!id || !selected) return;
    const form = new FormData(); form.append("file", file); form.append("recordId", id); form.append("elementKey", elementKey);
    const response = await fetch("/api/quality/photos", { method: "POST", body: form });
    const data = await response.json<any>();
    if (!response.ok) { setMessage(data.error || "Falha ao anexar foto."); return; }
    await loadPhotos(id); setMessage("Evidência fotográfica anexada.");
  }

  async function removePhoto(id: string) {
    const response = await fetch(`/api/quality/photos/${id}`, { method: "DELETE" });
    if (response.ok) setPhotos((items) => items.filter((photo) => photo.id !== id));
  }

  function openRecord(record: QualityRecord) {
    const element: SelectedElement = { id: record.elementExpressId, globalId: record.elementGlobalId, type: record.elementType, name: record.elementName, phase: record.phase };
    setSelected(element); setActiveForm("ris"); applyRecord(record, element, record.templateCode); window.scrollTo({ top: 150, behavior: "smooth" });
  }

  const summary = { released: records.filter((r) => r.status === "released").length, nc: records.filter((r) => r.status === "nonconforming").length, open: records.filter((r) => r.status !== "released").length };

  return <main className="quality-page">
    <header className="quality-topbar"><a href="/">V2M ENGENHARIA · PAINEL EXECUTIVO</a><nav><a href="/">Visão geral</a><a href="/projetos">Projetos</a><b>Qualidade</b><a href="/diario">Diário de Obra</a><a href="/#visualizador">BIM 4D / 5D</a></nav></header>
    <section className="quality-heading"><div><p>CONTROLE DA QUALIDADE POR ELEMENTO</p><h1>Inspeção BIM e liberação de concretagem</h1><span>Selecione a peça, preencha a RIS correspondente e registre a liberação no mesmo fluxo.</span></div><aside><small>MODELO ATIVO</small><b>STACKER · IFC4 FEDERADO</b><em>156 elementos estruturais vinculados</em></aside></section>
    <section className="quality-kpis"><article><small>REGISTROS CRIADOS</small><b>{records.length}</b></article><article><small>LIBERADOS</small><b>{summary.released}</b></article><article><small>EM ABERTO</small><b>{summary.open}</b></article><article className={summary.nc ? "has-nc" : ""}><small>NÃO CONFORMIDADES</small><b>{summary.nc}</b></article></section>

    <section className="quality-workspace">
      <article className="quality-viewer"><header><b>MODELO IFC</b><span>CLIQUE EM UM ELEMENTO</span></header><iframe title="Modelo IFC para controle da qualidade" src="/bim-viewer/index.html?mode=quality&amp;v=7" /></article>
      <article className="quality-form-panel"><header><b>{selected ? selected.name : "REGISTRO DE INSPEÇÃO"}</b><span className={`quality-status ${derivedStatus}`}>{statusLabels[derivedStatus]}</span></header>
        {!selected ? <div className="quality-empty"><strong>Selecione uma peça no modelo</strong><p>Ao clicar em uma viga, o sistema abre a RIS-03. Pilares, fundações, lajes, escadas e placas são associados às respectivas RIS automaticamente.</p></div> : <div className="quality-form-scroll">
          <section className="selected-element"><div><small>ELEMENTO IFC</small><b>{selected.type}</b><span>Express ID {selected.id}{selected.phase ? ` · ${selected.phase}` : ""}</span></div><label>MODELO RIS<select value={templateCode} onChange={(event)=>{const code=event.target.value;setTemplateCode(code);void loadRecord(selected,code)}}>{risTemplates.map((item)=><option value={item.ris} key={item.ris}>RIS-{item.ris} · {item.service}</option>)}</select></label></section>
          <nav className="quality-tabs"><button className={activeForm==="ris"?"active":""} onClick={()=>setActiveForm("ris")}>RIS-{template.ris}<span>{risProgress}% preenchido</span></button><button className={activeForm==="concrete"?"active":""} onClick={()=>setActiveForm("concrete")}>LIBERAÇÃO DE CONCRETAGEM<span>{concreteProgress}% preenchido</span></button></nav>
          <section className="quality-fields"><label>RESPONSÁVEL PELA INSPEÇÃO<input value={inspectorName} onChange={(e)=>setInspectorName(e.target.value)} placeholder="Engenheiro ou Mestre de Obra" /></label><label>DATA DA INSPEÇÃO<input type="date" value={inspectionDate} onChange={(e)=>setInspectionDate(e.target.value)} /></label><label>LOCAL DA INSPEÇÃO<input value={location} onChange={(e)=>setLocation(e.target.value)} /></label><label>PROJETO DE REFERÊNCIA<input value={projectRef} onChange={(e)=>setProjectRef(e.target.value)} /></label></section>

          {activeForm === "ris" ? <section className="digital-form ris-form"><header><div><small>TIPO DE SERVIÇO</small><b>{template.service}</b></div><div><small>REGISTRO</small><b>RIS-{template.ris} · REV. {template.revision}</b></div></header>{template.items.map((item)=><article className="check-item" key={item.index}><div className="check-main"><b>{item.item}</b>{item.responsible && <small>RESPONSÁVEL · {item.responsible}</small>}{item.method && <p><span>Método</span>{item.method}</p>}{item.criterion && <p><span>Critério</span>{item.criterion}</p>}</div><div className="answer-group"><button className={risAnswers[String(item.index)]==="A"?"selected conform":""} onClick={()=>setRisAnswers({...risAnswers,[String(item.index)]:"A"})}>A</button><button className={risAnswers[String(item.index)]==="NC"?"selected nc":""} onClick={()=>setRisAnswers({...risAnswers,[String(item.index)]:"NC"})}>NC</button></div></article>)}</section> : <section className="digital-form concrete-form"><header><div><small>FORMULÁRIO</small><b>LIBERAÇÃO DE SERVIÇO DE CONCRETAGEM</b></div><div><small>REFERÊNCIA</small><b>RG-SGQ.0712 · REV. 04</b></div></header><div className="concrete-fields"><label>CLIENTE<input value={concreteData.client} onChange={(e)=>setConcreteData({...concreteData,client:e.target.value})}/></label><label>OBRA<input value={concreteData.work} onChange={(e)=>setConcreteData({...concreteData,work:e.target.value})}/></label><label>TIPO DE CONCRETO<input value={concreteData.concreteType} onChange={(e)=>setConcreteData({...concreteData,concreteType:e.target.value})} placeholder="Ex.: C40"/></label><label>ABATIMENTO (CM)<input value={concreteData.slump} onChange={(e)=>setConcreteData({...concreteData,slump:e.target.value})}/></label><label>FORNECEDOR<input value={concreteData.supplier} onChange={(e)=>setConcreteData({...concreteData,supplier:e.target.value})}/></label><label>LOCAL / ÁREA<input value={concreteData.area} onChange={(e)=>setConcreteData({...concreteData,area:e.target.value})}/></label><label>PROJETO DE REFERÊNCIA<input value={concreteData.projectRef} onChange={(e)=>setConcreteData({...concreteData,projectRef:e.target.value})}/></label><label>DATA<input type="date" value={concreteData.date} onChange={(e)=>setConcreteData({...concreteData,date:e.target.value})}/></label><label className="wide">NOTAS FISCAIS<input value={concreteData.invoices} onChange={(e)=>setConcreteData({...concreteData,invoices:e.target.value})}/></label></div>{["Topografia","Formas","Armação"].map((group)=><div className="concrete-group" key={group}><h3>{group}</h3>{concreteItems.filter((item)=>concreteGroup(item.index)===group).map((item)=><article className="check-item" key={item.index}><div className="check-main"><b>{item.item}</b><p><span>Método</span>{item.method}</p><p><span>Critério</span>{item.criterion}</p></div><div className="answer-group triple">{["C","NC","NA"].map((value)=><button key={value} className={concreteAnswers[String(item.index)]===value?`selected ${value==="C"?"conform":value==="NC"?"nc":"na"}`:""} onClick={()=>setConcreteAnswers({...concreteAnswers,[String(item.index)]:value})}>{value === "NA" ? "N.A." : value === "NC" ? "N.C." : value}</button>)}</div></article>)}</div>)}</section>}

          <section className="quality-notes"><label>OBSERVAÇÕES<textarea value={observations} onChange={(e)=>setObservations(e.target.value)} rows={4} placeholder="Registre desvios, tratativas e informações complementares." /></label><div className="photo-head"><div><small>REGISTRO FOTOGRÁFICO</small><span>{photos.length} evidência(s)</span></div><button onClick={()=>fileInput.current?.click()}>ANEXAR FOTO</button><input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e)=>{const file=e.target.files?.[0];if(file)void uploadPhoto(file);e.target.value=""}}/></div><div className="photo-grid">{photos.map((photo)=><figure key={photo.id}><img src={photo.url} alt={photo.fileName}/><figcaption>{photo.fileName}<button onClick={()=>void removePhoto(photo.id)}>REMOVER</button></figcaption></figure>)}{!photos.length&&<p>Nenhuma evidência anexada. O registro será associado ao elemento IFC selecionado.</p>}</div></section>
          {message && <p className={`quality-message ${message.includes("Falha")||message.includes("Preencha")?"error":""}`}>{message}</p>}
          <footer className="quality-actions"><button className="secondary" onClick={()=>window.print()}>IMPRIMIR / PDF</button><button className="secondary" disabled={saving} onClick={()=>void saveRecord()}>{saving?"SALVANDO":"SALVAR REGISTRO"}</button><button className="release" disabled={!canRelease||saving} onClick={()=>void releaseConcrete()}>LIBERAR CONCRETAGEM</button></footer>
          <p className="signature-note">A liberação deve ser registrada por Engenheiro ou Mestre de Obra autorizado. O histórico fica vinculado ao GlobalId do elemento IFC.</p>
        </div>}
      </article>
    </section>

    <section className="quality-register"><header><div><p>HISTÓRICO DE CONTROLE</p><h2>Registros por elemento IFC</h2></div><span>{records.length} registro(s)</span></header><div className="register-table"><div className="register-row head"><span>Elemento</span><span>Tipo</span><span>RIS</span><span>Responsável</span><span>Atualização</span><span>Status</span></div>{records.map((record)=><button className="register-row" key={record.id} onClick={()=>openRecord(record)}><span><b>{record.elementName}</b><small>ID {record.elementExpressId}{record.phase?` · ${record.phase}`:""}</small></span><span>{record.elementType}</span><span>RIS-{record.templateCode}</span><span>{record.inspectorName||"Não informado"}</span><span>{record.updatedAt?new Date(record.updatedAt+"Z").toLocaleDateString("pt-BR"):"—"}</span><span><em className={`quality-status ${record.status}`}>{statusLabels[record.status]||record.status}</em></span></button>)}{!records.length&&<div className="register-empty">Os registros aparecerão aqui após o primeiro salvamento.</div>}</div></section>
  </main>;
}
