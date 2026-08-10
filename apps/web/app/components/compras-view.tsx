"use client";

import type { ComprasEtapa, PedidoResumo, SituacaoPrazo } from "@plugga/shared";
import Link from "next/link";
import { useState } from "react";

import { ShellCard, ShellTable, StatusPill } from "./plugga-shell";

/**
 * Funil de Compras — as sete etapas do POP-COMP-001 na ordem do fluxograma.
 *
 * O selo de SLA aparece no próprio card, e não só no scorecard da semana: a
 * régua de prazos do §3 só muda comportamento se estiver visível no dia em que
 * a pessoa decide o que fazer primeiro.
 */

export const ETAPAS: { id: ComprasEtapa; label: string }[] = [
  { id: "pedido_gerado", label: "Pedido gerado" },
  { id: "analise_estoque", label: "Análise de estoque" },
  { id: "cotacoes", label: "Cotações" },
  { id: "aprovacao_compra", label: "Aprovação" },
  { id: "pagamento", label: "Pagamento" },
  { id: "retirada", label: "Retirada" },
  { id: "concluido", label: "Concluído" },
];

const SELO_DE_PRAZO: Record<SituacaoPrazo, { texto: string; variante: "neutral" | "warning" | "danger" }> = {
  no_prazo: { texto: "No prazo", variante: "neutral" },
  vence_hoje: { texto: "Vence hoje", variante: "warning" },
  vencida: { texto: "Vencida", variante: "danger" },
  sem_prazo: { texto: "Sem prazo", variante: "neutral" },
};

type AbaId = "kanban" | "lista" | "vencidas" | "concluidas";

const ABAS: { id: AbaId; label: string }[] = [
  { id: "kanban", label: "Kanban" },
  { id: "lista", label: "Lista" },
  { id: "vencidas", label: "Vencidas" },
  { id: "concluidas", label: "Concluídas" },
];

function moeda(valor: string | null): string {
  if (!valor) return "—";
  return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function data(valor: string | null): string {
  if (!valor) return "—";
  return new Date(valor).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function naAba(pedido: PedidoResumo, aba: AbaId): boolean {
  switch (aba) {
    case "kanban":
    case "lista":
      return pedido.etapa !== "concluido";
    case "vencidas":
      return pedido.situacaoPrazo === "vencida" && pedido.etapa !== "concluido";
    case "concluidas":
      return pedido.etapa === "concluido";
  }
}

export function ComprasView({
  items,
  isLive,
  empresa,
}: {
  items: PedidoResumo[];
  isLive: boolean;
  empresa: string;
}) {
  const [aba, setAba] = useState<AbaId>("kanban");
  const filtrados = items.filter((pedido) => naAba(pedido, aba));
  const vencidas = items.filter((pedido) => pedido.situacaoPrazo === "vencida" && pedido.etapa !== "concluido").length;

  const href = (pedido: PedidoResumo) => `/compras/${pedido.id}?empresa=${empresa}`;

  return (
    <ShellCard className="table-card">
      <div className="card-heading">
        <div>
          <span className="eyebrow">Financeiro · POP-COMP-001</span>
          <h2>Compras e Suprimentos</h2>
        </div>
        <div className="row-actions">
          {!isLive ? <StatusPill variant="warning">Dados de exemplo (API indisponível)</StatusPill> : null}
          {vencidas > 0 ? <StatusPill variant="danger">{vencidas} vencida(s)</StatusPill> : null}
          <Link className="button" href={`/compras/scorecard?empresa=${empresa}`}>
            Scorecard
          </Link>
          <Link className="button button--accent" href={`/compras/novo?empresa=${empresa}`}>
            + Novo pedido
          </Link>
        </div>
      </div>

      <div role="tablist" aria-label="Filtros de pedidos de compra" className="view-tabs">
        {ABAS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={item.id === aba}
            className={`view-tab${item.id === aba ? " view-tab--active" : ""}`}
            onClick={() => setAba(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {aba === "kanban" ? (
        <div className="kanban" style={{ gridTemplateColumns: "repeat(7, minmax(170px, 1fr))" }}>
          {ETAPAS.map((etapa) => {
            const daEtapa = filtrados.filter((pedido) => pedido.etapa === etapa.id);
            return (
              <div className="kanban-column" key={etapa.id}>
                <div className="column-heading">
                  <span>{etapa.label}</span>
                  <span className="count-pill">{daEtapa.length}</span>
                </div>
                {daEtapa.map((pedido) => {
                  const selo = SELO_DE_PRAZO[pedido.situacaoPrazo];
                  return (
                    <Link className="lead-card" href={href(pedido)} key={pedido.id}>
                      <strong>
                        #{pedido.numero} · {pedido.titulo}
                      </strong>
                      <span>{pedido.obraNome ?? pedido.clientNome ?? "Interno"}</span>
                      <span>Orçado: {moeda(pedido.valorOrcado)}</span>
                      <span>Prazo da etapa: {data(pedido.prazoEtapaEm)}</span>
                      <StatusPill variant={selo.variante}>{selo.texto}</StatusPill>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </div>
      ) : (
        <ShellTable caption="Pedidos de compra">
          <thead>
            <tr>
              <th>Nº</th>
              <th>Pedido</th>
              <th>Destino</th>
              <th>Etapa</th>
              <th>Orçado</th>
              <th>Prazo</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((pedido) => {
              const selo = SELO_DE_PRAZO[pedido.situacaoPrazo];
              return (
                <tr key={pedido.id}>
                  <td>{pedido.numero}</td>
                  <td>
                    <Link href={href(pedido)}>{pedido.titulo}</Link>
                  </td>
                  <td>{pedido.obraNome ?? pedido.clientNome ?? "Interno"}</td>
                  <td>{ETAPAS.find((etapa) => etapa.id === pedido.etapa)?.label ?? pedido.etapa}</td>
                  <td>{moeda(pedido.valorOrcado)}</td>
                  <td>
                    {data(pedido.prazoEtapaEm)} <StatusPill variant={selo.variante}>{selo.texto}</StatusPill>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </ShellTable>
      )}

      {filtrados.length === 0 ? <p className="card-note">Nenhum pedido nesta visão.</p> : null}
    </ShellCard>
  );
}
