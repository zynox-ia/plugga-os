"use client";

import type { BulkDealsAction, Deal, Pipeline } from "@plugga/shared";
import { useState, type CSSProperties } from "react";

import { formatarData } from "../../lib/format";
import { diasNaEtapa, estaParado, ordenar, ROTULO_STATUS, valorCurto, type Ordem } from "../../lib/negocios";
import { MenuDoNegocio } from "./cartao-de-negocio";
import { Avatar } from "./icones";
import type { AcoesDoNegocio } from "./quadro-do-pipeline";

const COLUNAS: { campo: Ordem["campo"] | null; rotulo: string }[] = [
  { campo: "titulo", rotulo: "Negócio" },
  { campo: null, rotulo: "Cliente" },
  { campo: "etapa", rotulo: "Etapa" },
  { campo: "valor", rotulo: "Valor" },
  { campo: "previsao", rotulo: "Previsão" },
  { campo: "dias", rotulo: "Na etapa" },
  { campo: null, rotulo: "Responsável" },
];

type Lote = { tipo: "owner" | "tag" | "stage"; valor: string };

/** Os mesmos negócios do Kanban, em tabela: ordenação, seleção e ações em lote. */
export function ListaDeNegocios({ pipeline, negocios, acoes }: { pipeline: Pipeline; negocios: Deal[]; acoes: AcoesDoNegocio }) {
  const [ordem, setOrdem] = useState<Ordem>({ campo: "etapa", direcao: "asc" });
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [lote, setLote] = useState<Lote>({ tipo: "owner", valor: "" });
  const [aplicando, setAplicando] = useState(false);

  const linhas = ordenar(negocios, ordem, pipeline);
  const visiveis = new Set(linhas.map((n) => n.id));
  const marcados = [...selecionados].filter((id) => visiveis.has(id));
  const todos = linhas.length > 0 && marcados.length === linhas.length;

  const alternar = (id: string) =>
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });

  const opcoesDoLote =
    lote.tipo === "owner"
      ? pipeline.members.map((m) => ({ id: m.userId, nome: m.name }))
      : lote.tipo === "tag"
        ? pipeline.tags.map((t) => ({ id: t.id, nome: t.name }))
        : pipeline.stages.map((e) => ({ id: e.id, nome: e.name }));

  async function aplicarLote() {
    if (!lote.valor) return;
    const acao: BulkDealsAction =
      lote.tipo === "owner" ? { type: "owner", ownerId: lote.valor } : lote.tipo === "tag" ? { type: "tag", tagId: lote.valor } : { type: "stage", stageId: lote.valor };
    setAplicando(true);
    const ok = await acoes.emLote(marcados, acao);
    setAplicando(false);
    if (ok) {
      setSelecionados(new Set());
      setLote((atual) => ({ ...atual, valor: "" }));
    }
  }

  if (linhas.length === 0) {
    return <p className="lista-negocios-vazia">Nenhum negócio com estes filtros.</p>;
  }

  return (
    <div className="lista-negocios">
      {marcados.length > 0 ? (
        <div className="barra-lote" role="region" aria-label="Ações em lote">
          <b>{marcados.length === 1 ? "1 selecionado" : `${marcados.length} selecionados`}</b>
          <select aria-label="Ação em lote" value={lote.tipo} onChange={(e) => setLote({ tipo: e.target.value as Lote["tipo"], valor: "" })}>
            <option value="owner">Trocar responsável</option>
            {pipeline.tags.length > 0 ? <option value="tag">Adicionar etiqueta</option> : null}
            <option value="stage">Mover de etapa</option>
          </select>
          <select aria-label="Destino da ação" value={lote.valor} onChange={(e) => setLote((atual) => ({ ...atual, valor: e.target.value }))}>
            <option value="">Escolha…</option>
            {opcoesDoLote.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome}
              </option>
            ))}
          </select>
          <button type="button" className="button button--accent" disabled={!lote.valor || aplicando} onClick={aplicarLote}>
            {aplicando ? "Aplicando…" : "Aplicar"}
          </button>
          <button type="button" className="link-lote" onClick={() => setSelecionados(new Set())}>
            Limpar seleção
          </button>
        </div>
      ) : null}

      <div className="tabela-negocios-rolagem">
        <table className="tabela-negocios">
          <caption className="sr-only">Negócios do pipeline {pipeline.name}</caption>
          <thead>
            <tr>
              <th scope="col" className="coluna-marcar">
                <input type="checkbox" aria-label="Selecionar todos" checked={todos} onChange={() => setSelecionados(todos ? new Set() : new Set(linhas.map((n) => n.id)))} />
              </th>
              {COLUNAS.map((c) => (
                <th key={c.rotulo} scope="col" aria-sort={c.campo && ordem.campo === c.campo ? (ordem.direcao === "asc" ? "ascending" : "descending") : undefined}>
                  {c.campo ? (
                    <button
                      type="button"
                      className="ordenar"
                      onClick={() => setOrdem((atual) => ({ campo: c.campo!, direcao: atual.campo === c.campo && atual.direcao === "asc" ? "desc" : "asc" }))}
                    >
                      {c.rotulo}
                      {ordem.campo === c.campo ? <span aria-hidden="true">{ordem.direcao === "asc" ? " ↑" : " ↓"}</span> : null}
                    </button>
                  ) : (
                    c.rotulo
                  )}
                </th>
              ))}
              <th scope="col">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((n) => {
              const etapa = pipeline.stages.find((e) => e.id === n.stageId);
              const parado = estaParado(n, pipeline);
              return (
                <tr key={n.id} className={selecionados.has(n.id) ? "linha-marcada" : undefined}>
                  <td className="coluna-marcar">
                    <input type="checkbox" aria-label={`Selecionar ${n.title}`} checked={selecionados.has(n.id)} onChange={() => alternar(n.id)} />
                  </td>
                  <td>
                    <b className="titulo-negocio">{n.title}</b>
                    {n.status !== "open" ? <span className={`selo-status selo-status--${n.status}`}>{n.status === "won" ? pipeline.wonLabel : ROTULO_STATUS[n.status]}</span> : null}
                    {n.tags.length > 0 ? (
                      <span className="etiquetas-linha">
                        {n.tags.map((t) => (
                          <span key={t.id} className="etiqueta" style={{ "--cor": t.color } as CSSProperties}>
                            {t.name}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </td>
                  <td>{n.client.name}</td>
                  <td>
                    <span className="etapa-linha">
                      <span className="ponto-cor" style={{ background: etapa?.color }} aria-hidden="true" />
                      {etapa?.name}
                    </span>
                  </td>
                  <td className="valor-linha">{n.value ? valorCurto(Number(n.value)) : "—"}</td>
                  <td>{n.expectedCloseDate ? formatarData(`${n.expectedCloseDate}T12:00:00Z`) : "—"}</td>
                  <td className={parado ? "dias-linha dias-linha--parado" : "dias-linha"}>{n.status === "open" ? `${diasNaEtapa(n)}d` : "—"}</td>
                  <td>
                    <span className="responsavel-linha">
                      <Avatar id={n.owner.id} nome={n.owner.name} tamanho="pequeno" />
                      {n.owner.name}
                    </span>
                  </td>
                  <td>{n.status === "open" ? <MenuDoNegocio negocio={n} pipeline={pipeline} acoes={acoes} /> : null}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
