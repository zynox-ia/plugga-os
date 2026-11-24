import type { EtapaDeLancamento, TipoDeLancamento } from "@plugga/shared";

import type { MudancaDoLancamento } from "../financeiro/reflexo-do-lancamento";

/**
 * O que cada fato de um lançamento pede ao OMIE (PLU-342). É regra do conector: o
 * Financeiro só avisa o que mudou (`ReflexosDoLancamento`), e o conector decide aqui.
 * O pedido vai ao outbox `omie_envios` na transação da mudança e só sai do Plugga OS
 * com a integração em `write` (a fila confere). Regras puras, sem banco.
 */

export const operacoesNoOmie = ["upsert", "baixa", "gerar_boleto", "cancelar"] as const;
export type OperacaoNoOmie = (typeof operacoesNoOmie)[number];

type Lancamento = { tipo: TipoDeLancamento; etapa: EtapaDeLancamento };

/**
 * O lançamento já é um título no OMIE: a saída depois de aprovada (F12 do escopo),
 * a entrada desde que a cobrança é gerada (D10).
 */
export const ehTituloNoOmie = (l: Lancamento): boolean => l.tipo === "entrada" || l.etapa !== "aberta";

/**
 * Os envios de um fato, na ordem em que saem, a partir do estado ANTERIOR a ele.
 * `chegouAoOmie`: algum upsert do lançamento já foi enviado ou está saindo; só então
 * o cancelamento precisa ir ao OMIE.
 */
export function enviosDoFato(antes: Lancamento, mudanca: MudancaDoLancamento, chegouAoOmie: boolean): OperacaoNoOmie[] {
  switch (mudanca) {
    case "criado":
      // A cobrança manual nasce título no OMIE (D10); a conta a pagar, só ao ser aprovada.
      return antes.tipo === "entrada" ? ["upsert"] : [];
    case "aprovado":
      return ["upsert"];
    case "editado":
    case "valor_corrigido":
      // O boleto é manual (o PDF anexado; na correção, o novo também): pedir `gerar_boleto`
      // daria um segundo boleto. O boleto por provedor trocável é a fase 2.
      return ehTituloNoOmie(antes) ? ["upsert"] : [];
    case "pago":
    case "recebido":
      return ["baixa"];
    case "cancelado":
      return chegouAoOmie ? ["cancelar"] : [];
    case "nf_registrada":
    case "boleto_registrado":
    case "enviado":
    case "cobranca_registrada":
      return [];
  }
}

/**
 * A baixa (e o boleto) só valem sobre um título que existe no OMIE. Se o lançamento
 * nunca pediu o título ao conector (aprovado ou criado com a empresa sem conexão, e a
 * conexão ligada depois), o título vai antes, na mesma chamada: a ordem da fila segura
 * a baixa até ele chegar. `temTitulo`: há algum upsert do lançamento no outbox, em
 * qualquer estado.
 */
export function comOTituloAntes(operacoes: readonly OperacaoNoOmie[], temTitulo: boolean): OperacaoNoOmie[] {
  const precisaDoTitulo = operacoes.some((o) => o === "baixa" || o === "gerar_boleto");
  return precisaDoTitulo && !temTitulo && !operacoes.includes("upsert") ? ["upsert", ...operacoes] : [...operacoes];
}

/** Chave de idempotência na fila: duas aprovações seguidas viram um envio (seção 5 do desenho). */
export const chaveDoEnvio = (empresa: string, lancamentoId: string, operacao: OperacaoNoOmie): string =>
  `omie:${empresa}:lancamento:${lancamentoId}:${operacao}`;
