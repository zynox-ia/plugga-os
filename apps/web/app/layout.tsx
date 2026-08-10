import type { Metadata } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";

import "./globals.css";
import { AppShell } from "./components/app-shell";

const articulatCF = localFont({
  src: [
    {
      path: "../public/fonts/ArticulatCF-Normal.otf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../public/fonts/ArticulatCF-Medium.otf",
      weight: "500",
      style: "normal",
    },
    {
      path: "../public/fonts/ArticulatCF-Bold.otf",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-articulat",
  display: "swap",
});

const roobertTrial = localFont({
  src: [
    {
      path: "../public/fonts/RoobertTRIAL-Regular-BF67243fd53fdf2.otf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../public/fonts/RoobertTRIAL-Medium-BF67243fd53e059.otf",
      weight: "500",
      style: "normal",
    },
    {
      path: "../public/fonts/RoobertTRIAL-Bold-BF67243fd540abb.otf",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-roobert",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Plugga OS",
  description: "Plataforma operacional interna da Plugga.",
  icons: {
    icon: "/brand/icone - areia.svg",
    shortcut: "/brand/icone - areia.svg",
    apple: "/brand/icone - areia.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${articulatCF.variable} ${roobertTrial.variable}`}>
      <body className={`${articulatCF.className}`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
