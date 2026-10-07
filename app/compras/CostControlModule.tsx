"use client";

import { useEffect, useMemo, useState } from "react";
import { formatCurrency, formatDate } from "./procurement-data";

type OrderStatus = "draft" | "requested" | "quoted" | "approved" | "ordered" | "delivered" | "cancelled";

type CostOrder = {
  id: string;
  orderNumber: string;
  supplier: string;
  status: OrderStatus;
  wbs: string;
  scheduleActivity: string;
  requiredBy: string;
  committedValue: number;
  lines: Array<{
    budgetCode: string;
    description: string;
    budgetQuantity: number;
    budgetUnitCost: number;
    budgetTotalCost: number;
    orderedQuantity: number;
  }>;
};

type CostControl = {
  orderId: string;
  forecastValue: number;
  measuredValue: number;
  paidValue: number;
  paymentDue: string;
  notes: string;
  updatedAt?: string;
};

type FinancialPeriod = {
  period: string;
  plannedValue: number;
  measuredValue: number;
  paidValue: number;
  forecastValue: number;
  plannedPhysicalPercent: number;
  actualPhysicalPercent: number;
  notes: string;
  updatedAt?: string;
};

type CurvePoint = { period: string; [key: string]: string | number };
type CurveSeries = { key: string; label: string; color: string; dashed?: boolean };

const ACTIVE_COMMITMENT = new Set<OrderStatus>(["approved", "ordered", "delivered"]);
const BASE_PERIODS = ["2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02"];
const statusLabel: Record<OrderStatus, string> = {
  draft: "Rascunho",
  requested: "Solicitado",
  quoted: "Cotado",
  approved: "Aprovado",
  ordered: "Pedido emitido",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

function blankControl(orderId: string): CostControl {
  return { orderId, forecastValue: 0, measuredValue: 0, paidValue: 0, paymentDue: "", notes: "" };
}

function blankPeriod(period: string): FinancialPeriod {
  return {
    period,
    plannedValue: 0,
    measuredValue: 0,
    paidValue: 0,
    forecastValue: 0,
    plannedPhysicalPercent: 0,
    actualPhysicalPercent: 0,
    notes: "",
  };
}

function periodLabel(period: string) {
  const [year, month] = period.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, 1)))
    .replace(" de ", "/")
    .replace(".", "")
    .toLocaleUpperCase("pt-BR");
}

function compactCurrency(value: number) {
  if (Math.abs(value) >= 1_000_000) return `R$ ${(value / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (Math.abs(value) >= 1_000) return `R$ ${(value / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
  return formatCurrency(value);
}

function proportionalBudget(order: CostOrder) {
  return order.lines.reduce((sum, line) => {
    const unitBudget = Number(line.budgetUnitCost) || (Number(line.budgetQuantity) > 0 ? Number(line.budgetTotalCost) / Number(line.budgetQuantity) : 0);
    return sum + unitBudget * Number(line.orderedQuantity || 0);
  }, 0);
}

function cumulative(rows: FinancialPeriod[], field: keyof FinancialPeriod) {
  let total = 0;
  return rows.map((row) => {
    total += Number(row[field]) || 0;
    return total;
  });
}

function cumulativeNumbers(values: number[]) {
  let total = 0;
  return values.map((value) => {
    total += value;
    return total;
  });
}

function CurveChart({ title, subtitle, rows, series, maximum, percent = false }: {
  title: string;
  subtitle: string;
  rows: CurvePoint[];
  series: CurveSeries[];
  maximum?: number;
  percent?: boolean;
}) {
  const width = 840;
  const height = 300;
  const pad = { top: 22, right: 28, bottom: 44, left: 74 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const observedMax = Math.max(0, ...rows.flatMap((row) => series.map((item) => Number(row[item.key]) || 0)));
  const yMax = Math.max(1, maximum || observedMax * 1.08);
  const x = (index: number) => pad.left + (rows.length <= 1 ? 0 : index * plotWidth / (rows.length - 1));
  const y = (value: number) => pad.top + plotHeight - Math.min(yMax, Math.max(0, value)) * plotHeight / yMax;
  const grid = [0, .25, .5, .75, 1];

  return <article className="curve-chart-card">
    <header><div><small>CURVA S ACUMULADA</small><h3>{title}</h3><p>{subtitle}</p></div></header>
    <div className="curve-legend">{series.map((item) => <span key={item.key}><i style={{ background: item.color }}/>{item.label}</span>)}</div>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title}: ${series.map((item) => item.label).join(", ")}`}>
      <title>{title}</title>
      {grid.map((ratio) => {
        const value = yMax * ratio;
        return <g key={ratio}>
          <line x1={pad.left} x2={width - pad.right} y1={y(value)} y2={y(value)} className="curve-grid-line"/>
          <text x={pad.left - 12} y={y(value) + 4} textAnchor="end" className="curve-axis-label">{percent ? `${Math.round(value)}%` : compactCurrency(value)}</text>
        </g>;
      })}
      {rows.map((row, index) => <g key={row.period}>
        <line x1={x(index)} x2={x(index)} y1={pad.top} y2={height - pad.bottom} className="curve-month-line"/>
        <text x={x(index)} y={height - 18} textAnchor="middle" className="curve-month-label">{periodLabel(String(row.period))}</text>
      </g>)}
      {series.map((item) => {
        const points = rows.map((row, index) => `${x(index)},${y(Number(row[item.key]) || 0)}`).join(" ");
        return <g key={item.key}>
          <polyline points={points} fill="none" stroke={item.color} strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={item.dashed ? "10 8" : undefined}/>
          {rows.map((row, index) => <circle key={`${item.key}-${row.period}`} cx={x(index)} cy={y(Number(row[item.key]) || 0)} r="3.5" fill="#fff" stroke={item.color} strokeWidth="2"/>)}
        </g>;
      })}
    </svg>
  </article>;
}

export function CostControlModule({ view, orders, budgetTotal, budgetSource }: {
  view: "curva" | "custos";
  orders: CostOrder[];
  budgetTotal: number;
  budgetSource: string;
}) {
  const [controls, setControls] = useState<Record<string, CostControl>>({});
  const [periods, setPeriods] = useState<Record<string, FinancialPeriod>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState("");
  const [message, setMessage] = useState("");

  async function loadData() {
    setLoading(true);
    try {
      const response = await fetch("/api/cost-control", { cache: "no-store" });
      const data = await response.json<any>() as { controls?: CostControl[]; periods?: FinancialPeriod[]; error?: string };
      if (!response.ok) throw new Error(data.error || "Falha ao consultar o controle financeiro.");
      setControls(Object.fromEntries((data.controls || []).map((item) => [item.orderId, { ...blankControl(item.orderId), ...item }])));
      setPeriods(Object.fromEntries((data.periods || []).map((item) => [item.period, { ...blankPeriod(item.period), ...item }])));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao consultar o controle financeiro.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    fetch("/api/cost-control", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json<any>() as { controls?: CostControl[]; periods?: FinancialPeriod[]; error?: string };
        if (!response.ok) throw new Error(data.error || "Falha ao consultar o controle financeiro.");
        if (!active) return;
        setControls(Object.fromEntries((data.controls || []).map((item) => [item.orderId, { ...blankControl(item.orderId), ...item }])));
        setPeriods(Object.fromEntries((data.periods || []).map((item) => [item.period, { ...blankPeriod(item.period), ...item }])));
      })
      .catch((error: unknown) => { if (active) setMessage(error instanceof Error ? error.message : "Falha ao consultar o controle financeiro."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const periodKeys = useMemo(() => {
    const keys = new Set(BASE_PERIODS);
    Object.keys(periods).forEach((period) => keys.add(period));
    Object.values(controls).forEach((control) => { if (control.paymentDue) keys.add(control.paymentDue.slice(0, 7)); });
    return [...keys].sort();
  }, [controls, periods]);

  const periodRows = useMemo(() => periodKeys.map((period) => periods[period] || blankPeriod(period)), [periodKeys, periods]);
  const activeOrders = useMemo(() => orders.filter((order) => ACTIVE_COMMITMENT.has(order.status)), [orders]);
  const activeCommitted = activeOrders.reduce((sum, order) => sum + Number(order.committedValue || 0), 0);
  const activeScopeBudget = activeOrders.reduce((sum, order) => sum + proportionalBudget(order), 0);
  const activeForecast = activeOrders.reduce((sum, order) => {
    const control = controls[order.id];
    return sum + (Number(control?.forecastValue) > 0 ? Number(control.forecastValue) : Number(order.committedValue || 0));
  }, 0);
  const forecastAtCompletion = activeForecast + Math.max(0, budgetTotal - activeScopeBudget);
  const varianceAtCompletion = budgetTotal - forecastAtCompletion;
  const measuredTotal = Object.values(controls).reduce((sum, control) => sum + Number(control.measuredValue || 0), 0);
  const paidTotal = Object.values(controls).reduce((sum, control) => sum + Number(control.paidValue || 0), 0);
  const contractEconomy = activeScopeBudget - activeCommitted;
  const plannedTotal = periodRows.reduce((sum, row) => sum + Number(row.plannedValue || 0), 0);
  const plannedPhysicalTotal = periodRows.reduce((sum, row) => sum + Number(row.plannedPhysicalPercent || 0), 0);
  const actualPhysicalTotal = periodRows.reduce((sum, row) => sum + Number(row.actualPhysicalPercent || 0), 0);

  const automaticForecastByPeriod = useMemo(() => {
    const result = new Map<string, number>();
    activeOrders.forEach((order) => {
      const control = controls[order.id];
      if (!control?.paymentDue) return;
      const value = Number(control.forecastValue) > 0 ? Number(control.forecastValue) : Number(order.committedValue || 0);
      const period = control.paymentDue.slice(0, 7);
      result.set(period, (result.get(period) || 0) + value);
    });
    return result;
  }, [activeOrders, controls]);

  const financialCurve = useMemo(() => {
    const planned = cumulative(periodRows, "plannedValue");
    const measured = cumulative(periodRows, "measuredValue");
    const paid = cumulative(periodRows, "paidValue");
    const forecast = cumulativeNumbers(periodRows.map((row) => Number(row.forecastValue || 0) || Number(automaticForecastByPeriod.get(row.period) || 0)));
    return periodRows.map((row, index) => ({ period: row.period, planned: planned[index], measured: measured[index], paid: paid[index], forecast: forecast[index] }));
  }, [automaticForecastByPeriod, periodRows]);

  const physicalCurve = useMemo(() => {
    const planned = cumulative(periodRows, "plannedPhysicalPercent");
    const actual = cumulative(periodRows, "actualPhysicalPercent");
    return periodRows.map((row, index) => ({ period: row.period, planned: planned[index], actual: actual[index] }));
  }, [periodRows]);

  function updateControl(orderId: string, field: keyof CostControl, value: string) {
    setControls((previous) => ({
      ...previous,
      [orderId]: {
        ...(previous[orderId] || blankControl(orderId)),
        [field]: field === "paymentDue" || field === "notes" ? value : Math.max(0, Number(value) || 0),
      },
    }));
  }

  function updatePeriod(period: string, field: keyof FinancialPeriod, value: string) {
    setPeriods((previous) => ({
      ...previous,
      [period]: {
        ...(previous[period] || blankPeriod(period)),
        [field]: field === "notes" ? value : Math.max(0, Number(value) || 0),
      },
    }));
  }

  async function saveControl(orderId: string) {
    setSavingKey(orderId); setMessage("");
    try {
      const response = await fetch("/api/cost-control", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ control: controls[orderId] || blankControl(orderId) }),
      });
      const data = await response.json<any>() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Falha ao salvar o contrato.");
      setMessage("Projeção, medição e desembolso do contrato foram salvos.");
      await loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao salvar o contrato.");
    } finally {
      setSavingKey("");
    }
  }

  async function savePeriods() {
    setSavingKey("periods"); setMessage("");
    try {
      const response = await fetch("/api/cost-control", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ periods: periodRows }),
      });
      const data = await response.json<any>() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Falha ao salvar a Curva S.");
      setMessage("Curva S, medições e desembolsos mensais foram salvos.");
      await loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao salvar a Curva S.");
    } finally {
      setSavingKey("");
    }
  }

  function downloadCurveCsv() {
    const headers = ["Competência", "Previsto físico (%)", "Realizado físico (%)", "Previsto financeiro", "Medido", "Pago", "Projeção", "Observações"];
    const rows = periodRows.map((row) => [row.period, row.plannedPhysicalPercent, row.actualPhysicalPercent, row.plannedValue, row.measuredValue, row.paidValue, row.forecastValue, row.notes]);
    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "berneck-curva-s-medicoes-desembolso.csv";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return <section className="cost-control-module">
    {message && <aside className="procurement-message"><span>{message}</span><button onClick={() => setMessage("")}>FECHAR</button></aside>}

    <section className="cost-kpis">
      <article><small>ORÇAMENTO BASE</small><b>{budgetTotal > 0 ? formatCurrency(budgetTotal) : "A CONFIRMAR"}</b><span>Valores do orçamento importado</span></article>
      <article><small>COMPROMETIDO ATIVO</small><b>{formatCurrency(activeCommitted)}</b><span>aprovado + pedido + entregue</span></article>
      <article className={budgetTotal > 0 ? (varianceAtCompletion < 0 ? "danger" : "good") : ""}><small>PROJEÇÃO FINAL · EAC</small><b>{budgetTotal > 0 ? formatCurrency(forecastAtCompletion) : "A CONFIRMAR"}</b><span>{budgetTotal > 0 ? (varianceAtCompletion >= 0 ? `economia projetada ${formatCurrency(varianceAtCompletion)}` : `estouro projetado ${formatCurrency(Math.abs(varianceAtCompletion))}`) : "preencher preços ou contratos para projetar"}</span></article>
      <article><small>MEDIDO / PAGO</small><b>{formatCurrency(measuredTotal)}</b><span>{formatCurrency(paidTotal)} desembolsado</span></article>
      <article className={budgetTotal > 0 ? (contractEconomy < 0 ? "danger" : "good") : ""}><small>NEGOCIAÇÃO SUPRIMENTOS</small><b>{budgetTotal > 0 ? formatCurrency(contractEconomy) : "A CONFIRMAR"}</b><span>{budgetTotal > 0 ? (contractEconomy >= 0 ? "desconto versus escopo orçado" : "acréscimo versus escopo orçado") : "sem preço-base para medir desconto"}</span></article>
    </section>

    <aside className="cost-source-banner">
      <div><b>BASE, COMPROMISSO E REALIZADO NÃO SÃO A MESMA COISA</b><span>Quantidades-base: {budgetSource}. Confirme a revisão e os preços da base importada. Comprometido: somente pedidos aprovados, emitidos ou entregues. Medido e pago: preenchimento do controle.</span></div>
      <em>{loading ? "CARREGANDO" : "DADOS PERSISTENTES"}</em>
    </aside>

    {view === "curva" && <>
      <section className="curve-grid">
        <CurveChart
          title="Avanço físico previsto × realizado"
          subtitle="Percentuais mensais incrementais; o gráfico acumula automaticamente. Não substitui pesos contratuais ainda não aprovados."
          rows={physicalCurve}
          maximum={100}
          percent
          series={[
            { key: "planned", label: "Previsto", color: "#2e504c" },
            { key: "actual", label: "Realizado", color: "#2f9b62" },
          ]}
        />
        <CurveChart
          title="Financeiro previsto × medido × pago"
          subtitle="Planejamento, medição, desembolso e projeção financeira acumulados por competência."
          rows={financialCurve}
          maximum={Math.max(budgetTotal, forecastAtCompletion, 1)}
          series={[
            { key: "planned", label: "Previsto", color: "#2e504c" },
            { key: "measured", label: "Medido", color: "#d99916" },
            { key: "paid", label: "Pago", color: "#2f9b62" },
            { key: "forecast", label: "Projeção", color: "#789b8f", dashed: true },
          ]}
        />
      </section>

      <section className="curve-validation">
        <article className={Math.abs(plannedPhysicalTotal - 100) < .01 ? "ready" : "pending"}><small>BASE FÍSICA</small><b>{plannedPhysicalTotal.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% planejado</b><span>{Math.abs(plannedPhysicalTotal - 100) < .01 ? "distribuição fecha em 100%" : "distribuir os pesos mensais até fechar 100%"}</span></article>
        <article className={budgetTotal > 0 && Math.abs(plannedTotal - budgetTotal) < 1 ? "ready" : "pending"}><small>BASE FINANCEIRA</small><b>{budgetTotal > 0 ? formatCurrency(plannedTotal) : "A CONFIRMAR"}</b><span>{budgetTotal <= 0 ? "orçamento a importar" : Math.abs(plannedTotal - budgetTotal) < 1 ? "planejamento fecha com o orçamento" : `diferença para o orçamento: ${formatCurrency(budgetTotal - plannedTotal)}`}</span></article>
        <article><small>REALIZADO FÍSICO</small><b>{actualPhysicalTotal.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%</b><span>informado por competência</span></article>
      </section>

      <section className="period-register">
        <header><div><p>PLANEJAMENTO E CONTROLE MENSAL</p><h2>Curva S, medições e desembolso</h2><small>Valores mensais, não acumulados. A visualização acima faz a acumulação.</small></div><div><button className="secondary" onClick={downloadCurveCsv}>BAIXAR CSV</button><button disabled={savingKey === "periods"} onClick={() => void savePeriods()}>{savingKey === "periods" ? "SALVANDO..." : "SALVAR CURVA S"}</button></div></header>
        <div className="procurement-table-wrap"><table><thead><tr><th>Competência</th><th>Físico previsto %</th><th>Físico realizado %</th><th>Financeiro previsto</th><th>Medido</th><th>Pago / desembolso</th><th>Projeção mensal</th><th>Observações</th></tr></thead><tbody>
          {periodRows.map((row) => <tr key={row.period}>
            <td><b>{periodLabel(row.period)}</b><small>{row.updatedAt ? `atualizado ${formatDate(String(row.updatedAt).slice(0, 10))}` : "a preencher"}</small></td>
            <td><label className="cost-input percent"><input aria-label={`Físico previsto ${row.period}`} type="number" min="0" max="100" step="0.01" value={row.plannedPhysicalPercent || ""} onChange={(event) => updatePeriod(row.period, "plannedPhysicalPercent", event.target.value)}/><span>%</span></label></td>
            <td><label className="cost-input percent"><input aria-label={`Físico realizado ${row.period}`} type="number" min="0" max="100" step="0.01" value={row.actualPhysicalPercent || ""} onChange={(event) => updatePeriod(row.period, "actualPhysicalPercent", event.target.value)}/><span>%</span></label></td>
            <td><label className="cost-input"><span>R$</span><input aria-label={`Financeiro previsto ${row.period}`} type="number" min="0" step="0.01" value={row.plannedValue || ""} onChange={(event) => updatePeriod(row.period, "plannedValue", event.target.value)}/></label></td>
            <td><label className="cost-input"><span>R$</span><input aria-label={`Medido ${row.period}`} type="number" min="0" step="0.01" value={row.measuredValue || ""} onChange={(event) => updatePeriod(row.period, "measuredValue", event.target.value)}/></label></td>
            <td><label className="cost-input"><span>R$</span><input aria-label={`Pago ${row.period}`} type="number" min="0" step="0.01" value={row.paidValue || ""} onChange={(event) => updatePeriod(row.period, "paidValue", event.target.value)}/></label></td>
            <td><label className="cost-input"><span>R$</span><input aria-label={`Projeção ${row.period}`} type="number" min="0" step="0.01" value={row.forecastValue || ""} placeholder={automaticForecastByPeriod.get(row.period) ? String(automaticForecastByPeriod.get(row.period)) : "0"} onChange={(event) => updatePeriod(row.period, "forecastValue", event.target.value)}/></label>{automaticForecastByPeriod.get(row.period) ? <small className="calculated-note">automático: {formatCurrency(Number(automaticForecastByPeriod.get(row.period)))}</small> : null}</td>
            <td><input className="cost-note-input" aria-label={`Observações ${row.period}`} value={row.notes} onChange={(event) => updatePeriod(row.period, "notes", event.target.value)} placeholder="Medição, marco ou premissa"/></td>
          </tr>)}
        </tbody></table></div>
        <footer><span>PROJEÇÃO AUTOMÁTICA: contratos ativos alocados na competência da data-base quando a projeção mensal não foi informada.</span><b>CRONOGRAMA PRELIMINAR: 02/09/2026 A 28/02/2027 · PREMISSA</b></footer>
      </section>
    </>}

    {view === "custos" && <section className="contract-cost-register">
      <header><div><p>SUPRIMENTOS + CUSTO + MEDIÇÃO</p><h2>Contratos e pedidos por escopo orçamentário</h2><small>Cadastre o preço contratado de cada frente; desconto, acréscimo, medição e desembolso serão calculados quando houver preço-base.</small></div><span>{orders.length} PEDIDO(S)</span></header>
      <div className="procurement-table-wrap"><table><thead><tr><th>Pedido / contratado</th><th>Escopo / WBS</th><th>Orçado proporcional</th><th>Contratado</th><th>Desconto / acréscimo</th><th>Projeção final</th><th>Medido acumulado</th><th>Pago acumulado</th><th>Data-base desembolso</th><th>Observações</th><th></th></tr></thead><tbody>
        {orders.map((order) => {
          const control = controls[order.id] || blankControl(order.id);
          const budget = proportionalBudget(order);
          const variance = budget - Number(order.committedValue || 0);
          const variancePercent = budget > 0 ? variance / budget * 100 : 0;
          return <tr key={order.id} className={ACTIVE_COMMITMENT.has(order.status) ? "active-contract" : "forecast-contract"}>
            <td><b>{order.orderNumber}</b><small>{order.supplier}</small><span className={`order-status ${order.status}`}>{statusLabel[order.status]}</span></td>
            <td><b>{order.lines.map((line) => line.budgetCode).slice(0, 3).join(" · ") || "Sem item"}</b><small>{order.wbs ? `WBS ${order.wbs}` : "WBS pendente"} · {order.scheduleActivity || "atividade pendente"}</small></td>
            <td><b>{formatCurrency(budget)}</b><small>qtd. contratada × preço orçado</small></td>
            <td><b>{formatCurrency(order.committedValue)}</b><small>{ACTIVE_COMMITMENT.has(order.status) ? "compromisso ativo" : "ainda não comprometido"}</small></td>
            <td className={variance < 0 ? "negative" : "positive"}><b>{variance >= 0 ? "−" : "+"} {formatCurrency(Math.abs(variance))}</b><small>{Math.abs(variancePercent).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% {variance >= 0 ? "desconto" : "acréscimo"}</small></td>
            <td><label className="cost-input"><span>R$</span><input aria-label={`Projeção final ${order.orderNumber}`} type="number" min="0" step="0.01" value={control.forecastValue || ""} placeholder={String(order.committedValue || 0)} onChange={(event) => updateControl(order.id, "forecastValue", event.target.value)}/></label><small className="calculated-note">vazio = contratado</small></td>
            <td><label className="cost-input"><span>R$</span><input aria-label={`Medido ${order.orderNumber}`} type="number" min="0" step="0.01" value={control.measuredValue || ""} onChange={(event) => updateControl(order.id, "measuredValue", event.target.value)}/></label></td>
            <td><label className="cost-input"><span>R$</span><input aria-label={`Pago ${order.orderNumber}`} type="number" min="0" step="0.01" value={control.paidValue || ""} onChange={(event) => updateControl(order.id, "paidValue", event.target.value)}/></label></td>
            <td><input className="cost-date-input" aria-label={`Data-base ${order.orderNumber}`} type="date" value={control.paymentDue || ""} onChange={(event) => updateControl(order.id, "paymentDue", event.target.value)}/><small>{order.requiredBy ? `necessidade ${formatDate(order.requiredBy)}` : "sem data de necessidade"}</small></td>
            <td><input className="cost-note-input" aria-label={`Observações ${order.orderNumber}`} value={control.notes || ""} onChange={(event) => updateControl(order.id, "notes", event.target.value)} placeholder="Condição, parcela, reajuste..."/></td>
            <td><button className="cost-save-button" disabled={savingKey === order.id} onClick={() => void saveControl(order.id)}>{savingKey === order.id ? "..." : "SALVAR"}</button></td>
          </tr>;
        })}
        {!loading && orders.length === 0 && <tr><td colSpan={11} className="procurement-empty">Nenhum pedido registrado. Cadastre o contrato na aba PEDIDO / CSV para iniciar o controle.</td></tr>}
      </tbody></table></div>
      <footer><span>{budgetTotal > 0 ? "EAC calculado com os contratos ativos e o saldo não contratado mantido pelo orçamento." : "EAC e economia permanecem A_CONFIRMAR enquanto a planilha não tiver preços-base."} Ajuste “Projeção final” para refletir aditivos, reajustes ou tendência.</span><b>ECONOMIA DE NEGOCIAÇÃO: {budgetTotal > 0 ? formatCurrency(contractEconomy) : "A CONFIRMAR"}</b></footer>
    </section>}
  </section>;
}
