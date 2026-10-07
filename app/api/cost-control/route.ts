import { ensureCostControlSchema, getCostControlEnv } from "../../../db/cost-control";
import { ensureProcurementSchema } from "../../../db/procurement";

type ControlPayload = {
  orderId?: string;
  forecastValue?: number;
  measuredValue?: number;
  paidValue?: number;
  paymentDue?: string;
  notes?: string;
};

type PeriodPayload = {
  period?: string;
  plannedValue?: number;
  measuredValue?: number;
  paidValue?: number;
  forecastValue?: number;
  plannedPhysicalPercent?: number;
  actualPhysicalPercent?: number;
  notes?: string;
};

function amount(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function serializeControl(row: Record<string, unknown>) {
  return {
    orderId: row.order_id,
    forecastValue: row.forecast_value,
    measuredValue: row.measured_value,
    paidValue: row.paid_value,
    paymentDue: row.payment_due,
    notes: row.notes,
    updatedAt: row.updated_at,
  };
}

function serializePeriod(row: Record<string, unknown>) {
  return {
    period: row.period,
    plannedValue: row.planned_value,
    measuredValue: row.measured_value,
    paidValue: row.paid_value,
    forecastValue: row.forecast_value,
    plannedPhysicalPercent: row.planned_physical_percent,
    actualPhysicalPercent: row.actual_physical_percent,
    notes: row.notes,
    updatedAt: row.updated_at,
  };
}

export async function GET() {
  try {
    await ensureCostControlSchema();
    const { DB } = getCostControlEnv();
    const [controls, periods] = await Promise.all([
      DB.prepare("SELECT * FROM procurement_cost_controls ORDER BY updated_at DESC").all(),
      DB.prepare("SELECT * FROM financial_periods ORDER BY period").all(),
    ]);
    return Response.json({
      controls: controls.results.map((row: unknown) => serializeControl(row as Record<string, unknown>)),
      periods: periods.results.map((row: unknown) => serializePeriod(row as Record<string, unknown>)),
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Falha ao consultar o controle de custos." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await Promise.all([ensureCostControlSchema(), ensureProcurementSchema()]);
    const payload = await request.json() as { control?: ControlPayload; periods?: PeriodPayload[] };
    const { DB } = getCostControlEnv();

    if (payload.control) {
      const control = payload.control;
      const orderId = control.orderId?.trim();
      if (!orderId) return Response.json({ error: "Pedido não informado." }, { status: 400 });
      const order = await DB.prepare("SELECT id FROM procurement_orders WHERE id = ? LIMIT 1").bind(orderId).first();
      if (!order) return Response.json({ error: "Pedido não encontrado na base de suprimentos." }, { status: 404 });
      const paymentDue = control.paymentDue?.trim() || null;
      if (paymentDue && !/^\d{4}-\d{2}-\d{2}$/.test(paymentDue)) {
        return Response.json({ error: "Data de desembolso inválida." }, { status: 400 });
      }
      await DB.prepare(`INSERT INTO procurement_cost_controls (
        order_id, forecast_value, measured_value, paid_value, payment_due, notes, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(order_id) DO UPDATE SET
        forecast_value=excluded.forecast_value, measured_value=excluded.measured_value,
        paid_value=excluded.paid_value, payment_due=excluded.payment_due,
        notes=excluded.notes, updated_at=CURRENT_TIMESTAMP`).bind(
        orderId,
        amount(control.forecastValue),
        amount(control.measuredValue),
        amount(control.paidValue),
        paymentDue,
        control.notes?.trim() || null,
      ).run();
      return Response.json({ ok: true, orderId });
    }

    const periods = (payload.periods || []).filter((period) => /^\d{4}-\d{2}$/.test(period.period || ""));
    if (periods.length === 0) return Response.json({ error: "Nenhuma competência válida foi informada." }, { status: 400 });
    await DB.batch(periods.map((period) => DB.prepare(`INSERT INTO financial_periods (
      period, planned_value, measured_value, paid_value, forecast_value,
      planned_physical_percent, actual_physical_percent, notes, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(period) DO UPDATE SET
      planned_value=excluded.planned_value, measured_value=excluded.measured_value,
      paid_value=excluded.paid_value, forecast_value=excluded.forecast_value,
      planned_physical_percent=excluded.planned_physical_percent,
      actual_physical_percent=excluded.actual_physical_percent,
      notes=excluded.notes, updated_at=CURRENT_TIMESTAMP`).bind(
      period.period,
      amount(period.plannedValue),
      amount(period.measuredValue),
      amount(period.paidValue),
      amount(period.forecastValue),
      Math.min(100, amount(period.plannedPhysicalPercent)),
      Math.min(100, amount(period.actualPhysicalPercent)),
      period.notes?.trim() || null,
    )));
    return Response.json({ ok: true, periods: periods.length });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Falha ao salvar o controle de custos." }, { status: 500 });
  }
}
