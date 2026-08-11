import { describe, expect, it } from "vitest";

import { avisoDeCorpusAusente, fixtureDoCorpus } from "./corpus.js";
import { lerPorRegras, type LeituraDaFatura } from "./leitura.js";

/**
 * Âmbar Energia AM — aeroporto de Tefé (TFF) 05/2026, **digitalizada**.
 *
 * A única fatura sem camada de texto de todo o acervo, e por isso a única que
 * exercita o caminho do reconhecimento óptico de ponta a ponta. Sem ela, o OCR
 * tem os testes de `ocr.spec.ts` e a integração opcional, mas nenhuma regressão
 * sobre documento real.
 *
 * Vale ainda mais porque tem par: `amazonas-tff-2026-04.corpus.spec.ts` é a
 * **mesma unidade consumidora, o mesmo layout, o mês anterior**, com camada de
 * texto. Os dois casos lado a lado medem o custo do OCR sem trocar de fatura
 * junto — lá, seis itens e ficha fechada; aqui, o que segue.
 *
 * ## A decisão sobre determinismo, que o ticket mandava tomar por escrito
 *
 * **Este caso entra no corpus, e roda na CI junto com os outros.** A dúvida do
 * ticket era se uma fixture nascida de OCR reproduziria em outra máquina. Ela
 * reproduz, e o motivo é que **o Tesseract não roda no teste**: o OCR aconteceu
 * uma vez, na hora de congelar, e o que foi para o balde é o JSON com as
 * palavras e as coordenadas que ele devolveu. O que a CI faz é `lerPorRegras`
 * sobre esse JSON — função pura, sem WebAssembly, sem `por.traineddata`, sem
 * rasterização. A saída depende do arquivo, e o arquivo é o mesmo byte a byte
 * para todo mundo que baixar o corpus.
 *
 * O que **não** é determinístico é **recongelar**: rodar `fatura:congelar` de
 * novo sobre este PDF em outra máquina, com outra versão de `tesseract.js` ou de
 * `@napi-rs/canvas`, pode produzir um JSON diferente — e aí os números deste
 * spec deixam de bater. Isso é manutenção, não fragilidade da suíte: quem
 * recongelar tem de reconferir, exatamente como quem congelou da primeira vez.
 * Fixar a versão do Tesseract na CI seria proteção contra um risco que não
 * existe, porque a CI não chama o Tesseract.
 *
 * Como medida, e porque a afirmação acima merecia prova e não confiança: este
 * PDF foi congelado **duas vezes seguidas** nesta máquina e produziu bytes
 * idênticos nas duas — 771 fragmentos, confiança média 83,0 nas duas rodadas.
 * A instabilidade entre execuções, que seria o pior caso, não existe.
 *
 * ## O que o OCR custa, medido nesta fatura
 *
 * A ficha **não fecha**: `campos_essenciais_ausentes`. O que sobrevive e o que
 * se perde:
 *
 * - **sobrevive** o cabeçalho: distribuidora, UC 1060454-5, competência 05/2026
 *   e o total, 15.320,06, lido de "Total a R$ 15.320,06 pagar" — repare na
 *   ordem das palavras, que o Tesseract embaralhou e que não atrapalhou porque
 *   o valor ficou inteiro;
 * - **perde-se a tabela de itens.** Os rótulos se descolaram dos números: a
 *   linha do consumo de ponta virou "GRUPO A COMERCIAL NORMAL kWh a 1,744610
 *   1,744610 3.175,19", sem o rótulo "Consumo Ponta", e a da demanda virou
 *   "Número do Medidor Modalidade 892000 Ligação 22,892000 3.914,53" — com o
 *   `22.` da tarifa costurado no meio de outra palavra;
 * - **e entra lixo.** O único item reconhecido é "Desc. da Anterior um.
 *   F/Ponta(K" valendo 44.434,00, que não é dinheiro nenhum: é a **leitura do
 *   medidor** em kWh, e o rótulo é a mistura de dois pedaços de cabeçalho. A
 *   soma dos itens que "compõem o total" dá 44.434,00 contra um total de
 *   15.320,06 — quase o triplo.
 *
 * Esse último ponto é o mais valioso do caso, e é o que ele existe para
 * proteger: **a conferência aritmética não pegou o lixo**. O item entrou sem
 * quantidade e sem tarifa, então não há multiplicação a conferir, e ele passou
 * por `sem_conferencia` direto para dentro da ficha. A rede que segura o OCR
 * errando um dígito não segura o OCR inventando uma linha. Está congelado
 * assim; quando o leitor aprender a recusar item sem quantidade cujo valor
 * estoura o total, este arquivo fica vermelho.
 *
 * Não há caso golden para esta referência — a conferência foi contra o
 * documento, e o total impresso confere. O detalhamento item a item **não pôde
 * ser conferido**, porque o próprio OCR é a fonte e não há segunda leitura com
 * que cruzar.
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
const NOME = "amazonas-tff-2026-05.pagina.json";
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

describe.skipIf(!DOCUMENTO)("Âmbar Energia AM — Tefé (TFF) 05/2026, digitalizada", () => {
  it("é o único caso do corpus que vem do reconhecimento óptico", () => {
    expect(leitura().origem).toBe("reconhecimento_optico");
    expect(DOCUMENTO?.confianca).toBe(83);
    expect(leitura().aproveitavel).toBe(false);
    expect(leitura().motivo).toBe("campos_essenciais_ausentes");
  });

  it("o cabeçalho sobrevive ao OCR: distribuidora, UC e competência", () => {
    // A mesma UC de `amazonas-tff-2026-04`, que é o par com camada de texto.
    expect(leitura().identificacao.distribuidora).toBe("AMBAR ENERGIA");
    expect(leitura().identificacao.unidadeConsumidora).toBe("1060454-5");
    expect(leitura().identificacao.competencia).toEqual({ mes: 5, ano: 2026 });
  });

  it("a demanda contratada passa; nenhuma grandeza medida passa", () => {
    expect(leitura().invoice.demandaContratadaKw).toBe(200);
    expect(leitura().invoice.consumoPontaKwh).toBeUndefined();
    expect(leitura().invoice.consumoForaPontaKwh).toBeUndefined();
    expect(leitura().invoice.valorDemanda).toBeUndefined();
  });

  it("o único item reconhecido não é dinheiro: é a leitura do medidor", () => {
    // "Desc. da Anterior um. F/Ponta(K" é a colagem de dois pedaços de
    // cabeçalho, e 44.434,00 é o registrador em kWh. O item entrou sem
    // quantidade e sem tarifa — por isso não há multiplicação a conferir, e a
    // conferência aritmética, que pega o OCR errando um dígito, não pega o OCR
    // inventando uma linha.
    const esperados = [
      { rotulo: "Desc. da Anterior um. F/Ponta(K", quantidade: null, unidade: null, tarifa: null, valor: 44_434 },
    ];

    expect(leitura().itens).toHaveLength(1);
    for (const esperado of esperados) {
      const achado = leitura().itens.find((item) => item.rotulo === esperado.rotulo);
      expect(achado, `item ausente: ${esperado.rotulo}`).toMatchObject(esperado);
    }
    expect(leitura().itens[0]?.compoeTotal).toBe(true);
  });

  it("sem quantidade nem tarifa, não há aritmética que recuse o item", () => {
    expect(leitura().conferencia.confirmados).toBe(0);
    expect(leitura().conferencia.divergentes).toBe(0);
    expect(leitura().conferencia.semConferencia).toBe(1);
    expect(leitura().conferencia.temDivergencia).toBe(false);
  });

  it("a soma dos itens quase triplica o total impresso, e nada barra isso", () => {
    // O total, esse, o OCR entregou inteiro — de "Total a R$ 15.320,06 pagar",
    // com as palavras fora de ordem e o número intacto. O 44.434,00 abaixo é o
    // **observado**, congelado como evidência do buraco. Não o ajuste para
    // fechar — quem fecha é a leitura, quando aprender a recusar item sem
    // quantidade cujo valor estoura o total.
    expect(leitura().invoice.valorTotal).toBe(15_320.06);

    const soma = leitura().itens
      .filter((item) => item.compoeTotal)
      .reduce((total, item) => total + item.valor, 0);
    expect(Number(soma.toFixed(2))).toBe(44_434);
  });

  it("declara exatamente o que ainda depende de conferência humana", () => {
    // A digitalizada, e o caso mais desconfortável do corpus: o OCR devolve uma
    // linha só, que nem item é, e um total de R$ 15.320,06 ao lado de uma soma
    // de R$ 44.434,00. A ficha é recusada de qualquer forma, mas antes do
    // portão da Trava 1 esta lista era vazia — a fatura não dizia nada sobre a
    // única evidência aritmética que tinha.
    expect(leitura().camposParaConfirmar).toEqual([
      "a soma dos itens (R$ 44434.00) não fecha com o total impresso (R$ 15320.06): diferença de R$ 29113.94. Costuma ser item somado que não compõe o total, ou valor lido a mais — corrija a extração, nunca ajuste o total.",
    ]);
  });
});
