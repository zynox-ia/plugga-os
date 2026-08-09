import { faixaDoTrecho, montarLinhas, type LinhaImpressa } from "./linhas.js";
import type { PaginaDoDocumento } from "./paginas.js";

/**
 * Os dois campos que a leitura antiga mandava digitar à mão.
 *
 * `leitura.ts` afirmava que o valor total e a demanda contratada "não vêm na
 * camada de texto". Vêm — os dois. O que não vinha era a coordenada: sem ela os
 * pedaços chegavam soltos na ordem do fluxo, o rótulo caía longe do número, e a
 * associação era impossível de fazer. A conclusão virou uma propriedade da
 * fatura quando era uma limitação do extrator.
 *
 * O custo disso era um imposto silencioso: duas digitações por fatura, todo
 * mês, em números que decidem o dimensionamento do estudo. Digitar demanda
 * contratada errado não gera erro — gera um estudo plausível e errado.
 *
 * Os dois campos são lidos por caminhos diferentes, de propósito:
 *
 * - a **demanda contratada** vem rotulada na mesma linha impressa, então casa
 *   por texto;
 * - o **valor total** é o número embaixo de um cabeçalho de coluna, e casar por
 *   texto pegaria qualquer `R$` da folha. Esse casa por posição: acha a coluna
 *   "Valor a Pagar" e desce.
 */

export type CamposExtras = {
  /** Demanda contratada única, quando a fatura não separa ponta. */
  demandaContratadaKw: number | null;
  demandaContratadaPontaKw: number | null;
  demandaContratadaForaPontaKw: number | null;
  valorTotal: number | null;
};

/** "1.533,45" → 1533.45; "270" → 270. Formato brasileiro, sempre. */
function numero(texto: string): number | null {
  const limpo = texto.replace(/[^\d.,-]/g, "");
  if (!limpo) return null;

  const valor = Number(limpo.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(valor) ? valor : null;
}

/**
 * Demanda contratada em ponta e fora ponta.
 *
 * `D. Ctda Pta:` é a abreviação da Ambar; as outras formas cobrem o que aparece
 * no resto do corpus. O sufixo é sempre opcional porque tarifa verde tem
 * demanda única — nesse caso o valor cai em `demandaContratadaKw`.
 */
const CONTRATADA_PONTA = /D\.?\s*C(?:td|ontratad)a?\.?\s*(?:P|Pta|Ponta)\b\D{0,4}([\d.,]+)/i;
const CONTRATADA_FORA_PONTA =
  /D\.?\s*C(?:td|ontratad)a?\.?\s*F[./-]?\s*(?:P|Pta|Ponta)\b\D{0,4}([\d.,]+)/i;
const CONTRATADA_UNICA = /Dem(?:anda)?\.?\s*Contratada\b(?!\s*(?:P|F))\D{0,12}([\d.,]+)/i;

/**
 * Cabeçalho da coluna do total. É o rótulo que a distribuidora imprime acima do
 * valor fechado da fatura, e não colide com os totais parciais do corpo.
 *
 * O "a" é opcional porque o reconhecimento óptico o perde com frequência:
 * palavra de uma letra entre duas longas costuma sair como ruído ou virar linha
 * própria. Exigi-lo faria a leitura de imagem falhar num rótulo que está lá,
 * legível, na folha.
 */
const CABECALHO_DO_TOTAL = /(?:Valor|Total)\s+(?:a\s+)?Pagar/i;

/** Um valor em dinheiro sozinho na célula: "R$ 361,29" ou "361,29". */
const SO_DINHEIRO = /^R?\$?\s*-?[\d.]+,\d{2}$/;

/**
 * Quantas linhas abaixo do cabeçalho ainda vale procurar o número.
 *
 * O valor costuma estar na linha imediatamente seguinte, mas há layout que
 * intercala uma linha de traços ou de código de barras. Três é o bastante para
 * atravessar isso sem começar a pescar número de outra seção.
 */
const ALCANCE_ABAIXO = 3;

/**
 * O valor impresso embaixo de um cabeçalho de coluna.
 *
 * Duas células estão na mesma coluna quando seus intervalos horizontais se
 * cruzam. Comparar só o `x` inicial não serve: número é alinhado à direita e
 * rótulo à esquerda, então os dois começam em pontos bem diferentes mesmo
 * estando na mesma coluna.
 */
function valorAbaixoDe(linhas: readonly LinhaImpressa[], indice: number): number | null {
  const cabecalho = linhas[indice];
  if (!cabecalho) return null;

  // O rótulo é localizado no texto da linha, não numa célula: no PDF ele chega
  // inteiro em um pedaço, mas o OCR devolve `Valor`, `a` e `Pagar` separados.
  const casada = CABECALHO_DO_TOTAL.exec(cabecalho.texto);
  if (casada?.index === undefined) return null;

  const faixa = faixaDoTrecho(cabecalho, casada.index, casada.index + casada[0].length);
  if (!faixa) return null;

  for (let i = indice + 1; i <= indice + ALCANCE_ABAIXO && i < linhas.length; i += 1) {
    const abaixo = linhas[i];
    if (!abaixo) continue;

    for (const candidata of abaixo.celulas) {
      const cruzaColuna = candidata.x < faixa.x1 && candidata.x + candidata.largura > faixa.x0;
      if (cruzaColuna && SO_DINHEIRO.test(candidata.texto.trim())) {
        return numero(candidata.texto);
      }
    }
  }

  return null;
}

/**
 * O cabeçalho e o valor caem na mesma célula.
 *
 * Acontece quando a distribuidora imprime "Valor a Pagar R$ 361,29" corrido em
 * vez de em coluna. Vale tentar antes de desistir.
 */
const TOTAL_NA_LINHA = /(?:Valor|Total)\s+(?:a\s+)?Pagar\D{0,8}(-?[\d.]+,\d{2})/i;

export function lerCamposExtras(paginas: readonly PaginaDoDocumento[]): CamposExtras {
  const linhas = paginas.flatMap((pagina) => montarLinhas(pagina));

  const extras: CamposExtras = {
    demandaContratadaKw: null,
    demandaContratadaPontaKw: null,
    demandaContratadaForaPontaKw: null,
    valorTotal: null,
  };

  for (const [indice, linha] of linhas.entries()) {
    // Fora ponta primeiro: "D. Ctda F.Pta" também casa o padrão de ponta, e
    // deixar a ordem ao acaso trocaria os dois valores em silêncio.
    const foraPonta = CONTRATADA_FORA_PONTA.exec(linha.texto);
    if (foraPonta?.[1] && extras.demandaContratadaForaPontaKw === null) {
      extras.demandaContratadaForaPontaKw = numero(foraPonta[1]);
    }

    const semForaPonta = linha.texto.replace(CONTRATADA_FORA_PONTA, "");
    const ponta = CONTRATADA_PONTA.exec(semForaPonta);
    if (ponta?.[1] && extras.demandaContratadaPontaKw === null) {
      extras.demandaContratadaPontaKw = numero(ponta[1]);
    }

    const unica = CONTRATADA_UNICA.exec(linha.texto);
    if (unica?.[1] && extras.demandaContratadaKw === null) {
      extras.demandaContratadaKw = numero(unica[1]);
    }

    if (extras.valorTotal === null && CABECALHO_DO_TOTAL.test(linha.texto)) {
      extras.valorTotal = TOTAL_NA_LINHA.exec(linha.texto)?.[1]
        ? numero(TOTAL_NA_LINHA.exec(linha.texto)?.[1] ?? "")
        : valorAbaixoDe(linhas, indice);
    }
  }

  return extras;
}
