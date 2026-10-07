import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Qualidade BIM — V2M ENGENHARIA",
  description: "RIS por elemento IFC, não conformidades e liberações de concretagem do Obra.",
};

export default function QualidadeLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
