import { PREMISSAS_2026_08, type InvoiceData } from "@plugga/shared";
import { describe, expect, it } from "vitest";

import { rodarMotorPrd } from "./motor-prd.js";

/** Caso congelado pelo PRD: Santa Tereza, referência 06/2026. */
const SANTA_TEREZA: InvoiceData = {
  consumoPontaKwh: 17_419,
  consumoForaPontaKwh: 183_153,
  tarifaPonta: 2.689175,
  tarifaForaPonta: 0.625962,
  valorPonta: 46_842.74,
  valorForaPonta: 114_648.76,
  valorDemanda: 12_632.41,
  valorTotal: 174_636.7,
  demandaContratadaKw: 500,
  demandaMedidaPontaKw: 346,
  demandaMedidaForaPontaKw: 514,
  valorReativo: 153.83,
  valorBeneficioFiscal: 0,
  valorMultasJurosEncargos: 0,
};

describe("motor único do PRD — Santa Tereza", () => {
  const resultado = rodarMotorPrd(SANTA_TEREZA, PREMISSAS_2026_08);

  it("reproduz o dimensionamento congelado", () => {
    expect(resultado.dimensionamento.bessUnidades).toBe(4);
    expect(resultado.dimensionamento.fvKwp).toBe(170.3);
    expect(resultado.dimensionamento.coberturaConsumo).toBe(1);
  });

  it("reproduz CAPEX, economia do ano 1 e indicadores ao centavo", () => {
    expect(resultado.financeiro.capexTotal).toBe(2_625_750);
    expect(resultado.financeiro.fluxoAnual[0]).toBeCloseTo(528_383.95, 2);
    expect(resultado.financeiro.vpl).toBeCloseTo(3_142_498.36, 2);
    expect(resultado.financeiro.tir).toBeCloseTo(0.2513, 4);
    expect(resultado.financeiro.paybackProjetadoAnos).toBeCloseTo(4.5, 2);
  });

  it("abre os vinte anos em 240 meses e não credita excedente solar", () => {
    expect(resultado.financeiro.fluxoMensal).toHaveLength(240);
    expect(resultado.financeiro.fluxoMensal.some((mes) => mes.excedenteSemCredito > 0)).toBe(true);
    for (const mes of resultado.financeiro.fluxoMensal) {
      expect(mes.solarParaBess).toBeLessThanOrEqual(mes.geracaoSolar + 0.1);
    }
  });
});
