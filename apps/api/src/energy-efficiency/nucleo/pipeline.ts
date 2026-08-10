import { arredondar } from "./aritmetica.js";
import { rodarPeakShaving, type PremissasDoPeakShaving } from "./motor-peak-shaving.js";
import { rodarSolarBess, type PremissasDoMotor } from "./motor-solar-bess.js";
import type { SaidaDoMotor } from "./motor.js";

/**
 * Pipeline do estudo — port da orquestração que vive em
 * `assets/produzir_e_entregar.py`, sem a parte de canal.
 *
 * Este arquivo existe porque cada motor pode estar certo isoladamente e o
 * estudo sair errado. As regras que ligam um motor ao outro não estão em
 * nenhum dos dois:
 *
 * - o modo vem da `funcao` do caso, e não existe padrão;
 * - o motor roda **duas vezes**: a primeira sem solar, só para descobrir o kWp
 *   que cobriria a recarga no pior mês; a segunda com o solar aplicado;
 * - o kWp aprovado no caso prevalece sobre o sugerido;
 * - o CAPEX solar é derivado do kWp por um preço por kWp normativo;
 * - o semáforo julga o **fluxo BESS**, enquanto o documento e a Trava 2 falam
 *   do **fluxo Solar**. Os dois saem nomeados daqui justamente para que trocar
 *   um pelo outro seja erro de tipo, não bug silencioso.
 */

/** R$/kWp usado para derivar o CAPEX solar (`produzir_e_entregar.py:88`). */
export const PRECO_SOLAR_POR_KWP = 2_500.0;

export type ModoDoEstudo = "solar_bess" | "peak_shaving";

/** Caso do motor, como o corpus o descreve. */
export type CasoDoEstudo = {
  funcao?: ModoDoEstudo;
  solarKwpDefinido?: number;
} & Partial<PremissasDoMotor> &
  Partial<PremissasDoPeakShaving>;

export type ResultadoDoEstudo = {
  modo: ModoDoEstudo;
  /** Sem solar: é o que o semáforo julga. */
  fluxoBess: SaidaDoMotor;
  /** Com solar aplicado: é o que o cliente vê e a Trava 2 confere. */
  fluxoSolar: SaidaDoMotor;
  solarKwp: number;
  capexSolarTotal: number;
  /** De onde veio o kWp — nunca fica implícito. */
  regraDoKwp: "aprovado" | "pior_mes";
};

export class ModoDesconhecidoError extends Error {
  constructor(modo: unknown) {
    super(
      `modo de estudo desconhecido: ${JSON.stringify(modo)}. ` +
        "O caso precisa declarar 'solar_bess' ou 'peak_shaving' — não existe padrão.",
    );
    this.name = "ModoDesconhecidoError";
  }
}

/**
 * Seleção explícita e fechada. Modo ausente ou desconhecido para o estudo; não
 * cai no Solar+BESS, que foi exatamente o defeito encontrado na auditoria: um
 * cliente de modalidade azul ficava verde rodando o motor errado.
 */
export function selecionarMotor(
  modo: ModoDoEstudo,
): (entrada: CasoDoEstudo) => SaidaDoMotor {
  if (modo === "solar_bess") return rodarSolarBess;
  if (modo === "peak_shaving") return rodarPeakShaving;
  throw new ModoDesconhecidoError(modo);
}

export function rodarEstudo(caso: CasoDoEstudo): ResultadoDoEstudo {
  const modo = caso.funcao ?? "solar_bess";
  if (caso.funcao !== undefined && modo !== "solar_bess" && modo !== "peak_shaving") {
    throw new ModoDesconhecidoError(caso.funcao);
  }
  const motor = selecionarMotor(modo);

  // Primeira passagem: sem solar. O que interessa dela é o kWp sugerido para
  // cobrir a recarga no pior mês — e é ela que o semáforo julga.
  const fluxoBess = motor(caso);

  const aprovado = caso.solarKwpDefinido;
  const solarKwp = aprovado || (fluxoBess.solar.kwp_sugerido_pior_mes ?? 0);
  const capexSolarTotal = arredondar(solarKwp * PRECO_SOLAR_POR_KWP, 2);

  // Segunda passagem: o mesmo motor, agora com o solar aplicado.
  const fluxoSolar = motor({ ...caso, solarKwp, capexSolarTotal });

  return {
    modo,
    fluxoBess,
    fluxoSolar,
    solarKwp,
    capexSolarTotal,
    regraDoKwp: aprovado ? "aprovado" : "pior_mes",
  };
}

/**
 * Os quatro números que o semáforo amarelo congela: total da fatura e consumo
 * de ponta vêm da fatura; TIR e payback vêm do fluxo **Solar**, que é o estudo
 * apresentado (`produzir_e_entregar.py:114`).
 */
export function quatroNumeros(
  estudo: ResultadoDoEstudo,
  fatura: { total: number; consumoPontaKwh: number },
): {
  totalDaFatura: number;
  consumoPontaKwh: number;
  tirAa: number | null;
  paybackAnos: number | null;
} {
  const { tir_aa, payback_meses } = estudo.fluxoSolar.indicadores;

  return {
    totalDaFatura: fatura.total,
    consumoPontaKwh: fatura.consumoPontaKwh,
    tirAa: tir_aa,
    paybackAnos: payback_meses === null ? null : payback_meses / 12,
  };
}
