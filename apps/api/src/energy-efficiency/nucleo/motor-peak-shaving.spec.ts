import { describe, expect, it } from "vitest";

import { CURVA_SOH } from "./motor.js";
import { rodarPeakShaving } from "./motor-peak-shaving.js";

/**
 * Peak shaving — invariantes que valem sem precisar do oráculo.
 *
 * A paridade numérica caso a caso está em `motores.oraculo.spec.ts`, atrás da
 * flag. Aqui ficam as regras que precisam estar protegidas o tempo todo.
 */

/** Cantuária: 5 BESS aprovados, demanda de ponta eliminada, azul. */
const CANTUARIA = {
  consumoPontaDesejadoKwhMes: 13_876.0,
  nBess: 5,
  capexBessTotal: 3_500_000.0,
  demandaPontaMedidaKw: 272.0,
  tarifaKwPontaMedida: 134.05198,
  demandaPontaNcKw: 88.0,
  tarifaKwPontaNc: 107.91184,
  contratoPontaNovoKw: 0.0,
  tusdFp: 0.5120238,
  teFp: 0.0,
  hspMensal: Array.from({ length: 12 }, () => 4.5),
} as const;

describe("peak shaving", () => {
  it("a economia de demanda é medida + não consumida menos o contrato novo", () => {
    const { ano1_base } = rodarPeakShaving(CANTUARIA);

    const esperado =
      272 * 134.05198 + 88 * 107.91184 - 0 * 107.91184;
    expect(ano1_base.economia_demanda_mes).toBeCloseTo(esperado, 2);
  });

  it("dimensiona com garantia no ano 20, não no ano 1", () => {
    const { dimensionamento } = rodarPeakShaving({ ...CANTUARIA, nBess: null });

    const consumoDia = 13_876 / 21;
    const cicloUtil = 241 * 0.9556 * 0.98 * 0.99;
    expect(dimensionamento.n_bess_sugerido).toBe(
      Math.ceil(consumoDia / (cicloUtil * CURVA_SOH[20]!)),
    );
    expect(dimensionamento.n_bess_sugerido).toBeGreaterThan(
      Math.ceil(consumoDia / cicloUtil),
    );
    expect(dimensionamento.criterio).toContain("ANO 20");
  });

  it("a potência também dimensiona: pico de ponta acima da energia manda", () => {
    const { dimensionamento } = rodarPeakShaving({
      ...CANTUARIA,
      nBess: null,
      demandaPontaMedidaKw: 2_000,
    });

    expect(dimensionamento.n_bess_sugerido).toBe(Math.ceil(2_000 / 241));
  });

  it("sem tarifa de ponta declarada, a ponta usa a tarifa do fora ponta", () => {
    const comPonta = rodarPeakShaving({ ...CANTUARIA, tusdP: 1.0, teP: 0.0 });
    const semPonta = rodarPeakShaving(CANTUARIA);

    expect(comPonta.ano1_base.receita_hp).toBeGreaterThan(
      semPonta.ano1_base.receita_hp,
    );
  });

  /**
   * Trava contra correção silenciosa.
   *
   * O oráculo calcula o SOH e o registra no fluxo, mas não o aplica à receita
   * nem à carga — o que torna os indicadores otimistas. A decisão foi replicar
   * esse comportamento nesta versão, e não corrigi-lo junto com a troca de
   * linguagem. Se alguém passar a aplicar o SOH ao fluxo, este teste quebra e
   * obriga a decisão a ser explícita: nova versão do motor e novos goldens.
   */
  it("o SOH é registrado mas não entra na conta — limitação replicada de propósito", () => {
    const normal = rodarPeakShaving(CANTUARIA);
    const bateriaQueNaoDegrada = rodarPeakShaving({
      ...CANTUARIA,
      soh: Array.from({ length: 21 }, () => 1.0),
    });

    expect(normal.fluxo_mensal[239]!.soh).toBeLessThan(0.66);
    expect(bateriaQueNaoDegrada.fluxo_mensal[239]!.soh).toBe(1);
    expect(normal.indicadores.acumulado_20a).toBe(
      bateriaQueNaoDegrada.indicadores.acumulado_20a,
    );
    expect(normal.fluxo_mensal.map((mes) => mes.eco_liq)).toEqual(
      bateriaQueNaoDegrada.fluxo_mensal.map((mes) => mes.eco_liq),
    );
  });

  it("o modo aparece no dimensionamento, para não haver dúvida de qual motor rodou", () => {
    const { dimensionamento } = rodarPeakShaving(CANTUARIA);

    expect(dimensionamento.funcao).toContain("PEAK SHAVING");
    expect(dimensionamento.cobertura_consumo).toBe(1);
    expect(dimensionamento.pico_ponta_kw).toBe(272);
  });
});
