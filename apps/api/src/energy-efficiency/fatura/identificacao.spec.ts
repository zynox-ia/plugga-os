import { describe, expect, it } from "vitest";

import { identificar } from "./identificacao.js";

/**
 * O layout é de coluna: o rótulo "Número da UC" e o valor caem em linhas
 * separadas, às vezes com outras linhas no meio. Por isso a busca é por forma
 * do dado, e é isso que estes testes fixam.
 */
const TEFE = [
  "AMBAR ENERGIA - AM",
  "Número da UC",
  "Mês Faturado",
  "Vencimento",
  "SAO FRANCISCO, AME 4485",
  "06/2026",
  "25/07/2026",
  "0000890358002-74",
];

describe("identificação da fatura", () => {
  it("acha unidade consumidora, competência e distribuidora fora de ordem", () => {
    expect(identificar(TEFE)).toEqual({
      unidadeConsumidora: "0000890358002-74",
      competencia: { mes: 6, ano: 2026 },
      distribuidora: "AMBAR ENERGIA",
    });
  });

  it("não confunde vencimento com competência", () => {
    // O vencimento tem dia; a competência é só mês e ano.
    const { competencia } = identificar(["25/07/2026", "06/2026"]);

    expect(competencia).toEqual({ mes: 6, ano: 2026 });
  });

  it("não confunde a chave de acesso da nota com o código da UC", () => {
    const { unidadeConsumidora } = identificar([
      "Chave de acesso:",
      "1326 0702 3414 6700 0120 6600 1118 2516 6810 8251 6686",
      "0000890358002-74",
    ]);

    expect(unidadeConsumidora).toBe("0000890358002-74");
  });

  it("devolve nulo em vez de chutar quando o dado não está lá", () => {
    expect(identificar(["fatura sem nada reconhecível"])).toEqual({
      unidadeConsumidora: null,
      competencia: null,
      distribuidora: null,
    });
  });

  it("reconhece distribuidora de fora do Norte", () => {
    expect(identificar(["ENERGISA RONDONIA"]).distribuidora).toBe("ENERGISA");
  });
});
