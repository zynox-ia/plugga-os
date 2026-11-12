"use client";

import type { Acesso, JobRunInventoryItem } from "@plugga/shared";
import type { KeyboardEvent } from "react";

import { EstadoDaApi } from "../components/estado-da-api";
import { JobsView } from "../components/jobs-view";
import { erroDe, type ErroDeApi } from "../lib/api-core";
import { IntegracoesView } from "./integracoes-view";

export type SubAbaDoDesenvolvedor = "integracoes" | "jobs";

const SUB_ABAS: { id: SubAbaDoDesenvolvedor; rotulo: string }[] = [
  { id: "integracoes", rotulo: "Integrações" },
  { id: "jobs", rotulo: "Jobs" },
];

const idDaAba = (id: SubAbaDoDesenvolvedor) => `desenvolvedor-aba-${id}`;
const ID_DO_PAINEL = "desenvolvedor-painel";

/**
 * O seletor das seções do desenvolvedor. Mora no cabeçalho da página, na mesma linha do
 * título e alinhado à direita, e controla o que `DesenvolvedorView` mostra.
 */
export function SubAbasDoDesenvolvedor({ valor, aoMudar }: { valor: SubAbaDoDesenvolvedor; aoMudar: (id: SubAbaDoDesenvolvedor) => void }) {
  function teclas(evento: KeyboardEvent<HTMLDivElement>) {
    const atual = SUB_ABAS.findIndex((aba) => aba.id === valor);
    const proxima = evento.key === "ArrowRight" ? (atual + 1) % SUB_ABAS.length
      : evento.key === "ArrowLeft" ? (atual - 1 + SUB_ABAS.length) % SUB_ABAS.length
      : evento.key === "Home" ? 0
      : evento.key === "End" ? SUB_ABAS.length - 1
      : null;
    if (proxima === null) return;
    evento.preventDefault();
    const destino = SUB_ABAS[proxima];
    if (!destino) return;
    aoMudar(destino.id);
    evento.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[proxima]?.focus();
  }

  return (
    <div role="tablist" aria-label="Seções do desenvolvedor" className="ui-tabs-list" onKeyDown={teclas}>
      {SUB_ABAS.map((aba) => (
        <button
          key={aba.id}
          type="button"
          role="tab"
          id={idDaAba(aba.id)}
          aria-controls={ID_DO_PAINEL}
          aria-selected={valor === aba.id}
          tabIndex={valor === aba.id ? 0 : -1}
          className="ui-tab"
          onClick={() => aoMudar(aba.id)}
        >
          {aba.rotulo}
        </button>
      ))}
    </div>
  );
}

type DesenvolvedorViewProps = {
  subAba: SubAbaDoDesenvolvedor;
  jobsDados?: { items: JobRunInventoryItem[]; isLive: boolean } | null;
  erroJobs?: ErroDeApi | null;
  acesso?: Acesso | null;
};

/**
 * Tela do desenvolvedor: o que só ele mexe. O título, a descrição e o seletor de
 * seções vêm do cabeçalho de Configurações. Só entra aqui o que tem dado ou ação
 * reais: as integrações da plataforma e a execução dos jobs. Estado de VPS e de
 * ambiente não aparece, porque esta tela não o mede.
 */
export function DesenvolvedorView({ subAba, jobsDados, erroJobs, acesso }: DesenvolvedorViewProps) {
  return (
    <div role="tabpanel" id={ID_DO_PAINEL} aria-labelledby={idDaAba(subAba)}>
      {subAba === "integracoes" ? (
        acesso ? <IntegracoesView acesso={acesso} escopo="plataforma" /> : null
      ) : !erroJobs && jobsDados?.isLive ? (
        <JobsView items={jobsDados.items} isLive={jobsDados.isLive} />
      ) : (
        <EstadoDaApi erro={erroJobs ?? erroDe("indisponivel")} eyebrow="Jobs" />
      )}
    </div>
  );
}
