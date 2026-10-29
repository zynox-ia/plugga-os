"use client";

import type { Deal, Pipeline } from "@plugga/shared";
import { Filter, RotateCcw } from "lucide-react";
import { useId, useState } from "react";

import {
  FILTROS_INICIAIS,
  somaDosValores,
  valorCurto,
  type FiltroDePrevisao,
  type FiltroDeStatus,
  type Filtros,
  type Visao,
} from "../../lib/negocios";
import { IconSearch } from "../ui";
import estilos from "./tela-pipelines.module.css";

const PREVISOES: { valor: FiltroDePrevisao; rotulo: string }[] = [
  { valor: "qualquer", rotulo: "Qualquer previsão" },
  { valor: "atrasada", rotulo: "Previsão vencida" },
  { valor: "este-mes", rotulo: "Fecha este mês" },
  { valor: "proximo-mes", rotulo: "Fecha mês que vem" },
  { valor: "sem-previsao", rotulo: "Sem previsão" },
];

export function FiltrosDoPipeline({
  pipeline,
  visao,
  usuarioId,
  filtros,
  filtrar,
  negocios,
}: {
  pipeline: Pipeline;
  visao: Visao;
  usuarioId: string | null;
  filtros: Filtros;
  filtrar: (parcial: Partial<Filtros>) => void;
  negocios: Deal[];
}) {
  const [abertos, setAbertos] = useState(false);
  const id = useId();
  const quantidade = [
    filtros.responsavel,
    filtros.etiqueta,
    filtros.previsao !== "qualquer",
    visao !== "kanban" && filtros.status !== "open",
  ].filter(Boolean).length;

  return (
    <>
      <div className={estilos.barraFiltros}>
        <div className={estilos.filtrosEsquerda}>
          {/* Campo de Busca idêntico à tela de equipe */}
          <div className="equipe-busca">
            <IconSearch className="equipe-busca-icon" />
            <input
              type="search"
              className="equipe-busca-input"
              placeholder="Buscar negócio, cliente ou contato…"
              aria-label="Buscar negócios"
              value={filtros.busca}
              onChange={(e) => filtrar({ busca: e.target.value })}
            />
          </div>

          {/* Botão de Filtros */}
          <button
            className={estilos.botaoFiltro}
            type="button"
            aria-expanded={abertos}
            aria-controls={id}
            onClick={() => setAbertos((atual) => !atual)}
          >
            <Filter size={14} aria-hidden="true" />
            <span>Filtros</span>
            {quantidade > 0 ? <span className={estilos.contadorFiltro}>{quantidade}</span> : null}
          </button>

          {/* Botão Limpar Filtros */}
          {quantidade > 0 || filtros.busca ? (
            <button
              type="button"
              className={`limpar-filtros ${estilos.botaoLimparFiltros}`}
              onClick={() => filtrar(FILTROS_INICIAIS)}
            >
              <RotateCcw size={13} aria-hidden="true" />
              Limpar filtros
            </button>
          ) : null}
        </div>

        {/* Resumo Métrico dos Resultados Filtrados */}
        <span className={`resumo-negocios ${estilos.resumoNegocios}`} role="status">
          <b>{negocios.length}</b> {negocios.length === 1 ? "negócio" : "negócios"} ·{" "}
          <b>{valorCurto(somaDosValores(negocios))}</b>
        </span>
      </div>

      {/* Painel Desdobrável com Campos de Filtro */}
      <div id={id} className={estilos.campos} role="group" aria-label="Filtros dos negócios" hidden={!abertos}>
        <label className={estilos.campoItem}>
          <span>Responsável</span>
          <select value={filtros.responsavel} onChange={(e) => filtrar({ responsavel: e.target.value })}>
            <option value="">Todos os responsáveis</option>
            {usuarioId && pipeline.members.some((m) => m.userId === usuarioId) ? (
              <option value={usuarioId}>Só os meus</option>
            ) : null}
            {pipeline.members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name}
              </option>
            ))}
          </select>
        </label>

        {pipeline.tags.length > 0 ? (
          <label className={estilos.campoItem}>
            <span>Etiqueta</span>
            <select value={filtros.etiqueta} onChange={(e) => filtrar({ etiqueta: e.target.value })}>
              <option value="">Todas as etiquetas</option>
              {pipeline.tags.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className={estilos.campoItem}>
          <span>Previsão de fechamento</span>
          <select
            value={filtros.previsao}
            onChange={(e) => filtrar({ previsao: e.target.value as FiltroDePrevisao })}
          >
            {PREVISOES.map((p) => (
              <option key={p.valor} value={p.valor}>
                {p.rotulo}
              </option>
            ))}
          </select>
        </label>

        {visao !== "kanban" ? (
          <label className={estilos.campoItem}>
            <span>Situação</span>
            <select
              value={filtros.status}
              onChange={(e) => filtrar({ status: e.target.value as FiltroDeStatus })}
            >
              <option value="open">Abertos</option>
              <option value="won">Ganhos</option>
              <option value="lost">Perdidos</option>
              <option value="todos">Todos</option>
            </select>
          </label>
        ) : null}
      </div>
    </>
  );
}
