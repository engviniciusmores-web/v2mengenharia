import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "V2M ENGENHARIA",
  description: "Gestão integrada de obras: planejamento, IFC 4D/5D, quantitativos, suprimentos, custos, qualidade e diário de obra.",
  icons: {
    icon: "/v2m-symbol.svg",
    shortcut: "/v2m-symbol.svg",
  },
  openGraph: { title: "V2M ENGENHARIA", description: "Planejamento, IFC 4D/5D e controle físico-financeiro.", type: "website" },
  twitter: { card: "summary", title: "V2M ENGENHARIA", description: "Gestão integrada de obras." },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <footer className="site-authorship" aria-label="Autoria da plataforma">
          <span className="site-authorship-mark" aria-hidden="true">VM</span>
          <div><strong>Elaborado por Engº Vinicius Morés</strong><span>CREA 240732 · Criação e desenvolvimento da plataforma</span><div className="site-authorship-contacts"><a href="mailto:engviniciusmores@outlook.com">engviniciusmores@outlook.com</a><a href="tel:+5551999988955">(51) 99998-8955</a></div></div>
          <small>© 2026 · Todos os direitos reservados.</small>
        </footer>
      </body>
    </html>
  );
}
