import type { Metadata } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";

import "./globals.css";
import { AppShell } from "./components/app-shell";

const generalSans = localFont({
  src: [
    {
      path: "../public/fonts/GeneralSans-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../public/fonts/GeneralSans-Italic.woff2",
      weight: "400",
      style: "italic",
    },
    {
      path: "../public/fonts/GeneralSans-Medium.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../public/fonts/GeneralSans-MediumItalic.woff2",
      weight: "500",
      style: "italic",
    },
    {
      path: "../public/fonts/GeneralSans-Semibold.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "../public/fonts/GeneralSans-SemiboldItalic.woff2",
      weight: "600",
      style: "italic",
    },
    {
      path: "../public/fonts/GeneralSans-Bold.woff2",
      weight: "700",
      style: "normal",
    },
    {
      path: "../public/fonts/GeneralSans-BoldItalic.woff2",
      weight: "700",
      style: "italic",
    },
  ],
  variable: "--font-general-sans",
  display: "swap",
});

// 🔒 SEGURANÇA [VULN-4]: middleware.ts gera um nonce novo por requisição e só
// esse nonce autoriza script a rodar (ver content-security-policy.ts). Uma
// rota que o Next consegue pré-renderizar em build (sem cookies()/headers()
// nem fetch dinâmico) vira HTML estático servido igual para todo mundo — com
// o nonce de build gravado nos <script>, nunca o da requisição atual. O
// resultado é o próprio CSP bloqueando os scripts da página, inclusive os de
// hidratação do Next. force-dynamic tira toda rota da otimização estática,
// então o servidor sempre roda de novo e usa o nonce da requisição.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Plugga",
  description: "Plataforma operacional interna da Plugga.",
  icons: {
    icon: "/brand/icone-areia.svg",
    shortcut: "/brand/icone-areia.svg",
    apple: "/brand/icone-areia.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${generalSans.variable}`} suppressHydrationWarning>
      <body className={`${generalSans.className}`} suppressHydrationWarning>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
