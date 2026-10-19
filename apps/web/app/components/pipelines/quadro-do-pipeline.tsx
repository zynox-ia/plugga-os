"use client";

import type { BulkDealsAction, Deal, Pipeline } from "@plugga/shared";
import Link from "next/link";
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";

import {
  aplicarFiltros,
  estaParado,
  FILTROS_INICIAIS,
  hojeNoFuso,
  hrefDaVisao,
  somaDosValores,
  valorCurto,
  type FiltroDePrevisao,
  type FiltroDeStatus,
  type Filtros,
  type Visao,
} from "../../lib/negocios";
import { Icone, type NomeDoIcone } from "./icones";
import { KanbanDoPipeline } from "./kanban-do-pipeline";
import { ListaDeNegocios } from "./lista-de-negocios";

export type AcoesDoNegocio = {
  moverEtapa: (negocio: Deal, etapaId: string) => Promise<void>;
  ganhar: (negocio: Deal) => void;
  perder: (negocio: Deal) => void;
  transferir: (negocio: Deal) => void;
  novoNaEtapa: (etapaId: string) => void;
  emLote: (ids: string[], acao: BulkDealsAction) => Promise<boolean>;
};

const comCor = (cor: string) => ({ "--cor": cor }) as CSSProperties;

function Indicador({ icone, rotulo, children, detalhe, alerta }: { icone: NomeDoIcone; rotulo: string; children: ReactNode; detalhe: ReactNode; alerta?: boolean }) {
  return (
    <div className={`indicador-pipeline${alerta ? " indicador-pipeline--alerta" : ""}`}>
      <span className="indicador-icone" aria-hidden="true">
        <Icone nome={icone} tamanho={18} />
      </span>
      <div className="indicador-texto">
        <span className="indicador-rotulo">{rotulo}</span>
        <span className="indicador-valor">{children}</span>
        <span className="indicador-detalhe">{detalhe}</span>
      </div>
    </div>
  );
}

const PREVISOES: { valor: FiltroDePrevisao; rotulo: string }[] = [
  { valor: "qualquer", rotulo: "Qualquer previsão" },
  { valor: "atrasada", rotulo: "Previsão vencida" },
  { valor: "este-mes", rotulo: "Fecha este mês" },
  { valor: "proximo-mes", rotulo: "Fecha mês que vem" },
  { valor: "sem-previsao", rotulo: "Sem previsão" },
];

const STATUS: { valor: FiltroDeStatus; rotulo: string }[] = [
  { valor: "open", rotulo: "Abertos" },
  { valor: "won", rotulo: "Ganhos" },
  { valor: "lost", rotulo: "Perdidos" },
  { valor: "todos", rotulo: "Todos" },
];

/** Indicadores, filtros e a visão escolhida (Kanban ou Lista) do pipeline aberto. */
export function QuadroDoPipeline({
  pipeline,
  negocios,
  visao,
  usuarioId,
  acoes,
}: {
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
  // No Kanban só entram os abertos: ganho e perdido saem do quadro.
  const visiveis = useMemo(
    () => aplicarFiltros(negocios, visao === "kanban" ? { ...filtros, status: "open" } : filtros, hoje),
    [negocios, filtros, visao, hoje],
  );
  const filtrar = (parcial: Partial<Filtros>) => setFiltros((atual) => ({ ...atual, ...parcial }));
  const estaFiltrando = filtros.busca !== "" || filtros.responsavel !== "" || filtros.etiqueta !== "" || filtros.previsao !== "qualquer";

  return (
    <div className="quadro-pipeline" style={comCor(pipeline.color)}>
      <section className="indicadores-pipeline" aria-label={`Resumo do pipeline ${pipeline.name}`}>
        <Indicador icone="negocios" rotulo="Negócios abertos" detalhe={abertos.length === 0 ? "Nenhum negócio aberto" : `em ${pipeline.stages.length} etapas`}>
          {abertos.length}
        </Indicador>
        <Indicador icone="valor" rotulo={`${pipeline.valueLabel} em aberto`} detalhe="Soma dos negócios abertos">
          {valorCurto(somaDosValores(abertos))}
        </Indicador>
        <Indicador icone="relogio" rotulo="Parados" detalhe={parados > 0 ? "Além do prazo da etapa" : "Nenhum além do prazo"} alerta={parados > 0}>
          {parados}
        </Indicador>
        <Indicador icone="check" rotulo={pipeline.wonLabel} detalhe={ganhos.length > 0 ? `${valorCurto(somaDosValores(ganhos))} no total` : "Nenhum ainda"}>
          {ganhos.length}
        </Indicador>
      </section>

      <section className="painel-quadro" aria-label={`Negócios do pipeline ${pipeline.name}`}>
        <div className="barra-negocios">
          <nav className="seletor-visao" aria-label="Visão">
            {(["kanban", "lista"] as const).map((v) => (
              <Link key={v} href={hrefDaVisao(pipeline.id, v)} aria-current={visao === v ? "page" : undefined} scroll={false}>
                <Icone nome={v === "kanban" ? "etapas" : "lista"} tamanho={15} />
                {v === "kanban" ? "Kanban" : "Lista"}
              </Link>
            ))}
          </nav>
          <label className="busca-negocios">
            <Icone nome="busca" tamanho={15} />
            <input type="search" placeholder="Buscar negócio, cliente ou contato" aria-label="Buscar negócios" value={filtros.busca} onChange={(e) => filtrar({ busca: e.target.value })} />
          </label>
          <select aria-label="Responsável" value={filtros.responsavel} onChange={(e) => filtrar({ responsavel: e.target.value })}>
            <option value="">Todos os responsáveis</option>
            {usuarioId && pipeline.members.some((m) => m.userId === usuarioId) ? <option value={usuarioId}>Só os meus</option> : null}
            {pipeline.members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name}
              </option>
            ))}
          </select>
          {pipeline.tags.length > 0 ? (
            <select aria-label="Etiqueta" value={filtros.etiqueta} onChange={(e) => filtrar({ etiqueta: e.target.value })}>
              <option value="">Todas as etiquetas</option>
              {pipeline.tags.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          ) : null}
          <select aria-label="Previsão de fechamento" value={filtros.previsao} onChange={(e) => filtrar({ previsao: e.target.value as FiltroDePrevisao })}>
            {PREVISOES.map((p) => (
              <option key={p.valor} value={p.valor}>
                {p.rotulo}
              </option>
            ))}
          </select>
          {visao === "lista" ? (
            <select aria-label="Situação" value={filtros.status} onChange={(e) => filtrar({ status: e.target.value as FiltroDeStatus })}>
              {STATUS.map((s) => (
                <option key={s.valor} value={s.valor}>
                  {s.rotulo}
                </option>
              ))}
            </select>
          ) : null}
          {estaFiltrando ? (
            <button type="button" className="limpar-filtros" onClick={() => setFiltros((atual) => ({ ...FILTROS_INICIAIS, status: atual.status }))}>
              Limpar filtros
            </button>
          ) : null}
          <span className="resumo-negocios" role="status">
            <b>{visiveis.length}</b> {visiveis.length === 1 ? "negócio" : "negócios"} · <b>{valorCurto(somaDosValores(visiveis))}</b>
          </span>
        </div>

        {visao === "kanban" ? (
          <KanbanDoPipeline pipeline={pipeline} negocios={visiveis} acoes={acoes} />
        ) : (
          <ListaDeNegocios pipeline={pipeline} negocios={visiveis} acoes={acoes} />
        )}
      </section>
    </div>
  );
}
