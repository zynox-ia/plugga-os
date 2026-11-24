"use client";

import type { OpcoesDaEngenhariaResposta } from "@plugga/shared";
import { Settings } from "lucide-react";
import { useState } from "react";

import { Button } from "../ui";
import { ConfiguracoesDaEngenharia } from "./configuracoes-da-engenharia";

/** A engrenagem das Configurações da Engenharia, para os cabeçalhos que não são das O.S. (ex.: Tarefas). */
export function BotaoDeConfiguracoesDaEngenharia({ opcoes }: { opcoes: OpcoesDaEngenhariaResposta | null }) {
  const [aberto, setAberto] = useState(false);
  return <>
    <Button variant="secondary" iconOnly icon={<Settings size={18} />} aria-label="Configurações da Engenharia" title="Configurações da Engenharia" onClick={() => setAberto(true)} />
    {aberto ? <ConfiguracoesDaEngenharia opcoes={opcoes} aoFechar={() => setAberto(false)} /> : null}
  </>;
}
