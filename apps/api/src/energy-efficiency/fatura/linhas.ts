import type { Fragmento, PaginaDoDocumento } from "./paginas.js";

/**
 * Duas leituras da mesma página: a ordem do fluxo e a linha impressa.
 *
 * Elas não são intercambiáveis, e é por isso que as duas existem.
 *
 * **Ordem do fluxo** é a sequência em que o PDF manda desenhar os pedaços. É o
 * que o leitor de itens sempre consumiu: a distribuidora imprime descrição,
 * tarifa e valor em colunas, e no fluxo elas saem como três desenhos seguidos.
 * `lerItens` aprendeu a casar exatamente esse formato, contra faturas reais.
 *
 * **Linha impressa** é o que uma pessoa enxerga na folha: tudo que está na
 * mesma altura, da esquerda para a direita. É a única forma de ler dado que só
 * existe na relação entre colunas — `D. Ctda Pta: 270` fica a meia folha de
 * distância do seu rótulo no fluxo, e no papel está colado nele.
 *
 * Trocar a primeira pela segunda quebraria o leitor de itens; ter só a primeira
 * é o que fazia o sistema pedir a demanda contratada à mão todo mês. Ficam as
 * duas, cada uma para quem precisa dela.
 */

export type LinhaImpressa = {
  /** Altura na folha; maior é mais acima. */
  y: number;
  celulas: Fragmento[];
  texto: string;
  /**
   * Onde cada célula começa dentro de `texto`; tem o mesmo tamanho de
   * `celulas`.
   *
   * Serve para voltar do texto à folha: quem casa uma expressão em `texto`
   * descobre por aqui em que faixa horizontal o trecho foi impresso. Sem isso,
   * procurar um rótulo de coluna só funciona quando ele chega inteiro num
   * pedaço só — o que é verdade no PDF e é falso no OCR, que devolve palavra
   * por palavra. `Valor a Pagar` virava três células e não casava com nada.
   */
  inicios: number[];
};

/**
 * Distância vertical que ainda conta como a mesma linha, em fração da altura da
 * fonte. Subscrito e sobrescrito variam pouco; linha nova varia bem mais.
 */
const TOLERANCIA_VERTICAL = 0.5;

/**
 * Espaço horizontal, em fração da altura da fonte, a partir do qual dois
 * pedaços viram palavras separadas.
 *
 * Existe porque há PDF que desenha letra por letra, posicionando cada uma. Sem
 * a medida do vão, juntar com espaço produziria `C o n s u m o` e juntar sem
 * espaço produziria `ConsumoPonta84kWh`. O vão distingue os dois casos, que é o
 * que o olho faz ao ler.
 */
const VAO_DE_PALAVRA = 0.25;

/** Altura de fonte suposta quando o PDF não declara nenhuma. */
const ALTURA_PADRAO = 10;

function juntar(celulas: readonly Fragmento[]): { texto: string; inicios: number[] } {
  let texto = "";
  const inicios: number[] = [];
  let fimAnterior: number | null = null;
  let alturaAnterior = ALTURA_PADRAO;

  for (const celula of celulas) {
    const altura = celula.altura || alturaAnterior || ALTURA_PADRAO;
    const vao = fimAnterior === null ? 0 : celula.x - fimAnterior;

    if (fimAnterior !== null && vao > altura * VAO_DE_PALAVRA && !texto.endsWith(" ")) {
      texto += " ";
    }

    inicios.push(texto.length);
    texto += celula.texto;
    fimAnterior = celula.x + celula.largura;
    alturaAnterior = altura;
  }

  return { texto, inicios };
}

/**
 * A faixa horizontal em que um trecho do texto foi impresso.
 *
 * É o caminho de volta: uma expressão casa em `linha.texto` e devolve posições
 * de caractere; aqui elas viram `x` de início e de fim na folha. É o que
 * permite procurar o que está **embaixo** de um rótulo de coluna.
 */
export function faixaDoTrecho(
  linha: LinhaImpressa,
  inicio: number,
  fim: number,
): { x0: number; x1: number } | null {
  let x0 = Infinity;
  let x1 = -Infinity;

  for (const [indice, celula] of linha.celulas.entries()) {
    const comecaEm = linha.inicios[indice] ?? 0;
    const terminaEm = comecaEm + celula.texto.length;

    // Basta encostar no trecho: uma célula parcialmente coberta ainda diz onde
    // o rótulo está.
    if (terminaEm <= inicio || comecaEm >= fim) continue;

    x0 = Math.min(x0, celula.x);
    x1 = Math.max(x1, celula.x + celula.largura);
  }

  return x0 === Infinity ? null : { x0, x1 };
}

/** Reagrupa os pedaços da página nas linhas em que foram impressos. */
export function montarLinhas(pagina: PaginaDoDocumento): LinhaImpressa[] {
  const grupos: { y: number; celulas: Fragmento[] }[] = [];

  for (const fragmento of pagina.fragmentos) {
    const tolerancia = (fragmento.altura || ALTURA_PADRAO) * TOLERANCIA_VERTICAL;
    const grupo = grupos.find((candidato) => Math.abs(candidato.y - fragmento.y) <= tolerancia);

    if (grupo) grupo.celulas.push(fragmento);
    else grupos.push({ y: fragmento.y, celulas: [fragmento] });
  }

  return grupos
    .sort((a, b) => b.y - a.y)
    .map(({ y, celulas }) => {
      const ordenadas = [...celulas].sort((a, b) => a.x - b.x);
      return { y, celulas: ordenadas, ...juntar(ordenadas) };
    })
    // O descarte olha o texto sem espaço, mas o texto guardado fica como foi
    // montado: aparar aqui deslocaria os `inicios` e `faixaDoTrecho` passaria a
    // apontar para a célula errada. Quem lê o texto apara por conta própria.
    .filter((linha) => linha.texto.trim().length > 0);
}

/**
 * A página inteira em linhas impressas, na ordem de leitura.
 */
export function linhasImpressas(paginas: readonly PaginaDoDocumento[]): string[] {
  return paginas.flatMap((pagina) => montarLinhas(pagina).map((linha) => linha.texto));
}

/**
 * Os pedaços na ordem em que o PDF os desenhou, um por linha.
 *
 * É a entrada de `lerItens` e `identificar`. Preserva o comportamento que essas
 * duas funções foram construídas para casar, incluindo o caso de a tarifa e o
 * valor caírem em desenhos separados logo depois da descrição.
 */
export function fragmentosEmOrdem(paginas: readonly PaginaDoDocumento[]): string[] {
  return paginas
    .flatMap((pagina) => pagina.fragmentos.map((fragmento) => fragmento.texto.trim()))
    .filter((texto) => texto.length > 0);
}

/**
 * Largura mínima de um corredor vertical vazio para valer como divisa de
 * coluna, em pontos.
 *
 * Abaixo disso é espaço entre palavras ou entre células da mesma tabela; acima,
 * é o branco que o olho lê como "outro bloco".
 */
const CORREDOR_MINIMO = 12;

/**
 * Altura da vizinhança, em pontos, usada para achar as divisas de coluna de uma
 * linha.
 *
 * Medir na página inteira não serve: basta um cabeçalho ou um rodapé atravessar
 * a folha para o corredor sumir — e some mesmo. Nesta fatura a página inteira
 * não tem nenhuma divisa interna, enquanto a faixa da tabela de itens tem duas.
 * Coluna é um fato local, e é assim que ela é medida.
 */
const BANDA_DA_VIZINHANCA = 18;

/**
 * As faixas horizontais com tinta numa banda da página, separadas por
 * corredores vazios largos o bastante para serem divisa de coluna.
 */
function colunasDa(
  pagina: PaginaDoDocumento,
  centro?: number,
): { x0: number; x1: number }[] {
  const largura = Math.ceil(pagina.largura);
  if (largura <= 0) return [];

  const naBanda =
    centro === undefined
      ? pagina.fragmentos
      : pagina.fragmentos.filter(
          (fragmento) => Math.abs(fragmento.y - centro) <= BANDA_DA_VIZINHANCA,
        );

  const comTinta = new Uint8Array(largura);
  for (const fragmento of naBanda) {
    const de = Math.max(0, Math.floor(fragmento.x));
    const ate = Math.min(largura, Math.ceil(fragmento.x + fragmento.largura));
    for (let x = de; x < ate; x += 1) comTinta[x] = 1;
  }

  const colunas: { x0: number; x1: number }[] = [];
  let inicio: number | null = null;
  let vazioDesde: number | null = null;

  for (let x = 0; x <= largura; x += 1) {
    const tinta = x < largura && comTinta[x] === 1;
    if (tinta) {
      if (inicio === null) inicio = x;
      vazioDesde = null;
      continue;
    }
    if (vazioDesde === null) vazioDesde = x;
    const corredor = x - vazioDesde;
    if (inicio !== null && corredor >= CORREDOR_MINIMO) {
      colunas.push({ x0: inicio, x1: vazioDesde });
      inicio = null;
    }
  }
  if (inicio !== null) colunas.push({ x0: inicio, x1: largura });

  return colunas;
}

/**
 * A página em linhas impressas, mas cortada nas divisas de coluna.
 *
 * Existe porque fatura de duas colunas cola blocos que não têm nada a ver um
 * com o outro. Na Roraima Energia, `Consumo Ponta 17.419 kWh a 2.689175` sai
 * grudado em `GRUPO A A4 COMERCIAL COMERCIAL`, que é o cabeçalho da unidade
 * impresso na mesma altura, meia folha à esquerda. O leitor de itens não tem
 * como reconhecer o item nesse amontoado — e não deve mesmo.
 *
 * Não substitui `linhasImpressas`: quem lê demanda contratada precisa
 * justamente do rótulo de uma coluna com o valor de outra. As duas leituras
 * convivem, e quem decide qual valeu é a aritmética da fatura.
 */
export function linhasPorColuna(paginas: readonly PaginaDoDocumento[]): string[] {
  return paginas.flatMap((pagina) => {
    return montarLinhas(pagina).flatMap((linha) => {
      const colunas = colunasDa(pagina, linha.y);
      if (colunas.length <= 1) return [linha.texto];

      return colunas
        .map((coluna) => {
          const dentro = linha.celulas.filter(
            (celula) => celula.x + celula.largura > coluna.x0 && celula.x < coluna.x1,
          );
          return dentro.length === 0 ? "" : juntar(dentro).texto;
        })
        .filter((texto) => texto.trim().length > 0);
    });
  });
}
