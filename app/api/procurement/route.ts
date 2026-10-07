import { ensureProcurementSchema, getProcurementEnv } from "../../../db/procurement";

const statuses = new Set(["draft", "requested", "quoted", "approved", "ordered", "delivered", "cancelled"]);

type LinePayload = {
  budgetItemId?: string; budgetCode?: string; description?: string; unit?: string;
  budgetQuantity?: number; budgetUnitCost?: number; budgetTotalCost?: number;
  orderedQuantity?: number; orderedUnitPrice?: number; application?: string;
};

type ElementPayload = {
  elementKey?: string; expressId?: number; globalId?: string; elementType?: string;
  elementName?: string; phase?: string; activity?: string; wbs?: string;
  plannedStart?: string; plannedFinish?: string;
};

type OrderPayload = {
  id?: string; orderNumber?: string; supplier?: string; status?: string; phase?: string;
  scheduleActivity?: string; wbs?: string; requiredBy?: string; notes?: string;
  lines?: LinePayload[]; elements?: ElementPayload[];
};

function asNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function serializeOrder(row: Record<string, unknown>, lines: Record<string, unknown>[], elements: Record<string, unknown>[]) {
  return {
    id: row.id, orderNumber: row.order_number, supplier: row.supplier, status: row.status,
    phase: row.phase, scheduleActivity: row.schedule_activity, wbs: row.wbs,
    requiredBy: row.required_by, notes: row.notes, committedValue: row.committed_value,
    createdAt: row.created_at, updatedAt: row.updated_at,
    lines: lines.filter((line) => line.order_id === row.id).map((line) => ({
      id: line.id, budgetItemId: line.budget_item_id, budgetCode: line.budget_code,
      description: line.description, unit: line.unit, budgetQuantity: line.budget_quantity,
      budgetUnitCost: line.budget_unit_cost, budgetTotalCost: line.budget_total_cost,
      orderedQuantity: line.ordered_quantity, orderedUnitPrice: line.ordered_unit_price,
      application: line.application, committedValue: line.committed_value,
    })),
    elements: elements.filter((element) => element.order_id === row.id).map((element) => ({
      id: element.id, elementKey: element.element_key, expressId: element.express_id,
      globalId: element.global_id, elementType: element.element_type, elementName: element.element_name,
      phase: element.phase, activity: element.activity, wbs: element.wbs,
      plannedStart: element.planned_start, plannedFinish: element.planned_finish,
    })),
  };
}

export async function GET() {
  try {
    await ensureProcurementSchema();
    const { DB } = getProcurementEnv();
    const [orders, lines, elements] = await Promise.all([
      DB.prepare("SELECT * FROM procurement_orders ORDER BY updated_at DESC LIMIT 300").all(),
      DB.prepare("SELECT * FROM procurement_order_lines").all(),
      DB.prepare("SELECT * FROM procurement_order_elements").all(),
    ]);
    return Response.json({
      orders: orders.results.map((row) => serializeOrder(
        row as Record<string, unknown>,
        lines.results as Record<string, unknown>[],
        elements.results as Record<string, unknown>[],
      )),
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Falha ao consultar os pedidos." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureProcurementSchema();
    const payload = await request.json() as OrderPayload;
    const supplier = payload.supplier?.trim();
    const lines = (payload.lines || []).filter((line) => line.budgetItemId && line.description && asNumber(line.orderedQuantity) > 0);
    if (!supplier || lines.length === 0) {
      return Response.json({ error: "Informe o fornecedor e ao menos um item com quantidade." }, { status: 400 });
    }

    const id = payload.id?.trim() || `ord-${crypto.randomUUID()}`;
    const orderNumber = payload.orderNumber?.trim() || `PED-${new Date().getUTCFullYear()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
    const status = statuses.has(payload.status || "") ? payload.status! : "draft";
    const elements = (payload.elements || []).filter((element) => element.elementKey && Number.isFinite(Number(element.expressId)));
    const committedValue = lines.reduce((sum, line) => sum + asNumber(line.orderedQuantity) * asNumber(line.orderedUnitPrice), 0);
    const { DB } = getProcurementEnv();

    const statements = [
      DB.prepare(`INSERT INTO procurement_orders (
        id, order_number, supplier, status, phase, schedule_activity, wbs, required_by, notes, committed_value, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        order_number=excluded.order_number, supplier=excluded.supplier, status=excluded.status,
        phase=excluded.phase, schedule_activity=excluded.schedule_activity, wbs=excluded.wbs,
        required_by=excluded.required_by, notes=excluded.notes, committed_value=excluded.committed_value,
        updated_at=CURRENT_TIMESTAMP`).bind(
        id, orderNumber, supplier, status, payload.phase || null, payload.scheduleActivity || null,
        payload.wbs || null, payload.requiredBy || null, payload.notes || null, committedValue,
      ),
      DB.prepare("DELETE FROM procurement_order_lines WHERE order_id = ?").bind(id),
      DB.prepare("DELETE FROM procurement_order_elements WHERE order_id = ?").bind(id),
      ...lines.map((line) => {
        const orderedQuantity = asNumber(line.orderedQuantity);
        const orderedUnitPrice = asNumber(line.orderedUnitPrice);
        return DB.prepare(`INSERT INTO procurement_order_lines (
          id, order_id, budget_item_id, budget_code, description, unit, budget_quantity,
          budget_unit_cost, budget_total_cost, ordered_quantity, ordered_unit_price, application, committed_value
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
          `line-${crypto.randomUUID()}`, id, line.budgetItemId, line.budgetCode || "", line.description,
          line.unit || "un", asNumber(line.budgetQuantity), asNumber(line.budgetUnitCost),
          asNumber(line.budgetTotalCost), orderedQuantity, orderedUnitPrice, line.application?.trim() || "",
          orderedQuantity * orderedUnitPrice,
        );
      }),
      ...elements.map((element) => DB.prepare(`INSERT INTO procurement_order_elements (
        id, order_id, element_key, express_id, global_id, element_type, element_name,
        phase, activity, wbs, planned_start, planned_finish
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        `element-${crypto.randomUUID()}`, id, element.elementKey, Number(element.expressId), element.globalId || null,
        element.elementType || "IFC ELEMENT", element.elementName || `Elemento ${element.expressId}`,
        element.phase || null, element.activity || null, element.wbs || null,
        element.plannedStart || null, element.plannedFinish || null,
      )),
    ];
    await DB.batch(statements);
    const row = await DB.prepare("SELECT * FROM procurement_orders WHERE id = ? LIMIT 1").bind(id).first();
    return Response.json({ order: row, id, orderNumber });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Falha ao salvar o pedido." }, { status: 500 });
  }
}
