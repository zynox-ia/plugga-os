import { describe, expect, it } from "vitest";

import { conferir } from "./conferencia.js";
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

  it("lê unidade, quantidade, tarifa e valor numa linha de tabela", () => {
    const [item] = lerItens([
      "TUSD em kWh - Ponta KWH 858,90 3,564050 3.061,16 114,43 3.061,16 19 581,62 2,753660",
    ]);

    expect(item).toMatchObject({
      rotulo: "TUSD em kWh - Ponta",
      quantidade: 858.9,
      unidade: "kWh",
      tarifa: 3.56405,
      valor: 3_061.16,
    });
    expect(conferir([item!]).itens[0]?.veredicto).toBe("confirmado");
  });

  it("lê unidade não representável sem inventar kWh ou kW", () => {
    const [item] = lerItens([
      "Energia Reat Exced em KWh Livre - Ponta UN 32,24 0,299950 9,67 0,72 9,67",
    ]);

    expect(item).toMatchObject({ quantidade: null, unidade: null, tarifa: null, valor: 9.67 });
    expect(conferir([item!]).itens[0]?.veredicto).toBe("sem_conferencia");
  });

  it("lê o primeiro valor de ajustes e encargos estreitamente identificados", () => {
    const itens = lerItens([
      "CREDITO TUSD KW-APCEI 07/2026 -5.896,80 0,00 0,00 0 0,00 0,000000",
      "Contrib de Ilum Pub 849,67 0,00 0,00 0 0,00",
    ]);

    expect(itens).toMatchObject([
      { rotulo: "CREDITO TUSD KW-APCEI 07/2026", valor: -5_896.8, quantidade: null },
      { rotulo: "Contrib de Ilum Pub", valor: 849.67, quantidade: null },
    ]);
  });

  it("deixa a aritmética rejeitar uma linha tabelada com valor incoerente", () => {
    const [item] = lerItens(["Encargo KWH 10,00 2,000000 99,00"]);

    expect(item).toBeDefined();
    expect(conferir([item!]).itens[0]?.veredicto).toBe("divergente");
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

  it("reconstrói rótulo financeiro com dígitos separado do valor", () => {
    const itens = lerItens([
      "Desligamento E Religacao Programados (2X)",
      "562,50",
      "Devolução Diferenca Desconto Tusd - Ccee 04/26-",
      "-604,12",
    ]);

    expect(itens).toMatchObject([
      {
        rotulo: "Desligamento E Religacao Programados (2X)",
        valor: 562.5,
        quantidade: null,
        origem: "Desligamento E Religacao Programados (2X) | 562,50",
      },
      {
        rotulo: "Devolução Diferenca Desconto Tusd - Ccee 04/26-",
        valor: -604.12,
        quantidade: null,
        origem: "Devolução Diferenca Desconto Tusd - Ccee 04/26- | -604,12",
      },
    ]);
  });

  it("não relaxa rótulos com dígitos para históricos ou medições", () => {
    const itens = lerItens([
      "Leitura Anterior 31/05/2026",
      "562,50",
      "En Ativa Pta 04/2026",
      "604,12",
    ]);

    expect(itens).toEqual([]);
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
