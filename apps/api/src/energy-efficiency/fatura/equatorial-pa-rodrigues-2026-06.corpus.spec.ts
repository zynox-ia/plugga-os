import { describe, expect, it } from "vitest";

import { avisoDeCorpusAusente, fixtureDoCorpus } from "./corpus.js";
import {
  lerPorRegras,
  somaDoQueCompoeOTotal,
  somaFechaComOTotal,
  type LeituraDaFatura,
} from "./leitura.js";
import { linhasImpressas, linhasPorColuna } from "./linhas.js";

/**
 * Equatorial Pará — Rodrigues Colchões 06/2026.
 *
 * Este caso prova a leitura tabular genérica em que a unidade faz parte do
 * rótulo, a quantidade tem duas casas, duas tarifas vêm antes das bases e do
 * valor, e o quadro tributário continua à direita da mesma linha. Quatro itens
 * conferem por multiplicação; bandeira e CIP entram como parcelas sem
 * quantidade. A soma dos seis fecha exatamente com o valor da coluna
 * semanticamente rotulada `Valor cobrado (R$)`.
 *
 * A unidade consumidora continua nula de propósito. O código está impresso sem
 * rótulo inequívoco no bloco de cabeçalho; inferi-lo apenas pela forma poderia
 * confundi-lo com inscrição, documento ou código de barras. A prova financeira
 * fecha, e só esse campo segue para confirmação humana.
 *
 * Fixture gerada por `pnpm --filter @plugga/api fatura:congelar`. O caso vive
 * aqui como a geometria da página, não como PDF: os fragmentos com posição são
 * o que a leitura consome, e congelá-los torna o teste determinístico sem
 * depender do arquivo original.
 *
 * **A fixture não está no git.** Ela é fatura de cliente, com o dado inteiro,
 * e git é container permanente, replicado em todo clone e sem revogação — o
 * JSON mora no balde do corpus no armazenamento e chega por `corpus:baixar`. Sem a
 * chave, este arquivo inteiro é pulado com a mensagem que explica o porquê.
 *
 * **Sem anonimização.** O texto desta fixture é o impresso na fatura,
 * incluindo titular, documento e endereço. Congelada sem `--anonimizar`.
 */
const NOME = "equatorial-pa-rodrigues-2026-06.pagina.json";
const DOCUMENTO = fixtureDoCorpus(NOME);

if (!DOCUMENTO) console.warn(avisoDeCorpusAusente(NOME));

/**
 * A leitura, feita no primeiro caso que a pedir — nunca na coleta.
 *
 * O vitest executa o corpo de um `describe.skipIf` mesmo quando vai pular os
 * casos. Derivar qualquer coisa da fixture ali dentro quebraria o arquivo
 * inteiro em quem não baixou o corpus, que é exatamente o que o pulo existe
 * para evitar.
 */
let lida: LeituraDaFatura | null = null;
function leitura(): LeituraDaFatura {
  if (!DOCUMENTO) throw new Error(`${NOME} não está no corpus local`);
  return (lida ??= lerPorRegras(DOCUMENTO));
}

describe.skipIf(!DOCUMENTO)("Equatorial Pará — Rodrigues Colchões 06/2026", () => {
  it("fecha a ficha pelas regras, sem visão nem configuração por distribuidora", () => {
    expect(leitura().origem).toBe("texto_direto");
    expect(leitura().aproveitavel).toBe(true);
    expect(leitura().motivo).toBeNull();
    expect(somaFechaComOTotal(leitura())).toBe(true);
  });

  it("mantém a unidade consumidora para confirmação porque falta rótulo inequívoco", () => {
    expect(leitura().identificacao.distribuidora).toBe("EQUATORIAL");
    expect(leitura().identificacao.unidadeConsumidora).toBeNull();
    expect(leitura().identificacao.competencia).toEqual({ mes: 6, ano: 2026 });
    expect(leitura().camposParaConfirmar).toEqual(["unidade consumidora"]);
  });

  it("preserva consumo em ponta e fora ponta com a tarifa que inclui tributos", () => {
    expect(leitura().invoice).toMatchObject({
      consumoPontaKwh: 2_015.02,
      tarifaPonta: 4.077295,
      valorPonta: 8_215.83,
      consumoForaPontaKwh: 33_701.92,
      tarifaForaPonta: 0.567892,
      valorForaPonta: 19_139.06,
    });
  });

  it("corta o item antes do quadro tributário que continua à direita", () => {
    expect(linhasImpressas(DOCUMENTO?.paginas ?? [])).toContain(
      "Consumo Ponta (kWh) 2.015,02 4,077295 3,021150 567,15 1.561,01 8.215,83 PIS 39.983,22 1,5185 607,14",
    );
    expect(leitura().itens[0]).toMatchObject({
      rotulo: "Consumo Ponta",
      quantidade: 2_015.02,
      tarifa: 4.077295,
      valor: 8_215.83,
      veredicto: "confirmado",
    });
  });

  it("obtém o total da coluna rotulada pela própria fatura", () => {
    expect(linhasImpressas(DOCUMENTO?.paginas ?? [])).toContain(
      "Nome do Cliente: C.C: Unidade de Leitura: Competência: Vencimento: Valor cobrado (R$):",
    );
    expect(linhasPorColuna(DOCUMENTO?.paginas ?? [])).toContain("51.737,00");
    expect(leitura().invoice.valorTotal).toBe(51_737);
  });

  it("confere por aritmética todos os itens que têm quantidade e tarifa", () => {
    expect(leitura().conferencia.confirmados).toBe(4);
    expect(leitura().conferencia.divergentes).toBe(0);
    expect(leitura().conferencia.semConferencia).toBe(2);
    expect(leitura().conferencia.temDivergencia).toBe(false);
  });

  it("preserva demanda, ultrapassagem, bandeira e CIP e fecha a Trava 1", () => {
    expect(leitura().invoice).toMatchObject({
      demandaMedidaForaPontaKw: 162.96,
      demandaContratadaKw: 70,
      tarifaDemanda: 60.474902,
      valorDemanda: 9_854.99,
      valorMultasJurosEncargos: 11_243.5,
    });
    expect(leitura().itens.slice(4)).toMatchObject([
      { rotulo: "Adicional Bandeira", valor: 908.63, compoeTotal: true },
      { rotulo: "Cip-Ilum Pub Pref Munic", valor: 2_374.99, compoeTotal: true },
    ]);
    expect(somaDoQueCompoeOTotal(leitura().itens)).toBe(51_737);
  });
});
