"use client";

import type { OpcoesDoFinanceiro } from "@plugga/shared";
import { Settings } from "lucide-react";
import { useState } from "react";

import { Button } from "../ui";
import { ConfiguracoesDoFinanceiro } from "./configuracoes-do-financeiro";

/** A engrenagem das Configurações do Financeiro (contas correntes e categorias) no cabeçalho das telas do módulo. */
export function EngrenagemDoFinanceiro({ opcoes }: { opcoes: OpcoesDoFinanceiro }) {
  const [aberta, setAberta] = useState(false);
  return <>
    <Button variant="secondary" iconOnly icon={<Settings size={18} />} aria-label="Configurações do Financeiro" title="Configurações do Financeiro" onClick={() => setAberta(true)} />
    {aberta ? <ConfiguracoesDoFinanceiro opcoes={opcoes} aoFechar={() => setAberta(false)} /> : null}
  </>;
}
