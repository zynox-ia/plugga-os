import { arredondar } from "./aritmetica.js";

/**
 * Geometria dos cinco gráficos do modelo — port da seção de SVGs de
 * `montar_caso_relatorio.py`.
 *
 * Os SVGs não são redesenhados: cada barra do modelo é encontrada pelo seu
 * `<rect>` literal e tem apenas `y` e `height` reescritos, com o rótulo
 * acompanhando. É a mesma disciplina do resto do gerador — o desenho aprovado
 * continua sendo o desenho aprovado, só a altura muda.
 */

/** Altura útil e base do plot nos três primeiros gráficos. */
export const BASE_DO_PLOT = 183.0;
export const ALTURA_DO_PLOT = 159.0;

export type Barra = {
  /** O `<rect>` exatamente como está no modelo. */
  rect: string;
  altura: number;
  y: number;
  rotuloAntigo: string | null;
  rotuloNovo: string;
};

export class GeometriaInvalidaError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "GeometriaInvalidaError";
  }
}

function trocarAtributo(rect: string, atributo: string, valor: string): string {
  const padrao = new RegExp(`${atributo}="[0-9.\\-]+"`);
  if (!padrao.test(rect)) {
    throw new GeometriaInvalidaError(`rect sem ${atributo}: ${rect.slice(0, 60)}`);
  }
  return rect.replace(padrao, `${atributo}="${valor}"`);
}

export function alturaDaBarra(valor: number, eixo: number): number {
  return valor ? arredondar((valor / eixo) * ALTURA_DO_PLOT, 1) : 0.0;
}

export function yDaBarra(valor: number, eixo: number): number {
  return valor ? arredondar(BASE_DO_PLOT - (valor / eixo) * ALTURA_DO_PLOT, 1) : BASE_DO_PLOT;
}

/**
 * Reescreve as barras de um SVG, com os ticks do eixo e os percentuais.
 * Rótulo ambíguo ou barra não encontrada é erro — nunca chute.
 */
export function reescreverBarras(
  svg: string,
  barras: readonly Barra[],
  ticksAntigos: readonly string[] = [],
  ticksNovos: readonly string[] = [],
  percentuais: readonly (readonly [string, string])[] = [],
): string {
  let saida = svg;

  for (const [indice, antigo] of ticksAntigos.entries()) {
    const chave = `">${antigo}</text>`;
    if (saida.split(chave).length - 1 !== 1) {
      throw new GeometriaInvalidaError(`tick ambíguo: ${antigo}`);
    }
    saida = saida.replace(chave, `">${ticksNovos[indice]}</text>`);
  }

  for (const barra of barras) {
    if (!saida.includes(barra.rect)) {
      throw new GeometriaInvalidaError(`rect não achado: ${barra.rect.slice(0, 60)}`);
    }
    let novo = trocarAtributo(barra.rect, "y", barra.y.toFixed(1));
    novo = trocarAtributo(novo, "height", barra.altura.toFixed(1));
    saida = saida.replace(barra.rect, novo);

    if (barra.rotuloAntigo !== null) {
      const doRotulo = new RegExp(
        `(<text x="[0-9.]+" y=")([0-9.]+)("[^>]*>)${barra.rotuloAntigo.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&",
        )}(</text>)`,
      ).exec(saida);
      if (!doRotulo) {
        throw new GeometriaInvalidaError(`label não achado: ${barra.rotuloAntigo}`);
      }
      saida = saida.replace(
        doRotulo[0],
        `${doRotulo[1]}${(barra.y - 5).toFixed(1)}${doRotulo[3]}${barra.rotuloNovo}${doRotulo[4]}`,
      );
    }
  }

  for (const [antigo, novo] of percentuais) {
    saida = saida.split(`>${antigo}<`).join(`>${novo}<`);
  }

  return saida;
}

/** Os `<rect>` de barra fina usados nos dois gráficos de 20 anos. */
export function rectsDeSerie(svg: string): string[] {
  return (
    svg.match(
      /<rect x="[0-9.]+" y="[0-9.]+" width="[0-9.]+" height="[0-9.]+" rx="3" fill="[^"]+"\/>/g,
    ) ?? []
  );
}

/** Economia anual: barras crescendo a partir da base em 272. */
export function reescreverSerieAnual(svg: string, valores: readonly number[], eixo: number): string {
  let saida = svg;

  for (const [indice, antigo] of rectsDeSerie(svg).entries()) {
    const altura = arredondar((valores[indice]! / eixo) * 246.0, 1);
    let novo = trocarAtributo(antigo, "y", (272.0 - altura).toFixed(1));
    novo = trocarAtributo(novo, "height", altura.toFixed(1));
    saida = saida.replace(antigo, novo);
  }

  return saida;
}

/**
 * Fluxo acumulado: barras que descem do zero enquanto o acumulado é negativo e
 * sobem depois, trocando de cor no meio do caminho. A altura mínima de 2px
 * existe para a barra do ponto de virada não sumir.
 */
export function reescreverSerieAcumulada(
  svg: string,
  acumulado: readonly number[],
  eixo: number,
): string {
  const rects = rectsDeSerie(svg);
  const corNegativa = /fill="([^"]+)"/.exec(rects[0]!)![1]!;
  const corPositiva = /fill="([^"]+)"/.exec(rects[rects.length - 1]!)![1]!;
  let saida = svg;

  for (const [indice, antigo] of rects.entries()) {
    const valor = acumulado[indice]!;
    const altura = (Math.abs(valor) / eixo) * 123.0;
    const y = valor < 0 ? 149.0 : arredondar(149.0 - altura, 1);

    let novo = trocarAtributo(antigo, "y", y.toFixed(1));
    novo = trocarAtributo(novo, "height", arredondar(Math.max(altura, 2.0), 1).toFixed(1));
    novo = novo.replace(/fill="[^"]+"/, `fill="${valor < 0 ? corNegativa : corPositiva}"`);
    saida = saida.replace(antigo, novo);
  }

  return saida;
}
