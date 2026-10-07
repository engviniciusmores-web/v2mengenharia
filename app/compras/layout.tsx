import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "V2M Suprimentos 5D — V2M ENGENHARIA",
  description: "Pedidos, orçamento, planejamento e elementos IFC integrados para o Obra.",
};

export default function ComprasLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
