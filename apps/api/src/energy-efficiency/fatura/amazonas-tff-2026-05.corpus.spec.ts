import { describe, expect, it } from "vitest";

import { avisoDeCorpusAusente, fixtureDoCorpus } from "./corpus.js";
import { lerPorRegras, leituraProvada, type LeituraDaFatura } from "./leitura.js";
import { linhasDaTabelaFinanceira } from "./linhas.js";

/**
 * Âmbar Energia AM — aeroporto de Tefé (TFF) 05/2026, digitalizada.
 *
 * É a única fatura do corpus que atravessa OCR e tem como referência
 * estrutural `amazonas-tff-2026-04`: mesma UC e mesmo desenho, um mês antes,
 * com camada de texto. Abril prova onde ficam descrição, tarifa e valor; não
 * fornece nenhum número a este caso. Quantidade, tarifa, parcela e total abaixo
 * saem exclusivamente da imagem de maio.
 *
 * O OCR de página inteira preservava cabeçalho e total, mas misturava as duas
 * colunas da folha e perdia palavras da tabela. O refinamento novo é delimitado
 * pelos rótulos impressos "Itens Financeiros" e "Total a pagar", amplia somente
 * esse retângulo e reconhece-o como bloco. Não há ramo por distribuidora, UC ou
 * competência.
 *
 * A posição decide o que pode ser candidato: uma linha sem quantidade só entra
 * se seu valor estiver alinhado sob a coluna "Valor (R$)". Por isso as treze
 * linhas impressas se dividem em onze itens financeiros e dois informativos:
 *
 * - sete itens com quantidade, tarifa e valor, todos aprovados pela
 *   multiplicação: consumo ponta 1.820 × 1,744610 = 3.175,19; demandas
 *   171 × 22,892000 = 3.914,53 e 29 × 22,892000 = 663,86; reativo ponta
 *   350 × 0,336005 = 117,60; consumo fora ponta 14.070 × 0,500607 =
 *   7.043,54; reativo fora ponta 2.030 × 0,336005 = 682,09; demanda de
 *   geração 600 × 13,751000 = 8.250,60;
 * - quatro ajustes na coluna financeira: diferenças GDIS 1.616,50 e 74,88;
 *   créditos de geração -3.175,19 e -7.043,54;
 * - duas linhas fora da coluna financeira, portanto não itens: leitura reversa
 *   acumulada 44.434,00 e compensação reversa 1.820,00.
 *
 * Os onze itens somam exatamente o total impresso, 15.320,06. Isso fecha a
 * Trava 1 sem copiar abril e elimina o falso item de 44.434,00 pela relação
 * espacial que a própria folha publica.
 *
 * A decisão de determinismo permanece: Tesseract só roda ao congelar ou na
 * travessia opcional do PDF. O teste normal consome os 826 fragmentos já
 * congelados (confiança primária 83), logo é puro e reproduzível. Recongelar
 * exige reconferir os números contra a imagem.
 *
 * A fixture e o PDF não estão no git. Ambos contêm dado real de cliente e
 * vivem no corpus privado; este spec guarda somente as provas numéricas.
 */
const NOME = "amazonas-tff-2026-05.pagina.json";
const DOCUMENTO = fixtureDoCorpus(NOME);

if (!DOCUMENTO) console.warn(avisoDeCorpusAusente(NOME));

let lida: LeituraDaFatura | null = null;
function leitura(): LeituraDaFatura {
  if (!DOCUMENTO) throw new Error(`${NOME} não está no corpus local`);
  return (lida ??= lerPorRegras(DOCUMENTO));
}

describe.skipIf(!DOCUMENTO)("Âmbar Energia AM — Tefé (TFF) 05/2026, digitalizada", () => {
  it("fecha a ficha e a Trava 1 preservando a origem óptica", () => {
    expect(leitura().origem).toBe("reconhecimento_optico");
    expect(DOCUMENTO?.confianca).toBe(83);
    expect(leitura().aproveitavel).toBe(true);
    expect(leitura().motivo).toBeNull();
    expect(leituraProvada(leitura())).toBe(true);
    expect(leitura().camposParaConfirmar).toEqual([]);
  });

  it("preserva distribuidora, UC e competência lidas em maio", () => {
    expect(leitura().identificacao.distribuidora).toBe("AMBAR ENERGIA");
    expect(leitura().identificacao.unidadeConsumidora).toBe("1060454-5");
    expect(leitura().identificacao.competencia).toEqual({ mes: 5, ano: 2026 });
  });

  it("lê consumo, tarifas e demanda realmente impressos", () => {
    expect(leitura().invoice).toMatchObject({
      consumoPontaKwh: 1_820,
      tarifaPonta: 1.74461,
      valorPonta: 3_175.19,
      consumoForaPontaKwh: 14_070,
      tarifaForaPonta: 0.500607,
      valorForaPonta: 7_043.54,
      demandaContratadaKw: 200,
      demandaMedidaForaPontaKw: 171,
      tarifaDemanda: 22.892,
      valorDemanda: 4_578.39,
      valorReativo: 799.69,
      valorTotal: 15_320.06,
    });
  });

  it("reconstrói os onze itens financeiros provados", () => {
    const esperados = [
      { rotulo: "Consumo Ponta", quantidade: 1_820, tarifa: 1.74461, valor: 3_175.19 },
      { rotulo: "Demanda", quantidade: 171, tarifa: 22.892, valor: 3_914.53 },
      { rotulo: "Demanda", quantidade: 29, tarifa: 22.892, valor: 663.86 },
      { rotulo: "En R Exc Ponta", quantidade: 350, tarifa: 0.336005, valor: 117.6 },
      { rotulo: "Consumo F/Ponta", quantidade: 14_070, tarifa: 0.500607, valor: 7_043.54 },
      { rotulo: "En R Exc F/Ponta", quantidade: 2_030, tarifa: 0.336005, valor: 682.09 },
      { rotulo: "Demanda Geracao", quantidade: 600, tarifa: 13.751, valor: 8_250.6 },
      {
        rotulo: "Diferença Importe Gdis Tusd Fio B Ponta 05/26-00",
        quantidade: null,
        tarifa: null,
        valor: 1_616.5,
      },
      {
        rotulo: "Diferença Importe Gdis Tusd Fio B Fora P 05/26-00",
        quantidade: null,
        tarifa: null,
        valor: 74.88,
      },
      { rotulo: "Credito De Geracao Ponta", quantidade: null, tarifa: null, valor: -3_175.19 },
      {
        rotulo: "Credito De Geracao F/Ponta",
        quantidade: null,
        tarifa: null,
        valor: -7_043.54,
      },
    ];

    expect(leitura().itens).toHaveLength(11);
    for (const esperado of esperados) {
      const achado = leitura().itens.find(
        (item) => item.rotulo === esperado.rotulo && item.quantidade === esperado.quantidade,
      );
      expect(achado, `item ausente: ${esperado.rotulo}`).toMatchObject(esperado);
    }
  });

  it("elimina as duas linhas informativas pela posição", () => {
    if (!DOCUMENTO) throw new Error(`${NOME} não está no corpus local`);
    const financeiras = linhasDaTabelaFinanceira(DOCUMENTO.paginas);

    expect(financeiras).toHaveLength(15);
    expect(financeiras.some((linha) => /44\.?434,00/.test(linha))).toBe(false);
    expect(financeiras.some((linha) => /Compensa[cç][aã]o En Reversa/i.test(linha))).toBe(false);
    expect(leitura().itens.some((item) => item.valor === 44_434)).toBe(false);
    expect(leitura().itens.some((item) => item.valor === 1_820)).toBe(false);
  });

  it("aprova sete multiplicações e fecha os quatro ajustes pelo total", () => {
    expect(leitura().conferencia.confirmados).toBe(7);
    expect(leitura().conferencia.semConferencia).toBe(4);
    expect(leitura().conferencia.divergentes).toBe(0);
    expect(leitura().conferencia.temDivergencia).toBe(false);

    const soma = leitura().itens
      .filter((item) => item.compoeTotal)
      .reduce((total, item) => total + item.valor, 0);
    expect(Number(soma.toFixed(2))).toBe(15_320.06);
  });
});
