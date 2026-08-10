import type { FaturaNormativa } from "@plugga/shared";

import { comUmaCasa, fmt } from "./formato.js";
import type { SaidaDoMotor } from "./motor.js";

/**
 * Semáforo — port fiel de `assets/triagem_semaforo.py`.
 *
 * O julgamento técnico rotineiro é do sistema; a pessoa só é acionada no que é
 * novo ou estranho:
 *
 * - 🟢 **verde**: tipo de fatura já conhecido e travas 1–2 passaram — produz e
 *   entrega;
 * - 🟡 **amarelo**: primeira fatura desta combinação — produz o estudo mas não
 *   envia, e manda os quatro números para conferência;
 * - 🔴 **vermelho**: trava reprovada, dado faltando ou resultado fora da faixa
 *   sanitária — **para e escala com o erro literal**. Nunca entrega, nunca "dá
 *   um jeitinho" (PRD §7). A saída é corrigir a fonte e recalcular (§8.2), não
 *   liberar a faixa.
 *
 * As faixas incidem sobre o **fluxo BESS**, não sobre o fluxo Solar que o
 * cliente vê — é assim que o pipeline normativo avalia.
 */

/** Divergência D-001: o script condiciona em 10×; o PRD e a própria docstring dizem 8×. */
export const SPREAD_MAXIMO = 8;
export const SPREAD_DO_ORACULO = 10;

export const TIR_MAXIMA_PCT = 60;
export const PAYBACK_MINIMO_MESES = 24;
export const FRACAO_MAXIMA_DA_ECONOMIA = 0.5;

export type Faixa = "verde" | "amarelo" | "vermelho";

export type ResultadoDoSemaforo = {
  faixa: Faixa;
  chaveDoTipo: string;
  tipoConhecido: boolean;
  /** Erro literal quando vermelho — é o que a pessoa recebe ao escalar. */
  motivos: string[];
  /** Diferenças conhecidas em relação ao oráculo aplicadas nesta decisão. */
  divergenciasAplicadas: string[];
};

/** Distribuidora, regime, modalidade e grupo — a combinação que define o tipo. */
export function chaveDoTipo(fatura: FaturaNormativa): string {
  return [fatura.distribuidora, fatura.regime, fatura.modalidade, fatura.grupo]
    .map((parte) => String(parte).trim().toLowerCase())
    .join("|");
}

export function classificarSemaforo(entrada: {
  fatura: FaturaNormativa;
  conciliada: boolean;
  /** O fluxo BESS puro, que é o que a faixa sanitária julga. */
  fluxoBess: SaidaDoMotor | null;
  tipoConhecido: boolean;
}): ResultadoDoSemaforo {
  const { fatura, fluxoBess } = entrada;
  const motivos: string[] = [];
  const divergencias: string[] = [];

  if (!entrada.conciliada) motivos.push("fatura não conciliada (trava 1)");

  if (fluxoBess) {
    const indicadores = fluxoBess.indicadores;
    const economiaAno1 = fluxoBess.fluxo_anual[1] ?? 0;
    const tir = (indicadores.tir_aa ?? 0) * 100;
    const payback = indicadores.payback_meses;

    if (tir > TIR_MAXIMA_PCT) {
      motivos.push(`TIR ${comUmaCasa(tir)}% a.a. — bom demais, conferir extração`);
    }
    if (payback !== null && payback < PAYBACK_MINIMO_MESES) {
      motivos.push(`payback ${Math.round(payback)} meses (<24) — conferir extração`);
    }
    // No mercado livre a base é o gasto total com energia; no cativo, o total.
    const base = fatura.totalGastoEnergia || fatura.total;
    if (base && economiaAno1 / 12 > base * FRACAO_MAXIMA_DA_ECONOMIA) {
      motivos.push("economia mensal > 50% do gasto com energia — conferir");
    }
  }

  const tarifaPonta = fatura.tarifaPontaTotal ?? 0;
  const tarifaForaPonta = fatura.tarifaFpTotal ?? 0;
  if (tarifaPonta && tarifaForaPonta) {
    const spread = tarifaPonta / tarifaForaPonta;
    if (spread > SPREAD_MAXIMO) {
      motivos.push(
        `spread ponta/fora ponta ${comUmaCasa(spread)}x (>${SPREAD_MAXIMO}x) — conferir tarifas`,
      );
      if (spread <= SPREAD_DO_ORACULO) {
        divergencias.push(
          `D-001: o oráculo condiciona em ${SPREAD_DO_ORACULO}x e deixaria passar; o PRD define ${SPREAD_MAXIMO}x`,
        );
      }
    }
  }

  const chave = chaveDoTipo(fatura);
  if (motivos.length > 0) {
    return {
      faixa: "vermelho",
      chaveDoTipo: chave,
      tipoConhecido: entrada.tipoConhecido,
      motivos,
      divergenciasAplicadas: divergencias,
    };
  }

  return {
    faixa: entrada.tipoConhecido ? "verde" : "amarelo",
    chaveDoTipo: chave,
    tipoConhecido: entrada.tipoConhecido,
    motivos: [],
    divergenciasAplicadas: divergencias,
  };
}

/**
 * Os quatro números que acompanham o amarelo. TIR e payback vêm do fluxo Solar,
 * que é o estudo apresentado.
 */
export function descreverQuatroNumeros(entrada: {
  totalDaFatura: number;
  consumoPontaKwh: number;
  tirAa: number | null;
  paybackAnos: number | null;
}): string {
  return [
    `total da fatura R$ ${fmt(entrada.totalDaFatura)}`,
    `consumo ponta ${entrada.consumoPontaKwh} kWh`,
    `TIR ${entrada.tirAa === null ? "—" : `${fmt(entrada.tirAa * 100)}% a.a.`}`,
    `payback ${entrada.paybackAnos === null ? "—" : `${comUmaCasa(entrada.paybackAnos)} anos`}`,
  ].join(" | ");
}
