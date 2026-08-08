import { describe, expect, it } from "vitest";

import { lerItens } from "./itens.js";

/**
 * As linhas abaixo são transcrições dos dois layouts reais que aparecem no
 * corpus, com os números preservados — é o que garante que o teste falha se o
 * corte entre tarifa e valor mudar de comportamento.
 */

describe("leitura dos itens da fatura", () => {
  it("lê o layout de colunas coladas numa linha só", () => {
    const itens = lerItens(["Consumo Ponta 21.231 kWh a 0,697040        0,69704014.798,85"]);

    expect(itens).toHaveLength(1);
    expect(itens[0]!).toMatchObject({
      rotulo: "Consumo Ponta",
      quantidade: 21_231,
      unidade: "kWh",
      tarifa: 0.69704,
      valor: 14_798.85,
    });
  });

  it("lê o layout em que tarifa e valor caem em linhas separadas", () => {
    const itens = lerItens([
      "Itens Faturados",
      "Consumo Ponta 2.455 kWh a 1,793450",
      "1,793450",
      "4.402,91",
      "Demanda 83 kW a 24,150000",
      "24,150000",
      "2.004,45",
    ]);

    expect(itens).toHaveLength(2);
    expect(itens[0]!).toMatchObject({ quantidade: 2_455, tarifa: 1.79345, valor: 4_402.91 });
    expect(itens[1]!).toMatchObject({ rotulo: "Demanda", unidade: "kW", valor: 2_004.45 });
  });

  it("separa tarifa de valor mesmo colados, porque as casas decimais são fixas", () => {
    // "0,69704014.798,85" só tem uma leitura: seis casas para a tarifa, duas
    // para o valor. Um corte errado não sobreviveria à conferência aritmética.
    const [item] = lerItens(["Demanda F/Ponta 962 kW a 22,960000        22,96000022.087,52"]);

    expect(item!.tarifa).toBe(22.96);
    expect(item!.valor).toBe(22_087.52);
  });

  it("preserva o sinal do crédito de geração", () => {
    // Crédito lido como débito inverteria a economia calculada.
    const [item] = lerItens(["Credito De Geracao F/Ponta", "-328,17"]);

    expect(item!.valor).toBe(-328.17);
    expect(item!.quantidade).toBeNull();
  });

  it("aceita item sem quantidade, como COSIP e bandeira", () => {
    const itens = lerItens([
      "Contribuição de Iluminação Pública (COSIP)",
      "2.026,49",
      "Adicional Bandeira Vermelha -",
      "428,21",
    ]);

    expect(itens).toHaveLength(2);
    expect(itens.every((i) => i.quantidade === null && i.tarifa === null)).toBe(true);
  });

  it("ignora linhas que têm forma de item mas não são", () => {
    const itens = lerItens([
      "CEP: 69.058-807",
      "CNPJ: 02.341.467/0001-20",
      "Total a pagar",
      "8.808,99",
    ]);

    expect(itens).toEqual([]);
  });

  it("não devolve item quando o valor não aparece em lugar nenhum", () => {
    // Melhor não ler do que ler pela metade: item sem valor não tem o que
    // conferir e entraria na ficha como número sem prova.
    const itens = lerItens(["Consumo Ponta 2.455 kWh a 1,793450", "1,793450"]);

    expect(itens).toEqual([]);
  });
});
