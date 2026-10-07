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
      </body>
    </html>
  );
}
