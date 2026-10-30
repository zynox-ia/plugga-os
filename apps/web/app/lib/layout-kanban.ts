export const ESPACO_COLUNAS_KANBAN = 16;
const LARGURA_MINIMA = 336;
const LARGURA_MAXIMA = 672;

/** Distribui apenas etapas inteiras; telas estreitas podem ficar abaixo do mínimo. */
export function calcularLayoutKanban(larguraDisponivel: number, totalEtapas: number) {
  const visiveis = Math.max(1, Math.min(totalEtapas, Math.floor(
    (larguraDisponivel + ESPACO_COLUNAS_KANBAN) / (LARGURA_MINIMA + ESPACO_COLUNAS_KANBAN),
  )));
  const espacos = (visiveis - 1) * ESPACO_COLUNAS_KANBAN;
  const larguraColuna = Math.min(LARGURA_MAXIMA, (larguraDisponivel - espacos) / visiveis);
  return { larguraColuna, larguraQuadro: visiveis * larguraColuna + espacos };
}
