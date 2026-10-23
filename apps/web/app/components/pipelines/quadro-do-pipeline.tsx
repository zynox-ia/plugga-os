"use client";

import type { BulkDealsAction, Deal, Pipeline } from "@plugga/shared";
import { useMemo, useState, type CSSProperties } from "react";

import { aplicarFiltros, estaParado, FILTROS_INICIAIS, hojeNoFuso, somaDosValores, valorCurto, type Filtros, type Visao } from "../../lib/negocios";
import { CalendarioDeNegocios } from "./calendario-de-negocios";
import { FiltrosDoPipeline } from "./filtros-do-pipeline";
import { KanbanDoPipeline } from "./kanban-do-pipeline";
import { ListaDeNegocios } from "./lista-de-negocios";
import estilos from "./tela-pipelines.module.css";

export type AcoesDoNegocio = {
  moverEtapa: (negocio: Deal, etapaId: string) => Promise<void>;
  ganhar: (negocio: Deal) => void;
  perder: (negocio: Deal) => void;
  transferir: (negocio: Deal) => void;
  novoNaEtapa: (etapaId: string) => void;
  emLote: (ids: string[], acao: BulkDealsAction) => Promise<boolean>;
};

/** As três visões compartilham filtros, dados e ações do mesmo pipeline. */
export function QuadroDoPipeline({ pipeline, negocios, visao, usuarioId, acoes }: {
  pipeline: Pipeline;
  negocios: Deal[];
  visao: Visao;
  usuarioId: string | null;
  acoes: AcoesDoNegocio;
}) {
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_INICIAIS);
  const hoje = hojeNoFuso();
  const abertos = negocios.filter((n) => n.status === "open");
  const ganhos = negocios.filter((n) => n.status === "won");
  const parados = abertos.filter((n) => estaParado(n, pipeline)).length;
  // No Kanban só entram os abertos; Lista e Calendário também consultam os encerrados.
  const visiveis = useMemo(
    () => aplicarFiltros(negocios, visao === "kanban" ? { ...filtros, status: "open" } : filtros, hoje),
    [negocios, filtros, visao, hoje],
  );
  const filtrar = (parcial: Partial<Filtros>) => setFiltros((atual) => ({ ...atual, ...parcial }));

  return (
    <div className="quadro-pipeline" style={{ "--cor": pipeline.color } as CSSProperties}>
      <dl className={estilos.resumo} aria-label={`Resumo do pipeline ${pipeline.name}`}>
        <div><dt>Abertos</dt><dd>{abertos.length}</dd></div>
        <div><dt>{pipeline.valueLabel} em aberto</dt><dd>{valorCurto(somaDosValores(abertos))}</dd></div>
        <div><dt>Parados</dt><dd>{parados}</dd></div>
        <div><dt>{pipeline.wonLabel}</dt><dd>{ganhos.length} · {valorCurto(somaDosValores(ganhos))}</dd></div>
      </dl>
      <section className={`painel-quadro ${estilos.painel}`} aria-label={`Negócios do pipeline ${pipeline.name}`}>
        <FiltrosDoPipeline pipeline={pipeline} visao={visao} usuarioId={usuarioId} filtros={filtros} filtrar={filtrar} negocios={visiveis} />
        {visao === "kanban" ? <KanbanDoPipeline pipeline={pipeline} negocios={visiveis} acoes={acoes} /> : null}
        {visao === "lista" ? <ListaDeNegocios pipeline={pipeline} negocios={visiveis} acoes={acoes} /> : null}
        {visao === "calendario" ? <CalendarioDeNegocios pipeline={pipeline} negocios={visiveis} acoes={acoes} /> : null}
      </section>
    </div>
  );
}
