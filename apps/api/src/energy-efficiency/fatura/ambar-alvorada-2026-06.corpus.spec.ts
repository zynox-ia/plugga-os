import { describe, expect, it } from "vitest";

import { avisoDeCorpusAusente, fixtureDoCorpus } from "./corpus.js";
import { lerPorRegras, type LeituraDaFatura } from "./leitura.js";
import { linhasPorColuna } from "./linhas.js";

/**
 * Âmbar Energia AM — Alvorada 06/2026, a linha de crédito que se perde no corte.
 *
 * O layout da Âmbar imprime a tabela financeira na **coluna da direita**, ao
 * lado de blocos de cadastro que nada têm a ver com ela: "Consumo Ponta 25.578
 * kWh a 0,930248 0,744199 23.793,88" divide a linha impressa com "GRUPO A A4
 * LIVRE COMERCIAL", e "Demanda 613 kW a 14,157500 ..." divide com "Ligação
 * Número do Medidor Faturamento Modalidade". O corte por coluna resolve isso —
 * é a mesma máquina que salvou a Roraima — e cinco dos seis itens saem inteiros.
 *
 * **O sexto não sai, e é isto que este caso existe para registrar.** A linha
 * "Devolução Diferenca Desconto Tusd - Ccee 04/26-  -604,12" cai na altura do
 * cabeçalho "Leitura Anterior / Leitura Atual / Próxima Leitura", e ali o corte
 * por coluna encontra um limite a mais: o rótulo fica num segmento e o valor
 * `-604,12` fica em **outro**. O leitor de itens vê um rótulo sem número e
 * descarta. O teste abaixo prova essa separação diretamente, porque é ela — e
 * não o rótulo, nem o sinal negativo — a causa.
 *
 * A consequência é incomum e vale ser dita pelo nome: a soma dos itens lidos
 * (126.214,01) **ultrapassa** o total impresso (125.609,89), em exatamente os
 * 604,12 do crédito que ficou de fora. O cabeçalho que o gerador escreve fala em
 * "não alcança o total"; aqui é o contrário, e a diferença é a mesma.
 *
 * **Conferido** contra o caso golden `fatura-alvorada-2026-06`: consumo de ponta
 * 25.578 kWh a 0,930248 (TUSD), fora ponta 277.830 kWh a 0,291075, demanda 613
 * kW a 14,1575 = 8.678,54, ultrapassagem 73 kW a 56,525 = 4.126,32 e COSIP
 * 8.745,91 batem item a item; o golden lista, além desses, a devolução de
 * -604,12 que a leitura perde. Total impresso 125.609,89, também conferido.
 *
 * Duas observações sobre o golden, que **não** são erro do leitor:
 *
 * - o campo `uc` do golden guarda `118253278`, que nesta fatura é o **número da
 *   nota fiscal**. A unidade consumidora impressa sob o rótulo "Número da UC" é
 *   `0001524839002-30`, que é o que a leitura devolve — o leitor está certo e o
 *   golden é que registra outra coisa. O mesmo vale para a TBT;
 * - `tarifa_ponta_total` do golden (1,160523) é a tarifa cheia; esta é uma
 *   unidade de **mercado livre**, e a fatura da distribuidora cobra só a TUSD
 *   (0,930248). A leitura devolve o que está impresso.
 *
 * Fixture gerada por `pnpm --filter @plugga/api fatura:congelar`. O caso vive
 * aqui como a geometria da página, não como PDF: os fragmentos com posição são
 * o que a leitura consome, e congelá-los torna o teste determinístico sem
 * depender do arquivo original.
 *
 * **A fixture não está no git.** Ela é fatura de cliente, com o dado inteiro,
 * e git é container permanente, replicado em todo clone e sem revogação — o
 * JSON mora no balde do corpus no MinIO e chega por `corpus:baixar`. Sem a
 * chave, este arquivo inteiro é pulado com a mensagem que explica o porquê.
 *
 * **Sem anonimização.** O texto desta fixture é o impresso na fatura,
 * incluindo titular, documento e endereço. Congelada sem `--anonimizar`.
 */
const NOME = "ambar-alvorada-2026-06.pagina.json";
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

describe.skipIf(!DOCUMENTO)("Âmbar Energia AM — Alvorada 06/2026", () => {
  it("chega em ficha aproveitável sozinha, sem plano B", () => {
    expect(leitura().origem).toBe("texto_direto");
    expect(leitura().aproveitavel).toBe(true);
    expect(leitura().motivo).toBeNull();
  });

  it("identifica distribuidora, unidade consumidora e competência", () => {
    expect(leitura().identificacao.distribuidora).toBe("AMBAR ENERGIA");
    expect(leitura().identificacao.unidadeConsumidora).toBe("0001524839002-30");
    expect(leitura().identificacao.competencia).toEqual({ mes: 6, ano: 2026 });
  });

  it("lê consumo, tarifa e valor em ponta e fora ponta", () => {
    expect(leitura().invoice.consumoPontaKwh).toBe(25_578);
    expect(leitura().invoice.tarifaPonta).toBe(0.930248);
    expect(leitura().invoice.valorPonta).toBe(23_793.88);
    expect(leitura().invoice.consumoForaPontaKwh).toBe(277_830);
    expect(leitura().invoice.tarifaForaPonta).toBe(0.291075);
    expect(leitura().invoice.valorForaPonta).toBe(80_869.36);
  });

  it("lê a demanda contratada e a registrada", () => {
    expect(leitura().invoice.demandaContratadaKw).toBe(540);
    expect(leitura().invoice.demandaMedidaForaPontaKw).toBe(613);
    expect(leitura().invoice.tarifaDemanda).toBe(14.1575);
    expect(leitura().invoice.valorDemanda).toBe(8_678.54);
  });

  it("lê a tabela de itens com quantidade, unidade, tarifa e valor", () => {
    const esperados = [
      { rotulo: "Consumo Ponta", quantidade: 25_578, unidade: "kWh", tarifa: 0.930248, valor: 23_793.88 },
      { rotulo: "Demanda", quantidade: 613, unidade: "kW", tarifa: 14.1575, valor: 8_678.54 },
      { rotulo: "Consumo F/Ponta", quantidade: 277_830, unidade: "kWh", tarifa: 0.291075, valor: 80_869.36 },
      { rotulo: "Dem Ultr", quantidade: 73, unidade: "kW", tarifa: 56.525, valor: 4_126.32 },
      { rotulo: "Contribuição de Iluminação Pública (COSIP)", quantidade: null, unidade: null, tarifa: null, valor: 8_745.91 },
    ];

    expect(leitura().itens).toHaveLength(5);
    for (const esperado of esperados) {
      const achado = leitura().itens.find((item) => item.rotulo === esperado.rotulo);
      expect(achado, `item ausente: ${esperado.rotulo}`).toMatchObject(esperado);
    }
  });

  it("a aritmética de cada item fecha", () => {
    expect(leitura().conferencia.confirmados).toBe(4);
    expect(leitura().conferencia.divergentes).toBe(0);
    expect(leitura().conferencia.temDivergencia).toBe(false);
  });

  it("o corte por coluna separa o crédito da CCEE do seu próprio valor", () => {
    const segmentos = linhasPorColuna(DOCUMENTO?.paginas ?? []);

    // Os dois estão lá, e é o problema: em segmentos diferentes. Um item precisa
    // de rótulo e número na mesma linha para ser reconhecido, e a devolução de
    // -604,12 é a única linha desta fatura em que eles se separam.
    expect(segmentos).toContain("Devolução Diferenca Desconto Tusd - Ccee 04/26-");
    expect(segmentos).toContain("-604,12");
    expect(
      segmentos.some((linha) => /Devolução.*-604,12/.test(linha)),
    ).toBe(false);
  });

  it("a soma dos itens lidos ultrapassa o total impresso — falta o crédito", () => {
    // Incomum e específico deste caso: o item perdido é **negativo**, então a
    // soma sobra em vez de faltar, em exatamente os 604,12 da devolução. O
    // número abaixo é o **observado**, congelado como evidência do buraco. Não o
    // ajuste para fechar — quem fecha é a leitura, quando aprender a linha.
    expect(leitura().invoice.valorTotal).toBe(125_609.89);

    const soma = leitura().itens
      .filter((item) => item.compoeTotal)
      .reduce((total, item) => total + item.valor, 0);
    expect(Number(soma.toFixed(2))).toBe(126_214.01);

    // A sobra é exatamente o crédito que ficou de fora.
    const sobra = Number((soma - (leitura().invoice.valorTotal ?? 0)).toFixed(2));
    expect(sobra).toBe(604.12);
  });

  it("declara exatamente o que ainda depende de conferência humana", () => {
    // Aqui a soma **passa** do total em R$ 604,12 — não é item perdido, é item
    // a mais ou valor lido para cima, e a frase diz qual dos dois procurar.
    // Antes do portão da Trava 1 esta lista era vazia: a fatura entregava cinco
    // itens todos conferidos e uma soma que não é a do boleto, sem uma palavra.
    expect(leitura().camposParaConfirmar).toEqual([
      "a soma dos itens (R$ 126214.01) não fecha com o total impresso (R$ 125609.89): diferença de R$ 604.12. Costuma ser item somado que não compõe o total, ou valor lido a mais — corrija a extração, nunca ajuste o total.",
    ]);
  });
});
