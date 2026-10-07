"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import budgetSource from "./budget-items.json";
import realOrdersSource from "./real-orders.json";
import {
  BUDGET_BASE_DATE,
  PROCUREMENT_REFERENCE_DATE,
  derivePackage,
  formatCurrency,
  formatDate,
  procurementPackages,
} from "./procurement-data";
import { CostControlModule } from "./CostControlModule";

type BudgetItem = {
  id: string; group: number | null; proposal: string; code: string; description: string;
  unit: string; quantity: number; unitCost: number; totalCost: number;
};

type IfcElement = {
  elementKey: string; expressId: number; globalId: string; elementType: string; elementName: string;
  phase: string; activity: string; wbs: string; plannedStart: string; plannedFinish: string;
};

type OrderLine = BudgetItem & { budgetItemId: string; orderedQuantity: number; orderedUnitPrice: number; application: string; committedValue?: number };
type OrderStatus = "draft" | "requested" | "quoted" | "approved" | "ordered" | "delivered" | "cancelled";
type ProcurementTab = "curva" | "custos" | "reais" | "pedidos" | "carteira" | "orcamento";
type ProcurementOrder = {
  id: string; orderNumber: string; supplier: string; status: OrderStatus; phase: string; scheduleActivity: string;
  wbs: string; requiredBy: string; notes: string; committedValue: number; updatedAt: string;
  lines: Array<{ id: string; budgetItemId: string; budgetCode: string; description: string; unit: string; budgetQuantity: number; budgetUnitCost: number; budgetTotalCost: number; orderedQuantity: number; orderedUnitPrice: number; application: string; committedValue: number }>;
  elements: Array<IfcElement & { id: string }>;
};

type OrderForm = {
  id: string; orderNumber: string; supplier: string; status: OrderStatus; phase: string;
  scheduleActivity: string; wbs: string; requiredBy: string; notes: string;
  lines: OrderLine[]; elements: IfcElement[];
};

type RealOperationalStatus = "emitir imediato" | "atenção" | "programar" | "sem data";
type RealCostCenterStatus = "correto" | "divergente" | "não confirmado";
type RealOrderItem = {
  id: string; sourceRow: number; costCenter: string; expectedCostCenter: string | null;
  costCenterStatus: RealCostCenterStatus; budgetItemId: string | null; code: string; description: string;
  unit: string; quantity: number | null; quantitySource: number | string | null; unitValue: number | null;
  totalValue: number | null; need: string; application: string; destination: string; scheduleActivity: string;
  activityStart: string | null; leadTimeDays: number | null; targetDate: string | null;
  operationalStatus: RealOperationalStatus; commercialStatus: string; sourceStatus: string; notes: string; alerts: string[];
};

type RealOrdersData = {
  source: string; proposal: string; sheet: string; sourceRange: string; referenceDate: string;
  missingCommercialFields: string[];
  summary: {
    itemCount: number; totalValue: number; budgetLinkedCount: number; emitImmediateCount: number;
    attentionCount: number; costCenterMismatchCount: number; costCenterUnconfirmedCount: number;
    dataIssueCount: number; commercialStatusMissingCount: number;
  };
  items: RealOrderItem[];
};

const emptyCatalog = budgetSource as { source: string; sourceDate: string; totalCost: number; itemCount: number; items: BudgetItem[] };
const realOrders = realOrdersSource as RealOrdersData;
const ACTIVE_COMMITMENT = new Set<OrderStatus>(["approved", "ordered", "delivered"]);
const statusLabels: Record<OrderStatus, string> = {
  draft: "Rascunho", requested: "Solicitado", quoted: "Cotado", approved: "Aprovado",
  ordered: "Pedido emitido", delivered: "Entregue", cancelled: "Cancelado",
};
const statusFlow = Object.keys(statusLabels) as OrderStatus[];
const modelPath = "";
const automaticPurchaseHeaders = ["Seq", "Grupo", "Item do orçamento", "Descrição", "Qtd", "Unidade", "Aplicação"];

function emptyForm(): OrderForm {
  return { id: "", orderNumber: "", supplier: "", status: "draft", phase: "", scheduleActivity: "", wbs: "", requiredBy: "", notes: "", lines: [], elements: [] };
}

function number(value: number, decimals = 2) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: decimals }).format(value);
}

function defaultApplication(phase: string, wbs: string, activity: string) {
  return [phase, wbs ? `WBS ${wbs}` : "", activity].filter(Boolean).join(" · ");
}

function csvCell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function csvQuantity(value: number) {
  return new Intl.NumberFormat("pt-BR", { useGrouping: false, maximumFractionDigits: 6 }).format(value);
}

function costCenterFor(group: number | null, code: string) {
  if (group !== null && Number.isFinite(group)) return String(group).padStart(3, "0");
  const prefix = code.split(".")[0];
  return /^\d+$/.test(prefix) ? prefix.padStart(3, "0") : "";
}

function automaticPurchaseCsv(lines: OrderLine[]) {
  const rows = lines
    .filter((line) => line.orderedQuantity > 0)
    .map((line, index) => [
      index + 1,
      costCenterFor(line.group, line.code),
      line.code,
      line.description.toLocaleUpperCase("pt-BR"),
      csvQuantity(line.orderedQuantity),
      line.unit.toLocaleUpperCase("pt-BR"),
      line.application.toLocaleUpperCase("pt-BR"),
    ]);
  return [automaticPurchaseHeaders, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n");
}

function safeFileToken(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "v2m";
}

function itemScore(item: BudgetItem, element: IfcElement | null) {
  const costWeight = item.totalCost;
  if (!element) return costWeight;
  const source = `${element.elementType} ${element.elementName}`.toLocaleLowerCase("pt-BR");
  const target = item.description.toLocaleLowerCase("pt-BR");
  const terms: string[] = [];
  if (/beam|viga/.test(source)) terms.push("viga", "concreto", "aço", "forma", "pré-mold");
  if (/column|pilar/.test(source)) terms.push("pilar", "concreto", "aço", "forma", "pré-mold");
  if (/slab|laje|floor|piso/.test(source)) terms.push("laje", "piso", "concreto", "tela", "cordoalha", "capeamento");
  if (/footing|pile|fund|sapata|bloco/.test(source)) terms.push("funda", "estaca", "bloco", "concreto", "aço", "forma");
  if (/roof|cover|cobertura/.test(source)) terms.push("cobertura", "estrutura metálica", "telha");
  return terms.reduce((score, term) => score + (target.includes(term) ? 100 : 0), 0) + costWeight;
}

export default function ComprasPage() {
  const [catalog, setCatalog] = useState(emptyCatalog);
  const [budgetNotice, setBudgetNotice] = useState("");
  useEffect(() => { fetch("/api/budget").then(r => r.ok ? r.json<any>() : null).then(data => { if (data?.items) setCatalog(data); }).catch(() => setBudgetNotice("Não foi possível consultar o orçamento salvo.")); }, []);
  async function importBudget(file: File) {
    try {
      const XLSX = await import("xlsx");
      const book = file.name.toLowerCase().endsWith(".csv") ? XLSX.read(await file.text(), {type:"string",raw:true}) : XLSX.read(await file.arrayBuffer(), {type:"array"});
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets[book.SheetNames[0]], {defval:""});
      const value = (row:Record<string,unknown>,keys:string[]) => Object.entries(row).find(([key]) => keys.includes(key.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase()))?.[1];
      const num = (v:unknown) => typeof v === "number" ? v : Number(String(v || "0").replace(/\s/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", "."));
      const items = rows.map((row,index) => {
        const code = String(value(row,["codigo","code","item"]) || "");
        const quantity = num(value(row,["quantidade","quantity","qtd"]));
        const unitCost = num(value(row,["preco unitario","custo unitario","unitcost"]));
        return {id:`V2M-${code}`,code,group:null,proposal:"",description:String(value(row,["descricao","description"]) || ""),unit:String(value(row,["unidade","unit"]) || ""),quantity,unitCost,totalCost:quantity*unitCost,sourceRow:index+2};
      }).filter(i=>i.code || i.description);
      if (!items.length || items.some(i=>!i.code||!i.description||!Number.isFinite(i.quantity)||i.quantity<0||!Number.isFinite(i.unitCost)||i.unitCost<0)||new Set(items.map(i=>i.code)).size!==items.length) throw new Error("Confira código único, descrição, quantidade e preço unitário em todas as linhas.");
      const next = {source:file.name,sourceDate:new Date().toISOString().slice(0,10),totalCost:items.reduce((sum,i)=>sum+i.totalCost,0),itemCount:items.length,items};
      const result=await fetch("/api/budget",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(next)});
      if(!result.ok) throw new Error("Não foi possível salvar o orçamento.");
      setCatalog(next);setBudgetNotice(`${items.length} itens importados e salvos.`);
    } catch(error) {setBudgetNotice(error instanceof Error?error.message:"Falha ao importar o orçamento.");}
  }
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const [tab, setTab] = useState<ProcurementTab>(() => ["curva", "custos", "reais", "pedidos", "carteira", "orcamento"].includes(requestedTab || "") ? requestedTab as ProcurementTab : "curva");
  const [orders, setOrders] = useState<ProcurementOrder[]>([]);
  const [form, setForm] = useState<OrderForm>(emptyForm);
  const [currentElement, setCurrentElement] = useState<IfcElement | null>(null);
  const [selectedPackageId, setSelectedPackageId] = useState("");
  const [showBim, setShowBim] = useState(false);
  const [query, setQuery] = useState("");
  const [realQuery, setRealQuery] = useState("");
  const [realStatusFilter, setRealStatusFilter] = useState<"todos" | RealOperationalStatus>("todos");
  const [realAlertFilter, setRealAlertFilter] = useState<"todos" | "com alertas" | "centro de custo" | "dados pendentes">("todos");
  const [phaseFilter, setPhaseFilter] = useState("Todas as fases");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function loadOrders() {
    setLoading(true);
    try {
      const response = await fetch("/api/procurement", { cache: "no-store" });
      const data = await response.json<any>() as { orders?: ProcurementOrder[]; error?: string };
      if (!response.ok) throw new Error(data.error || "Falha ao consultar pedidos.");
      setOrders(data.orders || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao consultar pedidos.");
    } finally { setLoading(false); }
  }

  useEffect(() => {
    let active = true;
    fetch("/api/procurement", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json<any>() as { orders?: ProcurementOrder[]; error?: string };
        if (!response.ok) throw new Error(data.error || "Falha ao consultar pedidos.");
        if (active) setOrders(data.orders || []);
      })
      .catch((error: unknown) => { if (active) setMessage(error instanceof Error ? error.message : "Falha ao consultar pedidos."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    function receive(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.data?.type !== "v2m-ifc-element-selected") return;
      const element = event.data.element as Record<string, unknown>;
      const expressId = Number(element.id);
      if (!Number.isFinite(expressId)) return;
      const selected: IfcElement = {
        elementKey: String(element.globalId || `${element.type || "IFC"}:${expressId}`), expressId,
        globalId: String(element.globalId || ""), elementType: String(element.type || "IFC ELEMENT"),
        elementName: String(element.name || `Elemento ${expressId}`), phase: String(element.phase || ""),
        activity: String(element.activity || ""), wbs: String(element.wbs || ""),
        plannedStart: String(element.startDate || ""), plannedFinish: String(element.finishDate || ""),
      };
      setCurrentElement(selected);
      setForm((previous) => ({
        ...previous, phase: previous.phase || selected.phase, scheduleActivity: previous.scheduleActivity || selected.activity,
        wbs: previous.wbs || selected.wbs, requiredBy: previous.requiredBy || selected.plannedStart,
      }));
    }
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, []);

  const consumedByItem = useMemo(() => {
    const result = new Map<string, number>();
    orders.filter((order) => order.status !== "cancelled").forEach((order) => order.lines.forEach((line) => result.set(line.budgetItemId, (result.get(line.budgetItemId) || 0) + Number(line.committedValue || 0))));
    return result;
  }, [orders]);
  const receivedByItem = useMemo(() => {
    const result = new Map<string, number>();
    realOrders.items.forEach((item) => {
      if (item.budgetItemId) result.set(item.budgetItemId, (result.get(item.budgetItemId) || 0) + (item.totalValue || 0));
    });
    return result;
  }, []);
  const orderValue = form.lines.reduce((sum, line) => sum + line.orderedQuantity * line.orderedUnitPrice, 0);
  const packages = useMemo(() => procurementPackages.map(derivePackage), []);
  const budgetItemByCode = useMemo(() => new Map(catalog.items.map((item) => [item.code, item])), [catalog]);
  const visiblePackages = packages.filter((item) => phaseFilter === "Todas as fases" || item.phase === phaseFilter || item.phase === "Geral");
  const selectedPackage = packages.find((item) => item.id === selectedPackageId) || null;
  const visibleBudget = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    return [...catalog.items]
      .filter((item) => !normalized || `${item.code} ${item.description} ${item.unit}`.toLocaleLowerCase("pt-BR").includes(normalized))
      .sort((a, b) => normalized ? b.totalCost - a.totalCost : itemScore(b, currentElement) - itemScore(a, currentElement))
      .slice(0, tab === "orcamento" ? catalog.itemCount : 24);
  }, [query, currentElement, tab, catalog]);
  const visibleRealOrders = useMemo(() => {
    const normalized = realQuery.trim().toLocaleLowerCase("pt-BR");
    return realOrders.items.filter((item) => {
      const matchesQuery = !normalized || `${item.costCenter} ${item.code} ${item.description} ${item.destination} ${item.scheduleActivity}`.toLocaleLowerCase("pt-BR").includes(normalized);
      const matchesStatus = realStatusFilter === "todos" || item.operationalStatus === realStatusFilter;
      const matchesAlert = realAlertFilter === "todos"
        || (realAlertFilter === "com alertas" && item.alerts.length > 0)
        || (realAlertFilter === "centro de custo" && item.costCenterStatus !== "correto")
        || (realAlertFilter === "dados pendentes" && item.alerts.some((alert) => /quantidade|valor|código/.test(alert)));
      return matchesQuery && matchesStatus && matchesAlert;
    });
  }, [realAlertFilter, realQuery, realStatusFilter]);

  function addBudgetItem(item: BudgetItem) {
    setForm((previous) => previous.lines.some((line) => line.budgetItemId === item.id) ? previous : {
      ...previous,
      lines: [...previous.lines, {
        ...item,
        budgetItemId: item.id,
        orderedQuantity: 1,
        orderedUnitPrice: item.unitCost,
        application: defaultApplication(previous.phase, previous.wbs, previous.scheduleActivity),
      }],
    });
  }

  function updateLine(id: string, field: "orderedQuantity" | "orderedUnitPrice", value: string) {
    setForm((previous) => ({ ...previous, lines: previous.lines.map((line) => line.budgetItemId === id ? { ...line, [field]: Math.max(0, Number(value) || 0) } : line) }));
  }

  function updateLineApplication(id: string, application: string) {
    setForm((previous) => ({ ...previous, lines: previous.lines.map((line) => line.budgetItemId === id ? { ...line, application } : line) }));
  }

  function downloadAutomaticPurchase(lines: OrderLine[], reference: string) {
    const readyLines = lines.filter((line) => line.orderedQuantity > 0);
    if (readyLines.length === 0) {
      setMessage("Informe ao menos uma quantidade maior que zero antes de gerar o CSV.");
      return;
    }
    const csv = automaticPurchaseCsv(readyLines);
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `solicitacao-${safeFileToken(reference)}-itens.csv`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setMessage(`${readyLines.length} item(ns) exportado(s) no padrão do Compras Automático.`);
  }

  function buildPackageRequest(pkg: ReturnType<typeof derivePackage>) {
    const firstTask = pkg.tasks[0];
    const application = defaultApplication(pkg.phase, firstTask?.wbs || "", firstTask?.name || pkg.name);
    const lines = pkg.budgetItemCodes
      .map((code) => budgetItemByCode.get(code))
      .filter((item): item is BudgetItem => Boolean(item))
      .map((item) => ({ ...item, budgetItemId: item.id, orderedQuantity: 0, orderedUnitPrice: item.unitCost, application }));
    setForm({
      ...emptyForm(),
      phase: pkg.phase,
      scheduleActivity: firstTask?.name || pkg.name,
      wbs: firstTask?.wbs || "",
      requiredBy: pkg.requiredBy || "",
      notes: `Pacote ${pkg.id} · ${pkg.name} · ${pkg.lot}`,
      lines,
    });
    setSelectedPackageId(pkg.id);
    setTab("pedidos");
    setMessage(`${pkg.id} estruturado com ${lines.length} item(ns). Informe as quantidades da solicitação e baixe o CSV.`);
    window.scrollTo({ top: 225, behavior: "smooth" });
  }

  function linkCurrentElement() {
    if (!currentElement) return;
    setForm((previous) => previous.elements.some((item) => item.elementKey === currentElement.elementKey) ? previous : { ...previous, elements: [...previous.elements, currentElement] });
  }

  function editOrder(order: ProcurementOrder) {
    const lineById = new Map(catalog.items.map((item) => [item.id, item]));
    setForm({
      id: order.id, orderNumber: order.orderNumber, supplier: order.supplier, status: order.status,
      phase: order.phase || "", scheduleActivity: order.scheduleActivity || "", wbs: order.wbs || "",
      requiredBy: order.requiredBy || "", notes: order.notes || "",
      lines: order.lines.map((line) => ({
        ...(lineById.get(line.budgetItemId) || { id: line.budgetItemId, group: 0, proposal: "", code: line.budgetCode, description: line.description, unit: line.unit, quantity: line.budgetQuantity, unitCost: line.budgetUnitCost, totalCost: line.budgetTotalCost }),
        budgetItemId: line.budgetItemId, orderedQuantity: line.orderedQuantity, orderedUnitPrice: line.orderedUnitPrice,
        application: line.application || defaultApplication(order.phase || "", order.wbs || "", order.scheduleActivity || ""),
      })),
      elements: order.elements.map((element) => ({ ...element })),
    });
    setTab("pedidos");
    window.scrollTo({ top: 225, behavior: "smooth" });
  }

  function downloadSavedOrder(order: ProcurementOrder) {
    const fallbackApplication = defaultApplication(order.phase || "", order.wbs || "", order.scheduleActivity || "");
    const lines = order.lines.map((line) => {
      const budgetItem = budgetItemByCode.get(line.budgetCode);
      return {
        ...(budgetItem || {
          id: line.budgetItemId,
          group: Number(line.budgetCode.split(".")[0]) || 0,
          proposal: "",
          code: line.budgetCode,
          description: line.description,
          unit: line.unit,
          quantity: line.budgetQuantity,
          unitCost: line.budgetUnitCost,
          totalCost: line.budgetTotalCost,
        }),
        budgetItemId: line.budgetItemId,
        orderedQuantity: line.orderedQuantity,
        orderedUnitPrice: line.orderedUnitPrice,
        application: line.application || fallbackApplication,
      };
    });
    downloadAutomaticPurchase(lines, order.orderNumber || order.id);
  }

  async function saveOrder() {
    setSaving(true); setMessage("");
    try {
      const payload = {
        ...form,
        lines: form.lines.map((line) => ({
          budgetItemId: line.budgetItemId, budgetCode: line.code, description: line.description, unit: line.unit,
          budgetQuantity: line.quantity, budgetUnitCost: line.unitCost, budgetTotalCost: line.totalCost,
          orderedQuantity: line.orderedQuantity, orderedUnitPrice: line.orderedUnitPrice, application: line.application,
        })),
      };
      const response = await fetch("/api/procurement", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json<any>() as { error?: string; orderNumber?: string };
      if (!response.ok) throw new Error(data.error || "Falha ao salvar o pedido.");
      setMessage(`${data.orderNumber || form.orderNumber} salvo e vinculado ao controle 5D.`);
      setForm(emptyForm()); setCurrentElement(null);
      await loadOrders();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao salvar o pedido.");
    } finally { setSaving(false); }
  }

  return (
    <div className="app-shell procurement-shell">
      <aside className="sidebar">
        <div className="side-brand"><Image src="/v2m-brand.svg" alt="V2M ENGENHARIA" width={112} height={45}/><span>V2M<br/>GESTÃO 5D</span></div>
        <div className="project-card"><div><b>V2M ENGENHARIA</b><small>Gestão integrada de obras</small></div></div>
        <p className="nav-label">OBRA</p>
        <nav><a href="/">Visão geral</a><a href="/planejamento">Cronograma</a><a href="/compras?tab=curva">Custos / Curva S</a><a className="active" href="/compras">Suprimentos 5D</a><a href="/qualidade">Concreto</a><a href="/planejamento#modelo">BIM 4D / 5D</a></nav>
        <p className="nav-label">GESTÃO</p>
        <nav><a href="/qualidade">Qualidade</a><a href="/#alertas">SMS</a><a href="/diario">Diário de Obra</a></nav>
        <div className="side-foot">V2M · FONTE ÚNICA<small>Orçamento · Planejamento · BIM</small></div>
      </aside>

      <main className="procurement-main">
        <header className="command-bar procurement-command">
          <div><small>V2M / V2M ENGENHARIA /</small><b> SUPRIMENTOS 5D</b></div>
          <div className="command-actions">
            <label><span>FRENTE</span><select value={phaseFilter} onChange={(event) => setPhaseFilter(event.target.value)}><option>Todas as fases</option><option>Geral</option></select></label>
            <button onClick={() => window.print()}>EXPORTAR</button>
          </div>
        </header>

        <nav className="procurement-module-nav" aria-label="Módulos de suprimentos">
          <button className={tab === "curva" ? "active" : ""} onClick={() => setTab("curva")}>CURVA S</button>
          <button className={tab === "custos" ? "active" : ""} onClick={() => setTab("custos")}>CUSTOS / MEDIÇÕES</button>
          <button className={tab === "pedidos" ? "active" : ""} onClick={() => setTab("pedidos")}>PEDIDO / CSV</button>
          <button className={tab === "carteira" ? "active" : ""} onClick={() => setTab("carteira")}>COMPOSIÇÕES <span>{packages.length}</span></button>
          <button className={tab === "reais" ? "active" : ""} onClick={() => setTab("reais")}>MAPA RECEBIDO <span>{realOrders.summary.itemCount}</span></button>
          <button className={tab === "orcamento" ? "active" : ""} onClick={() => setTab("orcamento")}>ORÇAMENTO <span>{catalog.itemCount}</span></button>
        </nav>

        {message && <aside className="procurement-message"><span>{message}</span><button onClick={() => setMessage("")}>FECHAR</button></aside>}

        {(tab === "curva" || tab === "custos") && <CostControlModule view={tab} orders={orders} budgetTotal={catalog.totalCost} budgetSource={`${catalog.source} · ${formatDate(catalog.sourceDate)}`}/>}

        {tab === "reais" && <section className="real-orders-register">
          <header><div><p>MAPA AUXILIAR · FORA DAS DUAS FONTES RECONCILIADAS</p><h2>Itens recebidos sem confirmação no ERP</h2><small>{realOrders.source} · {realOrders.sheet} · {realOrders.sourceRange}</small></div><span>{visibleRealOrders.length} DE {realOrders.summary.itemCount} ITENS</span></header>

          <aside className="real-orders-source-note">
            <div><b>MAPA NÃO É PEDIDO, COMPROMISSO NEM SALDO</b><span>A planilha não contém {realOrders.missingCommercialFields.join(", ")}. Ela permanece apenas como referência auxiliar e não altera o valor-fonte dos pacotes do plano de compras.</span></div>
            <em>{realOrders.summary.commercialStatusMissingCount} SEM STATUS COMERCIAL</em>
          </aside>

          <section className="real-orders-audit">
            <article><small>VINCULADOS AO ORÇAMENTO</small><b>{realOrders.summary.budgetLinkedCount} / {realOrders.summary.itemCount}</b><span>conciliação pelo código do item</span></article>
            <article className="attention"><small>CENTRO DE CUSTO</small><b>{realOrders.summary.costCenterMismatchCount} divergente(s)</b><span>{realOrders.summary.costCenterUnconfirmedCount} sem confirmação na base oficial</span></article>
            <article className="danger"><small>EMISSÃO IMEDIATA</small><b>{realOrders.summary.emitImmediateCount}</b><span>data-alvo vencida na referência atual</span></article>
            <article><small>QUALIDADE CADASTRAL</small><b>{realOrders.summary.dataIssueCount}</b><span>itens com código, quantidade, valor ou centro a revisar</span></article>
          </section>

          <div className="real-orders-controls">
            <label className="real-orders-search"><span>BUSCAR</span><input value={realQuery} onChange={(event) => setRealQuery(event.target.value)} placeholder="Centro, código, insumo, destino ou atividade"/></label>
            <label><span>STATUS OPERACIONAL</span><select value={realStatusFilter} onChange={(event) => setRealStatusFilter(event.target.value as "todos" | RealOperationalStatus)}><option value="todos">Todos</option><option value="emitir imediato">Emitir imediato</option><option value="atenção">Atenção</option><option value="programar">Programar</option><option value="sem data">Sem data</option></select></label>
            <label><span>ALERTAS</span><select value={realAlertFilter} onChange={(event) => setRealAlertFilter(event.target.value as typeof realAlertFilter)}><option value="todos">Todos</option><option value="com alertas">Com alertas</option><option value="centro de custo">Centro de custo</option><option value="dados pendentes">Dados pendentes</option></select></label>
          </div>

          <div className="procurement-table-wrap"><table className="real-orders-table"><thead><tr><th>Centro de custo</th><th>Item</th><th>Insumo / necessidade</th><th>Quantidade</th><th>Valor do mapa</th><th>Destino / aplicação</th><th>Planejamento</th><th>Status operacional</th><th>Status comercial</th><th>Alertas</th></tr></thead><tbody>
            {visibleRealOrders.map((item) => <tr key={item.id} className={item.alerts.length ? "has-alert" : ""}>
              <td><b>{item.costCenter || "—"}</b><span className={`cost-center-status ${safeFileToken(item.costCenterStatus)}`}>{item.costCenterStatus}</span>{item.expectedCostCenter && item.expectedCostCenter !== item.costCenter && <small>esperado {item.expectedCostCenter}</small>}</td>
              <td><b>{item.code && item.code !== "—" ? item.code : "SEM CÓDIGO"}</b><small>{item.budgetItemId ? "orçamento vinculado" : `linha ${item.sourceRow} sem vínculo`}</small></td>
              <td><b>{item.description}</b><small>{item.need}</small></td>
              <td><b>{item.quantitySource ?? "—"} {item.unit}</b><small>{item.unitValue === null ? "preço unitário pendente" : `${formatCurrency(item.unitValue)} / ${item.unit}`}</small></td>
              <td><b>{formatCurrency(item.totalValue)}</b><small>base recebida</small></td>
              <td><b>{item.destination || "Sem destino"}</b><small>{item.application}</small></td>
              <td><b>{formatDate(item.targetDate)}</b><small>{item.leadTimeDays ?? "—"} dias antes · início {formatDate(item.activityStart)}</small><em>{item.scheduleActivity}</em></td>
              <td><span className={`real-order-status ${safeFileToken(item.operationalStatus)}`}>{item.operationalStatus}</span><small>recalculado em {formatDate(realOrders.referenceDate)}</small></td>
              <td><span className="commercial-status-missing">{item.commercialStatus}</span><small>ERP não informado</small></td>
              <td>{item.alerts.length === 0 ? <span className="data-ok">sem divergência</span> : <div className="data-alerts">{item.alerts.map((alert) => <span key={alert}>{alert}</span>)}</div>}</td>
            </tr>)}
            {visibleRealOrders.length === 0 && <tr><td colSpan={10} className="procurement-empty">Nenhum item corresponde aos filtros selecionados.</td></tr>}
          </tbody></table></div>
        </section>}

        {tab === "pedidos" && <>
          <section className="order-workspace order-workspace-single">
            <div className="order-editor">
              <header><div><p>{form.id ? "EDIÇÃO DO PEDIDO" : "NOVO PEDIDO"}</p><h2>{form.orderNumber || "Pedido vinculado à obra"}</h2></div>{form.id && <button onClick={() => setForm(emptyForm())}>NOVO</button>}</header>

              <section className="composition-selector">
                <header><div><small>COMPOSIÇÕES DA PLANILHA ORÇAMENTO DA OBRA</small><b>Escolha o pacote antes de montar os itens</b></div><label><span>PACOTE / EAP</span><select value={selectedPackageId} onChange={(event) => setSelectedPackageId(event.target.value)}><option value="">Selecione uma composição</option>{visiblePackages.map((item) => <option key={item.id} value={item.id}>{item.id} · EAP {item.eapCode} · {item.name} · {item.phase}</option>)}</select></label></header>
                {selectedPackage ? <div className="composition-selector-row">
                  <div><small>ESCOPO</small><b>{selectedPackage.scopeSummary}</b><span>{selectedPackage.quantities.join(" · ")}</span></div>
                  <div><small>PLANEJAMENTO</small><b>{selectedPackage.requiredBy ? `Necessidade ${formatDate(selectedPackage.requiredBy)}` : "Data a programar"}</b><span>{selectedPackage.alertDate ? `Comprar até ${formatDate(selectedPackage.alertDate)}` : "Sem alerta até validar o cronograma"}</span></div>
                  <div><small>ORÇADO / VÍNCULO</small><b>{formatCurrency(selectedPackage.budgetedValue)}</b><span>EAP {selectedPackage.eapCode} · confiança {selectedPackage.confidence}</span></div>
                  <button onClick={() => buildPackageRequest(selectedPackage)}>USAR COMPOSIÇÃO</button>
                </div> : <p>Importe o orçamento da obra para selecionar os itens.</p>}
              </section>

              <div className="order-fields">
                <label className="wide"><span>FORNECEDOR / CONTRATADO</span><input value={form.supplier} onChange={(event) => setForm({ ...form, supplier: event.target.value })} placeholder="Razão social ou nome do fornecedor"/></label>
                <label><span>STATUS</span><select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as OrderStatus })}>{statusFlow.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></label>
                <label><span>DATA DE NECESSIDADE</span><input type="date" value={form.requiredBy} onChange={(event) => setForm({ ...form, requiredBy: event.target.value })}/></label>
                <label><span>FRENTE</span><input value={form.phase} onChange={(event) => setForm({ ...form, phase: event.target.value })} placeholder="Frente de serviço"/></label>
                <label><span>WBS / EAP PLANEJAMENTO</span><input value={form.wbs} onChange={(event) => setForm({ ...form, wbs: event.target.value })} placeholder="3.12"/></label>
                <label className="wide"><span>ATIVIDADE CONSUMIDORA</span><input value={form.scheduleActivity} onChange={(event) => setForm({ ...form, scheduleActivity: event.target.value })} placeholder="Atividade que determina a necessidade"/></label>
              </div>

              <div className="budget-picker">
                <header><div><small>LINHAS DO ORÇAMENTO</small><b>Selecione os itens que compõem o pedido</b></div><label><span>BUSCAR</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Código ou descrição"/></label></header>
                <div className="budget-picker-list">
                  {visibleBudget.map((item) => <button key={item.id} onClick={() => addBudgetItem(item)} disabled={form.lines.some((line) => line.budgetItemId === item.id)}><span><b>{item.code}</b><small>{item.description}</small></span><em>{formatCurrency(item.totalCost)}</em></button>)}
                </div>
              </div>

              <div className="order-lines">
                <header><small>COMPOSIÇÃO DO PEDIDO</small><span>{form.lines.length} itens</span></header>
                {form.lines.length === 0 ? <p>Selecione uma linha do orçamento acima.</p> : form.lines.map((line) => {
                  const lineTotal = line.orderedQuantity * line.orderedUnitPrice;
                  return <article key={line.budgetItemId}>
                    <div><b>{line.code} · {line.description}</b><small>Grupo {costCenterFor(line.group, line.code) || "não confirmado"} · Orçado: {number(line.quantity)} {line.unit} × {formatCurrency(line.unitCost)} = {formatCurrency(line.totalCost)}</small></div>
                    <label><span>QTD.</span><input type="number" min="0" step="any" value={line.orderedQuantity} onChange={(event) => updateLine(line.budgetItemId, "orderedQuantity", event.target.value)}/></label>
                    <label><span>PREÇO UNIT.</span><input type="number" min="0" step="any" value={line.orderedUnitPrice} onChange={(event) => updateLine(line.budgetItemId, "orderedUnitPrice", event.target.value)}/></label>
                    <strong>{formatCurrency(lineTotal)}</strong>
                    <button onClick={() => setForm({ ...form, lines: form.lines.filter((item) => item.budgetItemId !== line.budgetItemId) })}>REMOVER</button>
                    <label className="line-application"><span>APLICAÇÃO · COLUNA DO COMPRAS AUTOMÁTICO</span><input value={line.application} onChange={(event) => updateLineApplication(line.budgetItemId, event.target.value)} placeholder="Frente, atividade ou destino do material"/></label>
                  </article>;
                })}
              </div>

              <div className="linked-elements">
                <header><small>ELEMENTOS IFC VINCULADOS</small><div><span>{form.elements.length}</span><button onClick={() => setShowBim((value) => !value)}>{showBim ? "FECHAR MODELO" : "ABRIR MODELO IFC"}</button></div></header>
                {showBim && <div className="order-bim-inline">
                  <iframe title="Modelo IFC para vínculo de suprimentos" src={`/bim-viewer/index.html?model=${encodeURIComponent(modelPath)}&mode=procurement&v=10`}/>
                  <div className={`selected-element ${currentElement ? "ready" : ""}`}>{currentElement ? <><div><small>ELEMENTO SELECIONADO</small><b>{currentElement.elementName}</b><span>{currentElement.elementType} · ID {currentElement.expressId}{currentElement.wbs ? ` · WBS ${currentElement.wbs}` : ""}</span></div><button onClick={linkCurrentElement} disabled={form.elements.some((item) => item.elementKey === currentElement.elementKey)}>{form.elements.some((item) => item.elementKey === currentElement.elementKey) ? "VINCULADO" : "VINCULAR AO PEDIDO"}</button></> : <p>Selecione um elemento no modelo.</p>}</div>
                </div>}
                {form.elements.length === 0 ? <p>Abra o modelo somente quando precisar vincular elementos BIM.</p> : form.elements.map((element) => <article key={element.elementKey}><div><b>{element.elementName}</b><small>{element.elementType} · ID {element.expressId}{element.activity ? ` · ${element.activity}` : ""}</small></div><button onClick={() => setForm({ ...form, elements: form.elements.filter((item) => item.elementKey !== element.elementKey) })}>REMOVER</button></article>)}
              </div>

              <label className="order-notes"><span>OBSERVAÇÕES / CONDIÇÕES DO PEDIDO</span><textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Condição comercial, prazo de entrega, frente de serviço ou observação técnica."/></label>
              <footer className="order-total"><div><small>VALOR DESTE PEDIDO</small><b>{formatCurrency(orderValue)}</b><span>{form.lines.length} linha(s) · {form.elements.length} elemento(s) BIM</span></div><div className="order-total-actions"><button className="secondary" onClick={() => downloadAutomaticPurchase(form.lines, form.orderNumber || form.id || form.notes || "v2m")}>BAIXAR CSV COMPRAS</button><button disabled={saving} onClick={() => void saveOrder()}>{saving ? "SALVANDO..." : form.id ? "ATUALIZAR PEDIDO" : "SALVAR PEDIDO"}</button></div></footer>
            </div>
          </section>

          <section className="orders-register">
            <header><div><p>BASE ÚNICA DE COMPROMISSOS</p><h2>Pedidos e contratos vinculados</h2></div><span>{loading ? "ATUALIZANDO" : `${orders.length} REGISTROS`}</span></header>
            <div className="procurement-table-wrap"><table><thead><tr><th>Pedido / fornecedor</th><th>Planejamento</th><th>Orçamento</th><th>IFC</th><th>Valor</th><th>Status</th><th></th></tr></thead><tbody>
              {orders.map((order) => <tr key={order.id}><td><b>{order.orderNumber}</b><small>{order.supplier}</small></td><td><b>{order.wbs || "Sem WBS"}</b><small>{order.requiredBy ? `Necessidade ${formatDate(order.requiredBy)}` : order.scheduleActivity || "Sem data"}</small></td><td><b>{order.lines.length} linha(s)</b><small>{order.lines.slice(0, 2).map((line) => line.budgetCode).join(" · ")}</small></td><td><b>{order.elements.length} elemento(s)</b><small>{order.elements[0]?.elementName || "Sem vínculo"}</small></td><td><b>{formatCurrency(order.committedValue)}</b><small>{ACTIVE_COMMITMENT.has(order.status) ? "custo comprometido" : "valor previsto"}</small></td><td><span className={`order-status ${order.status}`}>{statusLabels[order.status]}</span></td><td><div className="order-actions"><button onClick={() => downloadSavedOrder(order)}>CSV</button><button onClick={() => editOrder(order)}>ABRIR</button></div></td></tr>)}
              {!loading && orders.length === 0 && <tr><td colSpan={7} className="procurement-empty">Nenhum pedido registrado. O primeiro pedido pode ser montado acima.</td></tr>}
            </tbody></table></div>
          </section>
        </>}

        {tab === "carteira" && <section className="procurement-table-panel composition-register">
          <header><div><p>PLANILHA ORÇAMENTO DA OBRA + EAP PRELIMINAR</p><h2>Composições e pacotes de compra</h2></div><span>{visiblePackages.length} DE {packages.length} PACOTES</span></header>
          <div className="procurement-table-wrap"><table className="composition-table"><thead><tr><th>Composição</th><th>EAP / IAP</th><th>Escopo / quantidades</th><th>Necessidade / alerta</th><th>Valor</th><th>Vínculo</th><th></th></tr></thead><tbody>{visiblePackages.map((item) => <tr key={item.id}>
            <td><b>{item.name}</b><small>{item.id} · {item.lot} · {item.phase}</small></td>
            <td><b>EAP {item.eapCode}</b><small>{item.budgetItemCodes.map((code) => `IAP ${code}`).join(" · ") || "IAP pendente"}</small></td>
            <td><b>{item.scopeSummary}</b><small>{item.quantities.join(" · ")}</small><details><summary>FONTES</summary><p>{item.costSource}</p><p>{item.scheduleSource}</p></details></td>
            <td><b>{item.requiredBy ? formatDate(item.requiredBy) : "A PROGRAMAR"}</b><small>{item.alertDate ? `comprar até ${formatDate(item.alertDate)}` : "alerta suspenso até validar a data"}</small></td>
            <td><b>{formatCurrency(item.budgetedValue)}</b><small>custo completo da EAP</small></td>
            <td><span className={`confidence-chip ${safeFileToken(item.confidence)}`}>{item.confidence}</span><small>{item.tasks.length} atividade(s) vinculada(s)</small></td>
            <td><button className="package-csv-button" onClick={() => buildPackageRequest(item)}>USAR NO PEDIDO<small>{item.budgetItemCodes.length} item(ns)</small></button></td>
          </tr>)}</tbody></table></div>
        </section>}

        {tab === "orcamento" && <section className="budget-register">
          <header><div><p>PLANILHA ORÇAMENTO DA OBRA</p><h2>Quantidades e orçamento por item</h2><label className="v2m-button">Importar orçamento<input type="file" accept=".xlsx,.xls,.csv" style={{display:"none"}} onChange={e=>{const file=e.target.files?.[0];if(file)void importBudget(file);e.target.value="";}}/></label><p>Colunas na primeira aba: Código, Descrição, Unidade, Quantidade, Preço unitário.</p><p role="status">{budgetNotice}</p><small>Base importada em {catalog.sourceDate ? formatDate(catalog.sourceDate) : "—"} · preços e total geral A_CONFIRMAR</small></div><label><span>BUSCAR ITEM</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Código, descrição ou unidade"/></label></header>
          <div className="procurement-table-wrap"><table><thead><tr><th>Grupo</th><th>Código</th><th>Descrição</th><th>Unidade</th><th>Quantidade</th><th>Custo unitário</th><th>Orçado</th><th>Mapa recebido</th><th>Pedidos V2M</th><th>Saldo após mapa</th></tr></thead><tbody>{visibleBudget.map((item) => {
            const used = consumedByItem.get(item.id) || 0;
            const received = receivedByItem.get(item.id) || 0;
            const hasBasePrice = catalog.totalCost > 0 || item.unitCost > 0 || item.totalCost > 0;
            return <tr key={item.id}><td>{costCenterFor(item.group, item.code) || "—"}</td><td><b>{item.code}</b></td><td>{item.description}</td><td>{item.unit}</td><td>{number(item.quantity, 3)}</td><td>{hasBasePrice ? formatCurrency(item.unitCost) : "A CONFIRMAR"}</td><td><b>{hasBasePrice ? formatCurrency(item.totalCost) : "A CONFIRMAR"}</b></td><td>{formatCurrency(received)}</td><td>{formatCurrency(used)}</td><td className={hasBasePrice && item.totalCost - received < 0 ? "negative" : ""}><b>{hasBasePrice ? formatCurrency(item.totalCost - received) : "A CONFIRMAR"}</b></td></tr>;
          })}</tbody></table></div>
        </section>}

        <footer className="statusbar procurement-statusbar"><p className="online">FONTES DA OBRA</p><p>{catalog.itemCount ? `${catalog.itemCount} ITENS IMPORTADOS` : "ORÇAMENTO A IMPORTAR"}</p><p>CRONOGRAMA · PREMISSA / A_CONFIRMAR</p><p>ALERTA · D − 30 CORRIDOS</p><p className="last">REFERÊNCIA EXECUTIVA · {formatDate(PROCUREMENT_REFERENCE_DATE)}</p></footer>
      </main>
    </div>
  );
}
