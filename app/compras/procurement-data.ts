import budgetBook from "./budget-items.json";

export const PROCUREMENT_REFERENCE_DATE = "2026-10-06";
export const BUDGET_BASE_DATE = "2026-10-06";
export const SCHEDULE_SAVED_DATE = "A_CONFIRMAR";
export const DEFAULT_LEAD_TIME_DAYS = 30;

type BudgetItem = { code: string; description: string; unit: string; quantity: number; totalCost: number };
const budgetItems = budgetBook.items as BudgetItem[];
const budgetItemsByCode = new Map(budgetItems.map((item) => [item.code, item]));

export const BUDGET_TOTAL_COST = budgetBook.totalCost;
export const BUDGET_ITEM_COUNT = budgetBook.itemCount;

function iapItem(code: string) {
  const item = budgetItemsByCode.get(code);
  return item ? `${code} · ${item.description}` : code;
}

export type ProcurementStatus = "sem dados" | "em dia" | "atenção" | "atrasado";
export type MappingConfidence = "alta" | "média" | "pendente";
export type ConsumingTask = {
  uid: number; wbs: string; name: string; start: string | null;
  sourceStart?: string; dateState?: "verificada" | "placeholder" | "ausente";
};

type ProcurementEvidence = {
  tasks: ConsumingTask[]; scopeSummary: string; quantities: string[]; costSource: string;
  scheduleSource: string; confidence: MappingConfidence; confidenceReason: string; nextAction: string;
};

export type ProcurementPackage = {
  id: string; name: string; lot: string; phase: "Preparação" | "Stacker" | "Transportadores" | "Moegas" | "Pátios" | "Aterramento" | "Geral";
  eapCode: string; budgetItemCodes: string[]; iapItems: string[]; budgetedValue: number | null;
  budgetSource: string; committedValue: number; commitmentSource: "initial" | "live"; leadTimeDays?: number;
  tasks: ConsumingTask[]; mappingNote: string;
};

const PRELIMINARY = "Cronograma preliminar derivado da EAP orçamentária · PREMISSA";
const COST_SOURCE = "Orçamento da obra a importar";

export const procurementPackages: ProcurementPackage[] = [];

const evidenceByPackage: Record<string, ProcurementEvidence> = Object.fromEntries(procurementPackages.map((pkg) => [pkg.id, {
  tasks: pkg.tasks,
  scopeSummary: pkg.lot,
  quantities: pkg.budgetItemCodes.slice(0, 6).map(iapItem),
  costSource: pkg.budgetSource,
  scheduleSource: PRELIMINARY,
  confidence: pkg.eapCode === "2" ? "média" : "pendente",
  confidenceReason: "EAP e quantidades identificadas; custo e cronograma contratual ainda não foram fornecidos.",
  nextAction: "Preencher preços/condições comerciais e substituir a data PREMISSA pela necessidade do cronograma aprovado.",
}])) as Record<string, ProcurementEvidence>;

function parseDate(value: string) { return new Date(`${value}T12:00:00Z`); }
function toIsoDate(date: Date) { return date.toISOString().slice(0, 10); }

export function derivePackage(pkg: ProcurementPackage) {
  const evidence = evidenceByPackage[pkg.id];
  const tasks = evidence.tasks;
  const validStarts = tasks.map((task) => task.start).filter((start): start is string => Boolean(start)).sort();
  const requiredBy = validStarts.at(0) ?? null;
  const leadTimeDays = pkg.leadTimeDays ?? DEFAULT_LEAD_TIME_DAYS;
  const alertDate = requiredBy ? toIsoDate(new Date(parseDate(requiredBy).getTime() - leadTimeDays * 86_400_000)) : null;
  const remainingBalance = pkg.budgetedValue === null ? null : pkg.budgetedValue - pkg.committedValue;
  return { ...pkg, ...evidence, tasks, requiredBy, alertDate, leadTimeDays, remainingBalance, status: deriveStatus(alertDate) };
}

export function deriveStatus(alertDate: string | null): ProcurementStatus {
  if (!alertDate) return "sem dados";
  const daysUntilAlert = Math.ceil((parseDate(alertDate).getTime() - parseDate(PROCUREMENT_REFERENCE_DATE).getTime()) / 86_400_000);
  if (daysUntilAlert <= 0) return "atrasado";
  if (daysUntilAlert <= 7) return "atenção";
  return "em dia";
}

export function formatCurrency(value: number | null) {
  if (value === null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value);
}

export function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "2-digit", timeZone: "UTC" }).format(parseDate(value)).replace(" de ", " ").replace(" de ", " ");
}
