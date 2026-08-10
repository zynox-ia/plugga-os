import type {
  FaturaNormativa,
  InvoiceContext,
  InvoiceData,
  ItemDaFatura,
  ReconciledInvoiceItem,
} from "@plugga/shared";

/**
 * Ponte entre a fatura como o Plugga OS a guarda e a fatura como a norma a
 * confere.
 *
 * A casca continua sendo dona da leitura: ela extrai o PDF, categoriza itens e
 * grava. O núcleo normativo não conhece nada disso — ele recebe a forma do
 * pacote e aplica a Trava 1. Esta função é o único lugar onde as duas formas se
 * encontram, e por isso ela não valida nada: campo que falta chega vazio e é a
 * trava que reprova, exatamente como o oráculo faz ao ler um JSON incompleto.
 */

export type DadosDaUnidade = {
  cliente: string;
  unidadeConsumidora: string;
  mesDeCompetencia: number;
  anoDeCompetencia: number;
};

function quantidadePorUnidade(item: ReconciledInvoiceItem): Partial<ItemDaFatura> {
  if (item.quantidade === null || item.unidade === null) return {};
  return item.unidade === "kWh"
    ? { kwh: item.quantidade }
    : { kw: item.quantidade };
}

function paraItem(item: ReconciledInvoiceItem): ItemDaFatura {
  return {
    nome: item.nome,
    valor: item.valor,
    ...quantidadePorUnidade(item),
    ...(item.tarifa === null ? {} : { tarifa: item.tarifa }),
  };
}

/**
 * Itens que não compõem o total são metadados técnicos — demanda contratada,
 * medições — e ficam fora da soma, do mesmo jeito que a bandeira informativa de
 * Santa Tereza ficou.
 */
export function faturaNormativaDoSistema(
  fatura: InvoiceData,
  contexto: InvoiceContext,
  unidade: DadosDaUnidade,
): FaturaNormativa {
  const compoem = contexto.itens.filter((item) => item.compoeTotal);
  const informativos = contexto.itens.filter((item) => !item.compoeTotal);

  return {
    cliente: unidade.cliente,
    uc: unidade.unidadeConsumidora,
    distribuidora: contexto.distribuidora,
    regime: contexto.regime,
    grupo: contexto.grupo,
    modalidade: contexto.modalidade,
    referencia: `${String(unidade.mesDeCompetencia).padStart(2, "0")}/${unidade.anoDeCompetencia}`,
    vencimento: contexto.vencimento ?? "",

    total: fatura.valorTotal,
    itens: compoem.map(paraItem),
    naoCobrados: informativos.map((item) => ({
      nome: item.nome,
      valor: item.valor,
    })),

    consumoPontaKwh: fatura.consumoPontaKwh,
    consumoFpKwh: fatura.consumoForaPontaKwh,
    demandaContratadaKw: fatura.demandaContratadaKw,
    demandaRegistradaPontaKw: fatura.demandaMedidaPontaKw,
    demandaRegistradaFpKw: fatura.demandaMedidaForaPontaKw,

    tarifaPontaTotal: fatura.tarifaPonta,
    tarifaFpTotal: fatura.tarifaForaPonta,
  };
}

/**
 * Conta quantos itens puderam ter tarifa × quantidade conferida. A prova
 * guardada pelo sistema carrega esse par desde a V1, e ele continua útil: item
 * sem quantidade não é erro, mas é conferência que não aconteceu.
 */
export function contarConferencias(fatura: FaturaNormativa): {
  itensConferidos: number;
  itensSemConferencia: number;
} {
  const conferidos = fatura.itens.filter(
    (item) => (item.kwh ?? item.kw) !== undefined && item.tarifa !== undefined,
  ).length;

  return {
    itensConferidos: conferidos,
    itensSemConferencia: fatura.itens.length - conferidos,
  };
}
