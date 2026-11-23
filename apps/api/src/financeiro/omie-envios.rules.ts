import type { EtapaDeLancamento, TipoDeLancamento } from "@plugga/shared";

import type { Plano } from "./financeiro.rules";

/**
 * O que cada mudança de um lançamento pede ao OMIE (PLU-342). O pedido é gravado
 * no outbox `omie_envios` na mesma transação da mudança; só sai do Plugga OS com a
 * integração em `write` (a fila confere). Regras puras, sem banco.
 */

export const operacoesNoOmie = ["upsert", "baixa", "gerar_boleto", "cancelar"] as const;
export type OperacaoNoOmie = (typeof operacoesNoOmie)[number];

type Lancamento = { tipo: TipoDeLancamento; etapa: EtapaDeLancamento };

/**
 * O lançamento já é um título no OMIE: a saída depois de aprovada (F12 do escopo),
 * a entrada desde que a cobrança é gerada (D10).
 */
export const ehTituloNoOmie = (l: Lancamento): boolean => l.tipo === "entrada" || l.etapa !== "aberta";

/** Depois do boleto gerado, mudar o valor pede um boleto novo também no OMIE. */
const comBoleto = (l: Lancamento): boolean => l.tipo === "entrada" && (l.etapa === "boleto_gerado" || l.etapa === "enviada");

/**
 * Os envios de uma ação, na ordem em que saem, a partir do estado ANTERIOR à ação.
 * `chegouAoOmie`: algum upsert do lançamento já foi enviado ou está saindo; só então
 * o cancelamento precisa ir ao OMIE.
 */
export function enviosDaAcao(antes: Lancamento, plano: Plano, chegouAoOmie: boolean): OperacaoNoOmie[] {
  switch (plano.tipo) {
    case "aprovar":
      return ["upsert"];
    case "corrigir_valor":
      if (!ehTituloNoOmie(antes)) return [];
      return comBoleto(antes) ? ["upsert", "gerar_boleto"] : ["upsert"];
    case "registrar_pagamento":
    case "registrar_recebimento":
      return ["baixa"];
    case "cancelar":
      return chegouAoOmie ? ["cancelar"] : [];
    case "registrar_nf":
    case "registrar_boleto":
    case "registrar_envio":
    case "registrar_cobranca":
      return [];
  }
}

/** Editar um título que já está (ou vai estar) no OMIE reenvia a conta; a saída aberta ainda não foi. */
export const enviosDaEdicao = (antes: Lancamento): OperacaoNoOmie[] => (ehTituloNoOmie(antes) ? ["upsert"] : []);

/** A cobrança manual nasce título no OMIE (D10). */
export const ENVIOS_DA_COBRANCA: readonly OperacaoNoOmie[] = ["upsert"];

/** Chave de idempotência na fila: duas aprovações seguidas viram um envio (seção 5 do desenho). */
export const chaveDoEnvio = (empresa: string, lancamentoId: string, operacao: OperacaoNoOmie): string =>
  `omie:${empresa}:lancamento:${lancamentoId}:${operacao}`;
