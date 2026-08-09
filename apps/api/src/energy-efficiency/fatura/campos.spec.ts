import { describe, expect, it } from "vitest";

import { lerCamposExtras } from "./campos.js";
import type { Fragmento, PaginaDoDocumento } from "./paginas.js";

/**
 * Os dois campos que a leitura antiga declarava ausentes da camada de texto e
 * mandava digitar todo mês. Estes testes fixam que eles são lidos, e fixam o
 * que separa o número certo dos parecidos que a fatura tem em volta.
 */

function pedaco(texto: string, x: number, y: number, altura = 10): Fragmento {
  return { texto, x, y, largura: texto.length * altura * 0.5, altura };
}

function pagina(fragmentos: Fragmento[]): PaginaDoDocumento {
  return { numero: 1, largura: 600, altura: 800, fragmentos };
}

describe("lerCamposExtras — demanda contratada", () => {
  it("lê ponta e fora ponta na abreviação da distribuidora", () => {
    // A linha real da Ambar, remontada como sai da folha.
    const extras = lerCamposExtras([
      pagina([
        pedaco("D. Ctda Pta: 270", 100, 500),
        pedaco("D. Ctda F.Pta: 300", 260, 500),
      ]),
    ]);

    expect(extras.demandaContratadaPontaKw).toBe(270);
    expect(extras.demandaContratadaForaPontaKw).toBe(300);
  });

  it("não confunde fora ponta com ponta", () => {
    // "D. Ctda F.Pta" também casa o padrão de ponta se a ordem for descuidada,
    // e trocar os dois valores seria um erro silencioso: o estudo sairia
    // dimensionado pelo número errado sem nada aparecer na tela.
    const extras = lerCamposExtras([pagina([pedaco("D. Ctda F.Pta: 415", 100, 500)])]);

    expect(extras.demandaContratadaForaPontaKw).toBe(415);
    expect(extras.demandaContratadaPontaKw).toBeNull();
  });

  it("lê a demanda única da tarifa verde", () => {
    const extras = lerCamposExtras([
      pagina([pedaco("Demanda Contratada", 100, 500), pedaco("150", 300, 500)]),
    ]);

    expect(extras.demandaContratadaKw).toBe(150);
  });

  it("devolve nulo quando a fatura não publica demanda contratada", () => {
    const extras = lerCamposExtras([
      pagina([pedaco("Consumo 321 kWh a 0,782413", 100, 500)]),
    ]);

    expect(extras.demandaContratadaKw).toBeNull();
    expect(extras.demandaContratadaPontaKw).toBeNull();
    expect(extras.demandaContratadaForaPontaKw).toBeNull();
  });
});

describe("lerCamposExtras — valor total", () => {
  it("lê o valor impresso embaixo do cabeçalho da coluna", () => {
    const extras = lerCamposExtras([
      pagina([
        pedaco("Base de Cálculo", 60, 500),
        pedaco("Vencimento", 300, 500),
        pedaco("Valor a Pagar", 420, 500),
        pedaco("(*)", 60, 480),
        pedaco("15/01/2026", 300, 480),
        pedaco("R$ 361,29", 420, 480),
      ]),
    ]);

    expect(extras.valorTotal).toBe(361.29);
  });

  it("acha a coluna mesmo com o rótulo partido em palavras", () => {
    // O reconhecimento óptico devolve "Valor", "a" e "Pagar" separados; casar
    // por célula só funcionaria no PDF.
    const extras = lerCamposExtras([
      pagina([
        pedaco("Valor", 420, 500),
        pedaco("a", 460, 500),
        pedaco("Pagar", 475, 500),
        pedaco("361,29", 430, 480),
      ]),
    ]);

    expect(extras.valorTotal).toBe(361.29);
  });

  it("ignora dinheiro que está em outra coluna", () => {
    // O corpo da fatura é cheio de valores; pegar o primeiro que aparecer
    // embaixo do cabeçalho daria o número de outra coluna.
    const extras = lerCamposExtras([
      pagina([
        pedaco("Valor do ICMS", 100, 500),
        pedaco("Valor a Pagar", 420, 500),
        pedaco("12,50", 100, 480),
        pedaco("R$ 361,29", 420, 480),
      ]),
    ]);

    expect(extras.valorTotal).toBe(361.29);
  });

  it("lê o total quando vem corrido na mesma linha", () => {
    const extras = lerCamposExtras([
      pagina([pedaco("Total a Pagar R$ 1.204,55", 100, 500)]),
    ]);

    expect(extras.valorTotal).toBe(1204.55);
  });

  it("devolve nulo quando não há coluna de total", () => {
    const extras = lerCamposExtras([pagina([pedaco("Itens Faturados", 100, 500)])]);

    expect(extras.valorTotal).toBeNull();
  });
});
