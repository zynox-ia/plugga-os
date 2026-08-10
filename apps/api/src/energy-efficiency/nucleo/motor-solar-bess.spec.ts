import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { PREMISSAS_PADRAO, rodarSolarBess } from "./motor-solar-bess.js";
import type { SaidaDoMotor } from "./motor.js";

/**
 * Golden do motor Solar+BESS.
 *
 * O corpus guarda os dois fluxos de Santa Tereza produzidos pelo oráculo — o do
 * BESS puro e o do Solar+BESS. A comparação é do objeto inteiro, incluindo os
 * 240 meses: qualquer diferença de um centavo em qualquer mês reprova.
 */
const CASOS = join(
  __dirname,
  "../../../../../packages/auditoria-oraculo/referencia",
  "skill-estudo-eficiencia-energetica/casos",
);

function golden(arquivo: string): SaidaDoMotor {
  return JSON.parse(readFileSync(join(CASOS, arquivo), "utf8")) as SaidaDoMotor;
}

/** Santa Tereza: 4 BESS aprovados, tarifas do caso, HSP 5,0 o ano todo. */
const SANTA_TEREZA = {
  consumoPontaDesejadoKwhMes: 17_419.0,
  nBess: 4,
  capexBessTotal: 2_200_000.0,
  tusdP: 2.689175,
  teP: 0.0,
  tusdFp: 0.625962,
  teFp: 0.0,
  hspMensal: Array.from({ length: 12 }, () => 5.0),
  solarKwp: 0.0,
  capexSolarTotal: 0.0,
} as const;

describe("motor Solar+BESS — golden Santa Tereza", () => {
  /**
   * O arquivo do BESS puro é anterior à decisão de 08/08 que levou o PR do
   * solar de 0,75 para 0,85, e por isso sugere 193,0 kWp onde o PR atual
   * sugere 170,3. Nenhum número financeiro muda: essa passagem roda sem solar,
   * e o PR só entra no kWp sugerido. Por isso a comparação usa o PR de quando
   * o arquivo foi gravado — o alvo aqui é o fluxo, não a sugestão.
   */
  it("reproduz o fluxo do BESS puro, mês a mês", () => {
    const esperado = golden("fluxo-santa-tereza-bess.json");

    const obtido = rodarSolarBess({
      ...SANTA_TEREZA,
      solarKwp: 0.0,
      capexSolarTotal: 0.0,
      solarPr: 0.75,
    });

    expect(obtido).toEqual(esperado);
  });

  it("com o PR vigente, a mesma passagem só muda o kWp sugerido", () => {
    const antigo = rodarSolarBess({ ...SANTA_TEREZA, solarPr: 0.75 });
    const vigente = rodarSolarBess(SANTA_TEREZA);

    expect(antigo.solar.kwp_sugerido_pior_mes).toBe(193);
    expect(vigente.solar.kwp_sugerido_pior_mes).toBe(170.3);
    expect(vigente.indicadores).toEqual(antigo.indicadores);
    expect(vigente.fluxo_mensal).toEqual(antigo.fluxo_mensal);
  });

  it("reproduz o fluxo Solar+BESS, mês a mês", () => {
    const esperado = golden("fluxo-santa-tereza-solar.json");

    const obtido = rodarSolarBess({
      ...SANTA_TEREZA,
      solarKwp: 170.3,
      capexSolarTotal: 425_750.0,
    });

    expect(obtido).toEqual(esperado);
  });

  it("entrega os números que foram aprovados para o cliente", () => {
    const { indicadores, dimensionamento, solar } = rodarSolarBess({
      ...SANTA_TEREZA,
      solarKwp: 170.3,
      capexSolarTotal: 425_750.0,
    });

    expect(dimensionamento.n_bess_adotado).toBe(4);
    expect(solar.kwp_sugerido_pior_mes).toBe(170.3);
    expect(indicadores.capex_total).toBe(2_625_750);
    expect(indicadores.tir_aa).toBe(0.2513);
    expect(indicadores.payback_anos).toBe(4.5);
  });

  it("o primeiro ano economiza o que o estudo aprovado diz", () => {
    const { fluxo_anual } = rodarSolarBess({
      ...SANTA_TEREZA,
      solarKwp: 170.3,
      capexSolarTotal: 425_750.0,
    });

    expect(fluxo_anual[1]).toBe(528_383.95);
  });
});

describe("motor Solar+BESS — regras que não podem escorregar", () => {
  it("o excedente solar não vira crédito: só o que carrega o BESS conta", () => {
    const entrada = { ...SANTA_TEREZA, solarKwp: 1_000.0, capexSolarTotal: 2_500_000.0 };

    const normativo = rodarSolarBess(entrada);
    const legado = rodarSolarBess({ ...entrada, solarApenasCarregaBess: false });

    expect(normativo.fluxo_mensal[0]!.solar_exc).toBeGreaterThan(0);
    expect(legado.indicadores.acumulado_20a).toBeGreaterThan(
      normativo.indicadores.acumulado_20a,
    );
  });

  it("o O&M do BESS é o CAPEX total vezes 1%, sem multiplicar por N", () => {
    const { ano1_base } = rodarSolarBess(SANTA_TEREZA);

    expect(ano1_base.om_bess).toBe(22_000);
  });

  it("o fator J12 impede faturar capacidade acima do consumo", () => {
    const comLimite = rodarSolarBess({ ...SANTA_TEREZA, nBess: 10 });
    const semLimite = rodarSolarBess({
      ...SANTA_TEREZA,
      nBess: 10,
      limitarUtilizacaoAoConsumo: false,
    });

    expect(comLimite.dimensionamento.cobertura_consumo).toBe(1);
    expect(semLimite.ano1_base.receita_hp).toBeGreaterThan(
      comLimite.ano1_base.receita_hp,
    );
  });

  it("o número aprovado prevalece sobre o sugerido", () => {
    const { dimensionamento } = rodarSolarBess({ ...SANTA_TEREZA, nBess: 7 });

    expect(dimensionamento.n_bess_sugerido).toBe(4);
    expect(dimensionamento.n_bess_adotado).toBe(7);
  });

  it("sem número aprovado, usa o sugerido pela energia", () => {
    const { dimensionamento } = rodarSolarBess({ ...SANTA_TEREZA, nBess: null });

    expect(dimensionamento.n_bess_adotado).toBe(4);
  });

  it("a curva SOH entra interpolada mês a mês, não em degraus anuais", () => {
    const { fluxo_mensal } = rodarSolarBess(SANTA_TEREZA);

    expect(fluxo_mensal[0]!.soh).toBe(1);
    expect(fluxo_mensal[1]!.soh).toBe(0.9976);
    expect(fluxo_mensal[12]!.soh).toBe(0.971);
  });

  it("o fluxo tem 240 meses e 21 anos, com o ano zero sendo o CAPEX", () => {
    const saida = rodarSolarBess(SANTA_TEREZA);

    expect(saida.fluxo_mensal).toHaveLength(240);
    expect(saida.fluxo_anual).toHaveLength(21);
    expect(saida.fluxo_anual[0]).toBe(-2_200_000);
  });

  it("as premissas padrão são as da planilha", () => {
    expect(PREMISSAS_PADRAO.etaRt * PREMISSAS_PADRAO.etaEle * PREMISSAS_PADRAO.etaOp)
      .toBeCloseTo(0.9271, 4);
    expect(PREMISSAS_PADRAO.tmaAa).toBe(0.12);
    expect(PREMISSAS_PADRAO.reajusteEnergiaAa).toBe(0.08);
    expect(PREMISSAS_PADRAO.reajusteOmAa).toBe(0.03);
    expect(PREMISSAS_PADRAO.diasUteisMes).toBe(21);
  });
});
