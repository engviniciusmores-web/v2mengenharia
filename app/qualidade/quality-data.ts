import risSource from "./ris-templates.json";
import concreteSource from "./concrete-template.json";

export type RisItem = { index: number; item: string; responsible: string; method: string; criterion: string };
export type RisTemplate = { sheet: string; service: string; ris: string; revision: string; items: RisItem[] };
export type ConcreteItem = { index: number; item: string; method: string; criterion: string };

export const risTemplates = risSource as RisTemplate[];
export const concreteItems = (concreteSource[0]?.items || []) as ConcreteItem[];

export function resolveRisTemplate(ifcType: string, name = "") {
  const type = `${ifcType} ${name}`.toUpperCase();
  let code = "";
  if (type.includes("IFCBEAM") || type.includes("IFCMEMBER") || type.includes("VIGA")) code = "03";
  else if (type.includes("IFCCOLUMN") || type.includes("PILAR")) code = "02";
  else if (type.includes("IFCPILE") || type.includes("ESTACA")) code = "05";
  else if (type.includes("IFCFOOTING") || type.includes("BLOCO") || type.includes("SAPATA")) code = "12";
  else if (type.includes("IFCSTAIR") || type.includes("ESCADA")) code = "08";
  else if (type.includes("IFCSLAB") || type.includes("LAJE")) code = "07";
  else if (type.includes("IFCPLATE") || type.includes("PLACA")) code = "06";
  else if (type.includes("IFCWALL") || type.includes("MURO")) code = type.includes("ALVENARIA") ? "13" : "09";
  return risTemplates.find((template) => template.ris === code) || risTemplates[0];
}

export function concreteGroup(index: number) {
  if (index <= 14) return "Topografia";
  if (index <= 23) return "Formas";
  return "Armação";
}

export const statusLabels: Record<string, string> = {
  draft: "Não iniciado", in_progress: "Em preenchimento", nonconforming: "Não conforme",
  ready: "Pronto para liberar", released: "Liberado",
};
