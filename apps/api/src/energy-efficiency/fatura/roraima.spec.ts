import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { conferir } from "./conferencia.js";
import { identificar } from "./identificacao.js";
import { MOTIVO_INFORMATIVO } from "./informativos.js";
import { lerItens } from "./itens.js";
import { lerPorRegras } from "./leitura.js";
import { linhasImpressas, linhasPorColuna } from "./linhas.js";
import type { PaginaDoDocumento } from "./paginas.js";

/**
 * Roraima Energia — Santa Tereza 06/2026, o caso que a leitura recusava.
 *
 * A fatura é de duas colunas, e a leitura por linha impressa de largura inteira
 * colava blocos vizinhos: `Consumo Ponta 17419 kWh a 2.689175` saía grudado em
 * `GRUPO A A4 COMERCIAL COMERCIAL`. Some-se a isso a tarifa com **ponto**
 * decimal na descrição, e nenhuma linha de consumo ou de demanda era
 * reconhecida — a fatura era recusada por campos essenciais ausentes.
 *
 * O caso vive aqui como a geometria da página, não como PDF: os fragmentos com
 * posição são o que a leitura consome, e congelá-los torna o teste determinístico
 * sem depender do arquivo original.
 */
const PAGINAS = (
  JSON.parse(
    readFileSync(join(__dirname, "roraima-santa-tereza-2026-06.pagina.json"), "utf8"),
  ) as { paginas: PaginaDoDocumento[] }
).paginas;

const ITENS_ESPERADOS = [
  { rotulo: "Consumo Ponta", quantidade: 17_419, unidade: "kWh", tarifa: 2.689175, valor: 46_842.73 },
  { rotulo: "Consumo F/Ponta", quantidade: 183_153, unidade: "kWh", tarifa: 0.625962, valor: 114_646.81 },
  { rotulo: "Demanda Ponta sem ICMS", quantidade: 133, unidade: "kW", tarifa: 22.16, valor: 2_947.28 },
  { rotulo: "Demanda Ponta com ICMS", quantidade: 367, unidade: "kW", tarifa: 27.7, valor: 10_165.9 },
];

describe("Roraima Energia — layout de duas colunas", () => {
  it("a leitura de largura inteira cola as colunas, e por isso não basta", () => {
    const linhas = linhasImpressas(PAGINAS);

    expect(
      linhas.some((linha) => /GRUPO A.*Consumo Ponta 17419 kWh/.test(linha)),
    ).toBe(true);
  });

  it("o corte por coluna separa a tabela de itens do cabeçalho da unidade", () => {
    const linhas = linhasPorColuna(PAGINAS);

    // Cada coluna vira um segmento: a descrição com a tarifa de um lado, o valor
    // do outro. O leitor de itens já casa esse formato, que é o mesmo de quando
    // a distribuidora imprime as colunas em linhas separadas.
    expect(linhas).toContain("Consumo Ponta 17419 kWh a 2.689175 2,151340");
    expect(linhas).toContain("Contribuição de Iluminação Pública (COSIP)");
    expect(linhas).toContain("46.842,73");

    // E nenhum segmento mistura o cabeçalho da unidade com a tabela.
    expect(linhas.some((linha) => /GRUPO A.*Consumo Ponta/.test(linha))).toBe(false);
  });

  it("lê os quatro itens com quantidade, tarifa e valor", () => {
    const itens = lerItens(linhasPorColuna(PAGINAS));

    for (const esperado of ITENS_ESPERADOS) {
      const achado = itens.find((item) => item.rotulo === esperado.rotulo);
      expect(achado, `item ausente: ${esperado.rotulo}`).toBeDefined();
      expect(achado).toMatchObject(esperado);
    }
  });

  it("a tarifa com ponto decimal é lida como tarifa, não como milhar", () => {
    const itens = lerItens(linhasPorColuna(PAGINAS));
    const ponta = itens.find((item) => item.rotulo === "Consumo Ponta");

    // Impresso "2.689175" na descrição e "2,151340" na coluna ao lado: o mesmo
    // número, dois separadores. Ler como milhar daria 2.689.175.
    expect(ponta?.tarifa).toBe(2.689175);
  });

  it("a aritmética de cada item fecha, e a soma fecha com o total", () => {
    const itens = lerItens(linhasPorColuna(PAGINAS));
    const conferencia = conferir(itens);

    expect(conferencia.divergentes).toBe(0);
    expect(conferencia.confirmados).toBe(4);

    const cobrados = itens.filter(
      (item) => !/bandeira/i.test(item.rotulo),
    );
    const soma = cobrados.reduce((total, item) => total + item.valor, 0);
    expect(Number(soma.toFixed(2))).toBe(174_636.7);
  });

  it("a bandeira amarela é lida, mas não entra na soma do total", () => {
    const itens = lerItens(linhasPorColuna(PAGINAS));
    const bandeira = itens.find((item) => /bandeira/i.test(item.rotulo));

    expect(bandeira?.valor).toBe(3_774.59);
    // Somá-la estouraria o total: é linha informativa nesta referência.
    const comBandeira = itens.reduce((total, item) => total + item.valor, 0);
    expect(Number(comBandeira.toFixed(2))).not.toBe(174_636.7);
  });

  it("não confunde grandeza de medição com item financeiro", () => {
    const itens = lerItens(linhasPorColuna(PAGINAS));

    // "En Ativa F-Pta 52536132,00 ..." tem a forma de item sem quantidade.
    expect(itens.map((item) => item.rotulo)).not.toContain("En Ativa F-Pta");
    expect(itens.some((item) => /^(En Ativa|Dem Acum|Dmcr|Ufer)/i.test(item.rotulo))).toBe(false);
    expect(itens).toHaveLength(6);
  });

  it("acha a unidade consumidora pelo rótulo, mesmo sem dígito verificador", () => {
    const identificacao = identificar([
      ...linhasImpressas(PAGINAS),
      ...linhasPorColuna(PAGINAS),
    ]);

    expect(identificacao.unidadeConsumidora).toBe("01939890");
    expect(identificacao.distribuidora).toBe("RORAIMA ENERGIA");
    expect(identificacao.competencia).toEqual({ mes: 6, ano: 2026 });
  });

  /**
   * O critério de aceite fim a fim: a fatura passa **sozinha**, sem ninguém
   * desmarcar a bandeira na tela. `lerPorRegras` é o mesmo caminho que
   * `lerFatura` usa a partir da página normalizada — só pula a abertura do PDF,
   * que a fixture já congelou.
   */
  it("a fatura é aproveitável sozinha, com a bandeira já fora do total", () => {
    const leitura = lerPorRegras({
      origem: "texto_direto",
      paginas: PAGINAS,
      confianca: null,
      totalDePaginas: PAGINAS.length,
    });

    expect(leitura.aproveitavel).toBe(true);
    expect(leitura.motivo).toBeNull();
    expect(leitura.identificacao.unidadeConsumidora).toBe("01939890");
    expect(leitura.invoice.valorTotal).toBe(174_636.7);
    expect(leitura.demandaComplementoValor).toBe(2_947.28);

    const soma = leitura.itens
      .filter((item) => item.compoeTotal)
      .reduce((total, item) => total + item.valor, 0);
    expect(Number(soma.toFixed(2))).toBe(174_636.7);

    const bandeira = leitura.itens.find((item) => /bandeira/i.test(item.rotulo));
    expect(bandeira?.compoeTotal).toBe(false);
    expect(bandeira?.motivoForaDoTotal).toBe(MOTIVO_INFORMATIVO);
    // O item continua na lista — nunca é removido, só marcado.
    expect(bandeira?.valor).toBe(3_774.59);
  });
});
