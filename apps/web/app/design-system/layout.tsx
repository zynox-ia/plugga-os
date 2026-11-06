import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { designSystemHabilitado } from "../lib/design-system-habilitado";
import { exigirPagina } from "../lib/exigir-pagina";
import "./design-system.css";

export default async function DesignSystemLayout({ children }: { children: ReactNode }) {
  if (!designSystemHabilitado(process.env.NODE_ENV)) notFound();
  await exigirPagina("/design-system");
  return children;
}
