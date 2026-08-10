import type {
  FaturaNormativa,
  InvoiceContext,
  InvoiceData,
  ItemDaFatura,
  ReconciledInvoiceItem,
} from "@plugga/shared";

import { PREMISSAS_PADRAO } from "./motor-solar-bess.js";
import type { CasoDoEstudo, ModoDoEstudo } from "./pipeline.js";

/**
 * Ponte entre a fatura como o Plugga OS a guarda e a fatura como a norma a
 * confere.
 *
 * A casca continua sendo dona da leitura: ela extrai o PDF, categoriza itens e
 * grava. O núcleo normativo não conhece nada disso — recebe a forma do pacote e
 * aplica as travas. Esta função é o único lugar onde as duas formas se
 * encontram, e por isso ela não valida nada: campo que falta chega vazio e é a
 * trava que reprova, exatamente como o oráculo faz ao ler um JSON incompleto.
 */

/** CAPEX de referência por unidade BESS (PRD §8.5). */
export const CAPEX_POR_BESS = 550_000.0;

export type DadosDaUnidade = {
  cliente: string;
  unidadeConsumidora: string;
  mesDeCompetencia: number;
  anoDeCompetencia: number;
};

export class EstudoSemPremissaError extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = "EstudoSemPremissaError";
  }
}

function quantidadePorUnidade(item: ReconciledInvoiceItem): Partial<ItemDaFatura> {
  if (item.quantidade === null || item.unidade === null) return {};
  return item.unidade === "kWh" ? { kwh: item.quantidade } : { kw: item.quantidade };
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
 * A modalidade decide o motor: azul paga a energia igual dentro e fora da
 * ponta, e a dor está na demanda — é peak shaving. Verde é Solar+BESS. Deixar
 * isso implícito foi o defeito que a auditoria encontrou, quando um cliente
 * azul ficava verde rodando o motor errado.
 */
export function modoPelaModalidade(modalidade: "verde" | "azul"): ModoDoEstudo {
  return modalidade === "azul" ? "peak_shaving" : "solar_bess";
}

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
    ...(!contexto.apelido ? {} : { apelido: contexto.apelido }),
    distribuidora: contexto.distribuidora,
    regime: contexto.regime,
    grupo: contexto.grupo,
    modalidade: contexto.modalidade,
    ...(!contexto.classe ? {} : { classeDisplay: contexto.classe }),
    ...(!contexto.leituraAnterior
      ? {}
      : { leituraAnterior: contexto.leituraAnterior }),
    ...(!contexto.leituraAtual ? {} : { leituraAtual: contexto.leituraAtual }),
    referencia: `${String(unidade.mesDeCompetencia).padStart(2, "0")}/${unidade.anoDeCompetencia}`,
    vencimento: contexto.vencimento ?? "",
    funcao: modoPelaModalidade(contexto.modalidade),

    total: fatura.valorTotal,
    itens: compoem.map(paraItem),
    naoCobrados: informativos.map((item) => ({ nome: item.nome, valor: item.valor })),

    consumoPontaKwh: fatura.consumoPontaKwh,
    consumoFpKwh: fatura.consumoForaPontaKwh,
    demandaContratadaKw: fatura.demandaContratadaKw,
    demandaRegistradaPontaKw: fatura.demandaMedidaPontaKw,
    demandaRegistradaFpKw: fatura.demandaMedidaForaPontaKw,

    tarifaPontaTotal: fatura.tarifaPonta,
    tarifaFpTotal: fatura.tarifaForaPonta,
    ...(fatura.tarifaDemanda === undefined ? {} : { tarifaDemandaKw: fatura.tarifaDemanda }),
    reativoPontaValor: 0,
    reativoFpValor: fatura.valorReativo,
    beneficioIsencaoValor: fatura.valorBeneficioFiscal,
  };
}

/**
 * Número de unidades sugerido pela energia, pela mesma conta do motor. É ele
 * que define o CAPEX de referência quando o estudo não traz valor aprovado.
 */
export function unidadesSugeridas(consumoPontaKwhMes: number): number {
  const p = PREMISSAS_PADRAO;
  const utilPorBess =
    p.potenciaBessKw * p.dod * p.etaRt * p.etaEle * p.etaOp * p.diasUteisMes;

  return Math.max(1, -Math.floor(-consumoPontaKwhMes / utilPorBess));
}

/**
 * Monta o caso do motor a partir da fatura normativa. As tarifas vêm da própria
 * fatura — é o que a coerência do construtor do relatório exige —, e o HSP vem
 * da unidade, sem padrão silencioso.
 */
export function casoDoMotorDaFatura(
  fatura: FaturaNormativa,
  hspMensal: readonly number[] | null,
): CasoDoEstudo {
  if (!hspMensal || hspMensal.length !== 12) {
    throw new EstudoSemPremissaError(
      "estudo sem irradiação mensal (HSP) da unidade: informe os 12 valores antes de calcular",
    );
  }

  const unidades = unidadesSugeridas(fatura.consumoPontaKwh);
  const peak = fatura.funcao === "peak_shaving";

  return {
    funcao: fatura.funcao ?? "solar_bess",
    consumoPontaDesejadoKwhMes: fatura.consumoPontaKwh,
    nBess: null,
    capexBessTotal: unidades * CAPEX_POR_BESS,
    tusdP: peak ? null : (fatura.tarifaPontaTotal ?? 0),
    teP: peak ? null : 0,
    tusdFp: fatura.tarifaFpTotal ?? 0,
    teFp: 0,
    hspMensal: [...hspMensal],
    solarKwp: 0,
    capexSolarTotal: 0,
    ...(peak
      ? {
          demandaPontaMedidaKw: fatura.demandaRegistradaPontaKw ?? 0,
          tarifaKwPontaMedida: fatura.tarifaKwPontaMedida ?? 0,
          demandaPontaNcKw: 0,
          tarifaKwPontaNc: fatura.tarifaKwPontaNc ?? 0,
          contratoPontaNovoKw: 0,
        }
      : {}),
  };
}

/**
 * Conta quantos itens puderam ter tarifa × quantidade conferida. A prova
 * guardada carrega esse par desde a V1: item sem quantidade não é erro, mas é
 * conferência que não aconteceu.
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
