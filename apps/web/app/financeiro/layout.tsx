import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { financeiroHabilitado } from "../lib/recursos";

/**
 * Portão do Financeiro em construção (lib/recursos.ts): desligado no build de
 * produção, toda rota `/financeiro/*` responde 404, como se não existisse.
 */
export default function FinanceiroLayout({ children }: { children: ReactNode }) {
  if (!financeiroHabilitado()) notFound();
  return children;
}
