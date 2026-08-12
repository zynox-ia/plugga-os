import type {
  FaturaNormativa,
  InvoiceContext,
  InvoiceData,
  ItemDaFatura,
  ReconciledInvoiceItem,
} from "@plugga/shared";

import { arredondar, somarComoOOraculo } from "./aritmetica.js";
import { PREMISSAS_PADRAO } from "./motor-solar-bess.js";
import type { CasoDoEstudo, ModoDoEstudo } from "./pipeline.js";

/**
 * Ponte entre a fatura como o plugga-os a guarda e a fatura como a norma a
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

const FORA_PONTA = /\bfora\s+ponta\b|\bf\.?\s*ponta\b|\bf\/ponta\b/i;
const PONTA = /\bponta\b/i;
const MEDIDA = /\bmedida\b/i;
const NAO_CONSUMIDA = /\bn[aã]o\s+consumida\b/i;
const ULTRAPASSAGEM = /\bultrapassagem\b|\bdem\s+ultr\b/i;

function ehPonta(nome: string): boolean {
  return PONTA.test(nome) && !FORA_PONTA.test(nome);
}

function somarValores(itens: readonly ReconciledInvoiceItem[]): number {
  return arredondar(
    somarComoOOraculo(itens.map((item) => item.valor)),
    2,
  );
}

function demandaPublicada(
  itens: readonly ReconciledInvoiceItem[],
  padrao: RegExp,
): ReconciledInvoiceItem | undefined {
  return itens.find(
    (item) =>
      item.categoria === "demanda_faturada" &&
      item.unidade === "kW" &&
      item.quantidade !== null &&
      item.tarifa !== null &&
      ehPonta(item.nome) &&
      padrao.test(item.nome),
  );
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
  const demandaMedidaPonta = demandaPublicada(compoem, MEDIDA);
  const demandaNaoConsumidaPonta = demandaPublicada(compoem, NAO_CONSUMIDA);
  const ultrapassagens = compoem.filter((item) => ULTRAPASSAGEM.test(item.nome));
  const reativos = compoem.filter((item) => item.categoria === "reativo");
  const reativosPonta = reativos.filter((item) => ehPonta(item.nome));
  const reativosForaPonta = reativos.filter((item) => !ehPonta(item.nome));

  return {
    cliente: unidade.cliente,
    uc: unidade.unidadeConsumidora,
    ...(!contexto.apelido ? {} : { apelido: contexto.apelido }),
    distribuidora: contexto.distribuidora,
    regime: contexto.regime,
    grupo: contexto.grupo,
    modalidade: contexto.modalidade,
    // O nome que vai impresso é o mesmo que a pessoa conferiu na tela.
    distribuidoraDisplay: contexto.distribuidora,
    ...(!contexto.classe ? {} : { classeDisplay: contexto.classe }),
    ...(!contexto.localidade ? {} : { localidade: contexto.localidade }),
    ...(!contexto.leituraAnterior
      ? {}
      : { leituraAnterior: contexto.leituraAnterior }),
    ...(!contexto.leituraAtual ? {} : { leituraAtual: contexto.leituraAtual }),
    referencia: `${String(unidade.mesDeCompetencia).padStart(2, "0")}/${unidade.anoDeCompetencia}`,
    vencimento: contexto.vencimento ?? "",
    funcao: modoPelaModalidade(contexto.modalidade),

    total: fatura.valorTotal,
    itens: compoem.map(paraItem),
    naoCobrados: informativos.map((item) => ({
      nome: item.nome,
      valor: item.valor,
      ...(item.motivoForaDoTotal ? { motivo: item.motivoForaDoTotal } : {}),
    })),

    consumoPontaKwh: fatura.consumoPontaKwh,
    consumoFpKwh: fatura.consumoForaPontaKwh,
    demandaContratadaKw: fatura.demandaContratadaKw,
    demandaRegistradaPontaKw: fatura.demandaMedidaPontaKw,
    demandaRegistradaFpKw: fatura.demandaMedidaForaPontaKw,

    tarifaPontaTotal: fatura.tarifaPonta,
    tarifaFpTotal: fatura.tarifaForaPonta,
    ...(demandaMedidaPonta?.tarifa === null || demandaMedidaPonta?.tarifa === undefined
      ? {}
      : { tarifaKwPontaMedida: demandaMedidaPonta.tarifa }),
    ...(demandaNaoConsumidaPonta?.tarifa === null ||
    demandaNaoConsumidaPonta?.tarifa === undefined
      ? {}
      : { tarifaKwPontaNc: demandaNaoConsumidaPonta.tarifa }),
    ...(demandaMedidaPonta || demandaNaoConsumidaPonta
      ? {
          demandaPontaValorTotal: somarValores(
            [demandaMedidaPonta, demandaNaoConsumidaPonta].filter(
              (item): item is ReconciledInvoiceItem => item !== undefined,
            ),
          ),
        }
      : {}),
    ...(fatura.tarifaDemanda === undefined ? {} : { tarifaDemandaKw: fatura.tarifaDemanda }),
    ...(ultrapassagens.length === 0
      ? {}
      : {
          ultrapassagemValor: somarValores(ultrapassagens),
          ultrapassagemKw: ultrapassagens.reduce(
            (total, item) => total + (item.unidade === "kW" ? (item.quantidade ?? 0) : 0),
            0,
          ),
        }),
    ...(contexto.demandaComplementoValor === undefined ||
    contexto.demandaComplementoValor === null
      ? {}
      : { demandaComplementoValor: contexto.demandaComplementoValor }),
    reativoPontaValor: somarValores(reativosPonta),
    reativoFpValor: somarValores(reativosForaPonta),
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

  const peak = fatura.funcao === "peak_shaving";
  const unidades = unidadesSugeridas(fatura.consumoPontaKwh);

  const comum = {
    consumoPontaDesejadoKwhMes: fatura.consumoPontaKwh,
    nBess: null,
    tusdP: peak ? null : (fatura.tarifaPontaTotal ?? 0),
    teP: peak ? null : 0,
    tusdFp: fatura.tarifaFpTotal ?? 0,
    teFp: 0,
    hspMensal: [...hspMensal],
    solarKwp: 0,
    capexSolarTotal: 0,
  };

  if (!peak) {
    return {
      ...comum,
      funcao: "solar_bess",
      // No Solar+BESS a mesma conta que dimensiona a energia define o CAPEX.
      capexBessTotal: unidades * CAPEX_POR_BESS,
      tusdP: fatura.tarifaPontaTotal ?? 0,
      teP: 0,
    };
  }

  // Peak shaving também dimensiona por potência e pelo SOH do ano 20; fixar
  // aqui o CAPEX calculado pela regra solar fazia o motor adotar cinco BESS e
  // cobrar apenas quatro. Nulo deixa o próprio motor peak derivar o valor.
  return {
    ...comum,
    funcao: "peak_shaving",
    capexBessTotal: null,
    tusdP: null,
    teP: null,
    demandaPontaMedidaKw: fatura.demandaRegistradaPontaKw ?? 0,
    tarifaKwPontaMedida: fatura.tarifaKwPontaMedida ?? 0,
    demandaPontaNcKw: Math.max(
      fatura.demandaContratadaKw - (fatura.demandaRegistradaPontaKw ?? 0),
      0,
    ),
    tarifaKwPontaNc: fatura.tarifaKwPontaNc ?? 0,
    contratoPontaNovoKw: 0,
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
