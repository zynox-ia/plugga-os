import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { SaidaDoMotor } from "./motor.js";
import {
  ModoDesconhecidoError,
  PRECO_SOLAR_POR_KWP,
  quatroNumeros,
  rodarEstudo,
  type CasoDoEstudo,
} from "./pipeline.js";

/**
 * O pipeline é o que transforma dois motores certos num estudo certo.
 *
 * O teste mais forte aqui não usa o oráculo: partindo do caso de Santa Tereza
 * exatamente como o corpus o guarda — sem solar e sem kWp aprovado —, o
 * pipeline precisa descobrir sozinho os 170,3 kWp, derivar o CAPEX solar e
 * chegar ao fluxo aprovado, mês a mês.
 */
const CASOS = join(
  __dirname,
  "../../../../../packages/auditoria-oraculo/referencia",
  "skill-estudo-eficiencia-energetica/casos",
);

function golden(arquivo: string): SaidaDoMotor {
  return JSON.parse(readFileSync(join(CASOS, arquivo), "utf8")) as SaidaDoMotor;
}

const SANTA_TEREZA: CasoDoEstudo = {
  funcao: "solar_bess",
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
};

describe("pipeline — as duas passagens", () => {
  it("descobre o kWp, deriva o CAPEX e chega ao estudo aprovado", () => {
    const estudo = rodarEstudo(SANTA_TEREZA);

    expect(estudo.regraDoKwp).toBe("pior_mes");
    expect(estudo.solarKwp).toBe(170.3);
    expect(estudo.capexSolarTotal).toBe(425_750);
    expect(estudo.fluxoSolar).toEqual(golden("fluxo-santa-tereza-solar.json"));
  });

  it("o CAPEX solar é o kWp vezes o preço normativo", () => {
    const estudo = rodarEstudo(SANTA_TEREZA);

    expect(estudo.capexSolarTotal).toBe(
      Math.round(estudo.solarKwp * PRECO_SOLAR_POR_KWP * 100) / 100,
    );
    expect(PRECO_SOLAR_POR_KWP).toBe(2_500);
  });

  it("o kWp aprovado prevalece sobre o sugerido, e isso fica registrado", () => {
    const estudo = rodarEstudo({ ...SANTA_TEREZA, solarKwpDefinido: 1_100 });

    expect(estudo.regraDoKwp).toBe("aprovado");
    expect(estudo.solarKwp).toBe(1_100);
    expect(estudo.capexSolarTotal).toBe(2_750_000);
  });

  it("a primeira passagem roda sem solar — é ela que o semáforo julga", () => {
    const estudo = rodarEstudo(SANTA_TEREZA);

    expect(estudo.fluxoBess.solar.capex).toBe(0);
    expect(estudo.fluxoBess.indicadores.capex_total).toBe(2_200_000);
    expect(estudo.fluxoSolar.indicadores.capex_total).toBe(2_625_750);
  });

  it("os dois fluxos são diferentes, e por isso saem nomeados", () => {
    const estudo = rodarEstudo(SANTA_TEREZA);

    expect(estudo.fluxoBess.indicadores.tir_aa).not.toBe(
      estudo.fluxoSolar.indicadores.tir_aa,
    );
  });
});

describe("pipeline — seleção de motor", () => {
  it("peak shaving não cai no Solar+BESS", () => {
    const estudo = rodarEstudo({
      funcao: "peak_shaving",
      consumoPontaDesejadoKwhMes: 13_876.0,
      nBess: 5,
      capexBessTotal: 3_500_000.0,
      demandaPontaMedidaKw: 272.0,
      tarifaKwPontaMedida: 134.05198,
      demandaPontaNcKw: 88.0,
      tarifaKwPontaNc: 107.91184,
      tusdFp: 0.5120238,
      teFp: 0.0,
      hspMensal: Array.from({ length: 12 }, () => 4.5),
    });

    expect(estudo.modo).toBe("peak_shaving");
    expect(estudo.fluxoSolar.dimensionamento.funcao).toContain("PEAK SHAVING");
  });

  it("modo desconhecido para o estudo em vez de escolher um motor", () => {
    expect(() =>
      rodarEstudo({ funcao: "bess_puro" as never, consumoPontaDesejadoKwhMes: 1_000 }),
    ).toThrow(ModoDesconhecidoError);
  });
});

describe("pipeline — os quatro números", () => {
  it("TIR e payback vêm do fluxo Solar, que é o estudo apresentado", () => {
    const estudo = rodarEstudo(SANTA_TEREZA);

    const numeros = quatroNumeros(estudo, { total: 174_636.7, consumoPontaKwh: 17_419 });

    expect(numeros.totalDaFatura).toBe(174_636.7);
    expect(numeros.consumoPontaKwh).toBe(17_419);
    expect(numeros.tirAa).toBe(estudo.fluxoSolar.indicadores.tir_aa);
    expect(numeros.paybackAnos).toBeCloseTo(4.5, 2);
  });
});
