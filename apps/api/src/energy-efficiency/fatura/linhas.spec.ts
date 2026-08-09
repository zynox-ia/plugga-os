import { describe, expect, it } from "vitest";

import { faixaDoTrecho, fragmentosEmOrdem, linhasImpressas, montarLinhas } from "./linhas.js";
import type { Fragmento, PaginaDoDocumento } from "./paginas.js";

/**
 * Remontar a linha impressa é o que recupera o dado que só existe na relação
 * entre colunas. Estes testes fixam as três decisões que fazem isso funcionar:
 * o que conta como a mesma linha, o que separa duas palavras, e como voltar do
 * texto para a posição na folha.
 */

function pedaco(texto: string, x: number, y: number, altura = 10): Fragmento {
  // Largura proporcional ao texto: é o bastante para os testes de vão, e evita
  // que cada caso precise calcular a caixa à mão.
  return { texto, x, y, largura: texto.length * altura * 0.5, altura };
}

function pagina(fragmentos: Fragmento[]): PaginaDoDocumento {
  return { numero: 1, largura: 600, altura: 800, fragmentos };
}

describe("montarLinhas", () => {
  it("junta o que foi impresso na mesma altura, da esquerda para a direita", () => {
    // Chegam fora de ordem de propósito: o fluxo do PDF não segue a folha.
    const linhas = montarLinhas(
      pagina([
        pedaco("270", 300, 500),
        pedaco("D. Ctda Pta:", 100, 500),
        pedaco("Itens Faturados", 100, 460),
      ]),
    );

    expect(linhas.map((l) => l.texto)).toEqual(["D. Ctda Pta: 270", "Itens Faturados"]);
  });

  it("tolera a variação de altura dentro da mesma linha", () => {
    // Sobrescrito e alinhamento de fonte deslocam o `y` alguns décimos; linha
    // nova desloca muito mais.
    const linhas = montarLinhas(
      pagina([pedaco("Consumo", 100, 500), pedaco("Ponta", 160, 502.5)]),
    );

    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.texto).toBe("Consumo Ponta");
  });

  it("ordena de cima para baixo", () => {
    const linhas = montarLinhas(
      pagina([pedaco("rodapé", 100, 100), pedaco("cabeçalho", 100, 700)]),
    );

    expect(linhas.map((l) => l.texto)).toEqual(["cabeçalho", "rodapé"]);
  });

  it("usa o vão para decidir se são duas palavras ou uma", () => {
    // Há PDF que desenha letra por letra. Juntar sempre com espaço produziria
    // "C o n s u m o"; juntar sempre sem espaço produziria "ConsumoPonta".
    const colado = montarLinhas(
      pagina([pedaco("Con", 100, 500), pedaco("sumo", 115, 500)]),
    );
    expect(colado[0]?.texto).toBe("Consumo");

    const separado = montarLinhas(
      pagina([pedaco("Consumo", 100, 500), pedaco("Ponta", 200, 500)]),
    );
    expect(separado[0]?.texto).toBe("Consumo Ponta");
  });

  it("descarta linha que ficou só com espaço", () => {
    expect(montarLinhas(pagina([pedaco("   ", 100, 500)]))).toEqual([]);
  });
});

describe("faixaDoTrecho", () => {
  it("devolve onde um trecho do texto foi impresso", () => {
    const [linha] = montarLinhas(
      pagina([
        pedaco("Vencimento", 100, 500),
        pedaco("Valor a Pagar", 300, 500),
      ]),
    );

    if (!linha) throw new Error("a linha deveria existir");
    const posicao = linha.texto.indexOf("Valor a Pagar");
    const faixa = faixaDoTrecho(linha, posicao, posicao + "Valor a Pagar".length);

    expect(faixa?.x0).toBe(300);
    expect(faixa?.x1).toBeGreaterThan(300);
  });

  it("cobre o rótulo que chegou partido em várias células", () => {
    // É o caso do reconhecimento óptico, que devolve palavra por palavra: sem
    // isto, procurar "Valor a Pagar" não casaria com célula nenhuma.
    const [linha] = montarLinhas(
      pagina([pedaco("Valor", 300, 500), pedaco("a", 340, 500), pedaco("Pagar", 355, 500)]),
    );

    if (!linha) throw new Error("a linha deveria existir");
    const posicao = linha.texto.indexOf("Valor");
    const faixa = faixaDoTrecho(linha, posicao, linha.texto.length);

    expect(faixa?.x0).toBe(300);
    expect(faixa?.x1).toBeGreaterThanOrEqual(355);
  });

  it("devolve nulo quando o trecho não toca célula alguma", () => {
    const [linha] = montarLinhas(pagina([pedaco("Total", 100, 500)]));
    if (!linha) throw new Error("a linha deveria existir");

    expect(faixaDoTrecho(linha, 900, 950)).toBeNull();
  });
});

describe("fragmentosEmOrdem", () => {
  it("preserva a ordem do fluxo e descarta o que é só espaço", () => {
    const fragmentos = fragmentosEmOrdem([
      pagina([pedaco("segundo", 300, 500), pedaco("  ", 10, 10), pedaco("primeiro", 100, 700)]),
    ]);

    expect(fragmentos).toEqual(["segundo", "primeiro"]);
  });
});

describe("linhasImpressas", () => {
  it("percorre as páginas na ordem", () => {
    const primeira = pagina([pedaco("página um", 100, 500)]);
    const segunda: PaginaDoDocumento = {
      ...pagina([pedaco("página dois", 100, 500)]),
      numero: 2,
    };

    expect(linhasImpressas([primeira, segunda])).toEqual(["página um", "página dois"]);
  });
});
