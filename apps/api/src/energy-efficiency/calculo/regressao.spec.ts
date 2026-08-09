import { PREMISSAS_2026_08, type EnergyPremises, type InvoiceData } from "@plugga/shared";
import { describe, expect, it } from "vitest";

import { auditarFatura } from "./auditoria.js";
import { calcularEconomia, economiaBessMensalLegado } from "./cenarios.js";
import { dimensionar } from "./dimensionamento.js";
import { calcularFinanceiro } from "./financeiro.js";

/**
 * Regressão contra os estudos já aprovados pelo agente Open Cloud.
 *
 * Estes casos são a única prova de que o motor reproduz o que a Plugga entregou
 * ao cliente. Quando um número diverge, ou o motor está errado ou a regra mudou
 * de propósito — e nesse caso o teste é atualizado junto com a decisão que a
 * motivou, nunca sozinho.
 *
 * Os casos usam a fórmula **legada** de economia BESS (spread cheio), porque
 * foram gerados antes de 2026-08-08. É exatamente por isso que servem: validam
 * dimensionamento, CAPEX, fluxo, VPL, TIR e payback — que não mudaram — sem
 * ficarem reféns da mudança de fórmula.
 */

/** Fonte: casos/serra-verde-uc-0188872-2-2025-06.md */
const SERRA_VERDE: InvoiceData = {
  consumoPontaKwh: 42_835,
  consumoForaPontaKwh: 505_578,
  tarifaPonta: 1.76787,
  tarifaForaPonta: 0.38673,
  valorPonta: 42_835 * 1.76787,
  valorForaPonta: 505_578 * 0.38673,
  valorDemanda: 0,
  valorTotal: 291_154.8,
  demandaContratadaKw: 1_198,
  demandaMedidaPontaKw: 1_079,
  demandaMedidaForaPontaKw: 1_149,
  valorReativo: 3_984.5,
  valorBeneficioFiscal: 72_788.7,
  valorMultasJurosEncargos: 0,
};

/** Fonte: scripts/generate_santa_tereza_2026_06_solar_bess.py */
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

/** Congela as premissas dos relatórios históricos, sem contaminar o motor PRD. */
const PREMISSAS_LEGADAS: EnergyPremises = {
  ...PREMISSAS_2026_08,
  versao: "2026-08-08-legado",
  vigenteDe: "2026-08-08T00:00:00.000Z",
  tmaAnual: 0.05,
  reajusteTarifarioAnual: 0.04,
};

describe("regressão — Serra Verde (piloto, 06/2025)", () => {
  const dimensionamento = dimensionar({ fatura: SERRA_VERDE, premissas: PREMISSAS_LEGADAS });

  it("reproduz o dimensionamento aprovado: 6 por energia, 10 por potência, 10 adotadas", () => {
    expect(dimensionamento.bessUnidadesPorEnergia).toBe(6);
    expect(dimensionamento.bessUnidadesPorPotencia).toBe(10);
    expect(dimensionamento.bessUnidades).toBe(10);
    expect(dimensionamento.bessLimitador).toBe("potencia");
  });

  it("reproduz a economia registrada no caso, com a fórmula da época", () => {
    // Caso registra R$ 59.161,13/mês e R$ 709.933,58 no Ano 1.
    const mensal = economiaBessMensalLegado(SERRA_VERDE);
    expect(mensal).toBeCloseTo(59_161.13, 0);
    expect(mensal * 12).toBeCloseTo(709_933.58, 0);
  });

  // Serra Verde é anterior à regra de que todo ESTUDO BESS é Solar+BESS: foi
  // BESS puro, sem usina. Por isso o financeiro roda com fvKwp zerado — é o que
  // torna os números comparáveis com o caso aprovado.
  const financeiro = calcularFinanceiro({
    premissas: PREMISSAS_LEGADAS,
    dimensionamento: { ...dimensionamento, fvKwp: 0, fvGeracaoMensalKwh: 0 },
    economiaAno1: economiaBessMensalLegado(SERRA_VERDE) * 12,
  });

  it("reproduz CAPEX de R$ 5.500.000,00 e VPL ao centavo", () => {
    expect(financeiro.capexBess).toBe(5_500_000);
    expect(financeiro.capexFv).toBe(0);
    expect(financeiro.capexTotal).toBe(5_500_000);
    // Caso registra VPL de R$ 6.866.243,04.
    expect(financeiro.vpl).toBeCloseTo(6_866_243.04, 2);
  });

  it("reproduz a TIR de 15,25% do caso", () => {
    expect(financeiro.tir).not.toBeNull();
    expect((financeiro.tir ?? 0) * 100).toBeCloseTo(15.25, 1);
  });

  /**
   * O achado que motivou separar os três paybacks: o caso registra "6,9 anos",
   * que não é o payback simples (7,75) e sim o projetado, com a economia
   * crescendo 4% a.a. O descontado é o 8,4 registrado.
   */
  it("distingue payback simples, projetado e descontado", () => {
    expect(financeiro.paybackSimplesAnos).toBeCloseTo(7.75, 2);
    expect(financeiro.paybackProjetadoAnos ?? 0).toBeCloseTo(6.9, 1);
    expect(financeiro.paybackDescontadoAnos ?? 0).toBeCloseTo(8.4, 1);
  });
});

describe("regressão — Santa Tereza (Solar+BESS, 06/2026)", () => {
  const dimensionamento = dimensionar({ fatura: SANTA_TEREZA, premissas: PREMISSAS_2026_08 });

  it("reproduz o pré-dimensionamento do script aprovado", () => {
    // Script: bess_energy=ceil((17419/30)/241)=3, bess_power=ceil(346/108)=4.
    expect(dimensionamento.bessUnidadesPorEnergia).toBe(3);
    expect(dimensionamento.bessUnidadesPorPotencia).toBe(4);
    expect(dimensionamento.bessUnidades).toBe(4);
    // Script: fv_kwp=ceil((200572*0.60)/130)=926.
    expect(dimensionamento.fvKwp).toBe(926);
  });

  it("reproduz o CAPEX Solar+BESS validado no script (R$ 4.515.000,00)", () => {
    const financeiro = calcularFinanceiro({
      premissas: PREMISSAS_2026_08,
      dimensionamento,
      economiaAno1: 1,
    });

    expect(financeiro.capexFv).toBe(2_315_000);
    expect(financeiro.capexBess).toBe(2_200_000);
    expect(financeiro.capexTotal).toBe(4_515_000);
  });

  it("reproduz a economia mensal do script (R$ 111.292,41) com a fórmula da época", () => {
    const economia = calcularEconomia({
      fatura: SANTA_TEREZA,
      premissas: PREMISSAS_2026_08,
      dimensionamento,
      usarFormulaLegada: true,
    });

    expect(economia.economiaMensal).toBeCloseTo(111_292.41, 1);
  });

  // A correção que motivou a mudança de premissa: descontar o custo de carga
  // ajustado pela eficiência de ciclo derruba a economia em ~2,9%.
  it("a fórmula vigente entrega menos que a legada, pela perda de ciclo", () => {
    const legada = calcularEconomia({
      fatura: SANTA_TEREZA,
      premissas: PREMISSAS_2026_08,
      dimensionamento,
      usarFormulaLegada: true,
    });
    const vigente = calcularEconomia({
      fatura: SANTA_TEREZA,
      premissas: PREMISSAS_2026_08,
      dimensionamento,
    });

    expect(vigente.economiaMensal).toBeLessThan(legada.economiaMensal);
    expect(legada.economiaBessMensal - vigente.economiaBessMensal).toBeCloseTo(1_039.01, 1);
    expect((legada.economiaAno1 - vigente.economiaAno1)).toBeCloseTo(12_468.12, 0);
  });
});

describe("auditoria — leitura da fatura", () => {
  it("separa custo médio efetivo (com demanda) do custo médio total", () => {
    const auditoria = auditarFatura(SANTA_TEREZA);

    expect(auditoria.consumoTotalKwh).toBe(200_572);
    expect(auditoria.custoMedioTotal).toBeCloseTo(174_636.7 / 200_572, 6);
    expect(auditoria.custoMedioEfetivo).toBeCloseTo(
      (46_842.74 + 114_648.76 + 12_632.41) / 200_572,
      6,
    );
    // O efetivo inclui demanda e ainda assim é menor que o total, porque o
    // total carrega reativo, bandeira e encargos.
    expect(auditoria.custoMedioEfetivo).toBeLessThan(auditoria.custoMedioTotal);
  });

  it("classifica o reativo pela faixa, não pelo valor absoluto", () => {
    // Serra Verde: R$ 3.984,50 numa fatura de R$ 291 mil = 1,37% → registrar.
    expect(auditarFatura(SERRA_VERDE).reativoDiagnostico).toBe("registrar");
    // O mesmo valor numa fatura pequena pesaria muito mais.
    const faturaPequena: InvoiceData = { ...SERRA_VERDE, valorTotal: 60_000 };
    expect(auditarFatura(faturaPequena).reativoDiagnostico).toBe("investigar");
  });
});
