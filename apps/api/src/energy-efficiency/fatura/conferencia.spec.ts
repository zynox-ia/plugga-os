import { describe, expect, it } from "vitest";

import { conferir, folgaDeArredondamento } from "./conferencia.js";
import type { ItemDaFatura } from "./itens.js";

const item = (parcial: Partial<ItemDaFatura>): ItemDaFatura => ({
  rotulo: "Consumo Ponta",
  quantidade: 100,
  unidade: "kWh",
  tarifa: 1,
  valor: 100,
  origem: "",
  ...parcial,
});

describe("conferência aritmética da fatura", () => {
  it("confirma quando quantidade × tarifa fecha com o valor impresso", () => {
    // Linha real da GREE, 04/2026.
    const c = conferir([
      item({ rotulo: "Consumo Ponta", quantidade: 21_231, tarifa: 0.69704, valor: 14_798.85 }),
    ]);

    expect(c.itens[0]!.veredicto).toBe("confirmado");
    expect(c.temDivergencia).toBe(false);
  });

  /**
   * Os dois casos abaixo são linhas reais do OCR que alimenta os estudos hoje.
   * O erro é sempre o mesmo: o dígito da frente some. É para isto que a
   * conferência existe.
   */
  it("pega o dígito perdido pelo OCR na demanda", () => {
    const c = conferir([item({ rotulo: "Demanda", quantidade: 7, tarifa: 22.96, valor: 60.72 })]);

    expect(c.itens[0]!.veredicto).toBe("divergente");
    expect(c.itens[0]!.esperado).toBeCloseTo(160.72, 2);
  });

  it("pega o dígito perdido pelo OCR no consumo fora ponta", () => {
    const c = conferir([
      item({ rotulo: "Consumo F/Ponta", quantidade: 9_076, tarifa: 0.54055, valor: 906.03 }),
    ]);

    expect(c.itens[0]!.veredicto).toBe("divergente");
    expect(c.itens[0]!.esperado).toBeCloseTo(4_906.03, 2);
  });

  /**
   * Caso que reprovava à toa com folga fixa: a tarifa impressa tem seis casas,
   * então o erro herdado cresce com a quantidade.
   */
  it("tolera o arredondamento da própria distribuidora em linha grande", () => {
    const c = conferir([
      item({ rotulo: "Consumo F/Ponta", quantidade: 31_966, tarifa: 0.57469, valor: 18_370.53 }),
    ]);

    expect(c.itens[0]!.veredicto).toBe("confirmado");
  });

  it("a folga cresce com a quantidade, porque o erro da tarifa multiplica", () => {
    expect(folgaDeArredondamento(100)).toBeLessThan(folgaDeArredondamento(150_000));
    // Mesmo na maior linha, a folga fica muito abaixo de qualquer erro de leitura.
    expect(folgaDeArredondamento(150_000)).toBeLessThan(0.1);
  });

  it("não inventa conferência para item sem quantidade", () => {
    // COSIP, bandeira e crédito não têm multiplicação que os prove.
    const c = conferir([
      item({ rotulo: "Contribuição de Iluminação Pública", quantidade: null, tarifa: null, valor: 2_026.49 }),
    ]);

    expect(c.itens[0]!.veredicto).toBe("sem_conferencia");
    expect(c.semConferencia).toBe(1);
    expect(c.temDivergencia).toBe(false);
  });

  it("conta os três vereditos separadamente", () => {
    const c = conferir([
      item({ quantidade: 10, tarifa: 2, valor: 20 }),
      item({ quantidade: 10, tarifa: 2, valor: 999 }),
      item({ quantidade: null, tarifa: null, valor: 5 }),
    ]);

    expect([c.confirmados, c.divergentes, c.semConferencia]).toEqual([1, 1, 1]);
  });
});
