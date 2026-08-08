import { dinheiro } from "./formato.js";

/**
 * Gráficos em SVG inline, usando as classes CSS do envelope congelado
 * (`chart-svg`, `axis`, `value`). SVG e não imagem porque o documento precisa
 * virar PDF sem depender de rede nem de arquivo externo — e porque texto em SVG
 * continua selecionável e nítido em qualquer zoom.
 *
 * Hierarquia definida no checklist: gráfico pequeno para composição e
 * comparação; gráfico grande só para economia anual, economia acumulada e fluxo
 * de caixa. Os três grandes são obrigatórios e a validação bloqueia sem eles.
 */

const PALETA = {
  petroleo: "#0f5740",
  folha: "#1faa7e",
  ambar: "#f59e0b",
  azul: "#2563eb",
  roxo: "#7c3aed",
  vermelho: "#dc2626",
  linha: "#e3ece8",
  zero: "#c7d8d1",
} as const;

/** Barras verticais em plano cartesiano — o padrão pedido no modelo. */
export function barras(
  rotulos: readonly string[],
  valores: readonly number[],
  cores: readonly string[],
  opcoes: { largura?: number; altura?: number; mostrarValores?: boolean } = {},
): string {
  const largura = opcoes.largura ?? 480;
  const altura = opcoes.altura ?? 230;
  const mostrarValores = opcoes.mostrarValores ?? true;

  const esquerda = 58;
  const base = altura - 46;
  const topo = 30;
  const passo = (largura - esquerda - 24) / Math.max(valores.length, 1);
  const barra = Math.min(42, passo * 0.45);
  const maximo = Math.max(...valores, 1);

  const partes = [
    `<svg class="chart-svg" viewBox="0 0 ${largura} ${altura}" role="img">`,
    `<line stroke="${PALETA.linha}" x1="${esquerda}" x2="${largura - 18}" y1="${base}" y2="${base}"/>`,
    `<line stroke="${PALETA.linha}" x1="${esquerda}" x2="${esquerda}" y1="${topo}" y2="${base}"/>`,
  ];

  valores.forEach((valor, i) => {
    const x = esquerda + 14 + i * passo;
    const alturaBarra = (Math.max(valor, 0) / maximo) * (base - topo);
    const y = base - alturaBarra;
    const cor = cores[i] ?? PALETA.folha;

    partes.push(
      `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barra.toFixed(1)}" height="${alturaBarra.toFixed(1)}" rx="7" fill="${cor}"/>`,
    );
    if (mostrarValores) {
      partes.push(
        `<text x="${(x + barra / 2).toFixed(1)}" y="${(y - 7).toFixed(1)}" text-anchor="middle" class="value">${dinheiro(valor)}</text>`,
      );
    }
    partes.push(
      `<text x="${(x + barra / 2).toFixed(1)}" y="${base + 20}" text-anchor="middle" class="axis">${rotulos[i] ?? ""}</text>`,
    );
  });

  partes.push(`<text x="${esquerda}" y="20" class="axis">Eixo Y: valor (R$)</text></svg>`);
  return partes.join("");
}

/**
 * Linha ao longo do horizonte. O eixo inclui o zero de propósito no fluxo de
 * caixa: é o cruzamento com o zero que mostra o payback, e uma escala que
 * começasse no mínimo esconderia justamente isso.
 */
export function linha(
  valores: readonly number[],
  tituloEixoY: string,
  opcoes: { incluirZero?: boolean; rotulos?: readonly string[] } = {},
): string {
  const largura = 920;
  const altura = 330;
  const esquerda = 88;
  const direita = 898;
  const topo = 42;
  const base = 268;

  const incluirZero = opcoes.incluirZero ?? true;
  let minimo = Math.min(...valores);
  let maximo = Math.max(...valores);
  if (incluirZero) {
    minimo = Math.min(0, minimo);
    maximo = Math.max(0, maximo);
  }
  const folga = (maximo - minimo) * 0.08 || 1;
  minimo -= folga;
  maximo += folga;

  const posicao = (i: number, valor: number): [number, number] => {
    const x = esquerda + i * ((direita - esquerda) / Math.max(valores.length - 1, 1));
    const y = base - ((valor - minimo) / (maximo - minimo)) * (base - topo);
    return [x, y];
  };

  const pontos = valores.map((valor, i) => posicao(i, valor));
  const yZero = base - ((0 - minimo) / (maximo - minimo)) * (base - topo);

  const partes = [
    `<svg class="chart-svg" viewBox="0 0 ${largura} ${altura}" role="img">`,
    `<line stroke="${PALETA.linha}" x1="${esquerda}" x2="${direita}" y1="${base}" y2="${base}"/>`,
    `<line stroke="${PALETA.linha}" x1="${esquerda}" x2="${esquerda}" y1="${topo}" y2="${base}"/>`,
  ];

  if (incluirZero && minimo < 0) {
    partes.push(
      `<line stroke="${PALETA.zero}" stroke-dasharray="4 4" x1="${esquerda}" x2="${direita}" y1="${yZero.toFixed(1)}" y2="${yZero.toFixed(1)}"/>`,
    );
  }

  partes.push(
    `<polyline points="${pontos.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")}" fill="none" stroke="${PALETA.folha}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
  );

  // Rotula só as extremidades e de 5 em 5: rotular 20 pontos numa largura de
  // 920 px sobrepõe os textos e o gráfico fica ilegível no PDF.
  pontos.forEach(([x, y], i) => {
    if (i !== 0 && i !== pontos.length - 1 && i % 5 !== 0) return;
    partes.push(
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="${PALETA.petroleo}"/>`,
      `<text x="${x.toFixed(1)}" y="${(y - 10).toFixed(1)}" text-anchor="middle" class="value">${dinheiro(valores[i] ?? 0)}</text>`,
      `<text x="${x.toFixed(1)}" y="${base + 22}" text-anchor="middle" class="axis">${opcoes.rotulos?.[i] ?? String(i + 1)}</text>`,
    );
  });

  partes.push(
    `<text x="${esquerda}" y="24" class="axis">Eixo Y: ${tituloEixoY} • Eixo X: tempo (anos)</text></svg>`,
  );
  return partes.join("");
}

export const CORES = PALETA;
