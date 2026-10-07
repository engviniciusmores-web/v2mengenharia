import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Diário de Obra — V2M ENGENHARIA",
  description: "Produção, ocorrências, efetivo e registro fotográfico do Obra.",
};

export default function DiarioLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
