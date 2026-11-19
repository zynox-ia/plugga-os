export const ESPACO_COLUNAS_KANBAN = 16;
const LARGURA_MINIMA = 232;
const LARGURA_MAXIMA = 264;
/** Com uma coluna só (celular), o cartão mantém a largura confortável de antes. */
const LARGURA_MAXIMA_COLUNA_UNICA = 320;

/** Distribui apenas etapas inteiras; telas estreitas podem ficar abaixo do mínimo. */
export function calcularLayoutKanban(larguraDisponivel: number, totalEtapas: number) {
  const visiveis = Math.max(1, Math.min(totalEtapas, Math.floor(
    (larguraDisponivel + ESPACO_COLUNAS_KANBAN) / (LARGURA_MINIMA + ESPACO_COLUNAS_KANBAN),
  )));
  const espacos = (visiveis - 1) * ESPACO_COLUNAS_KANBAN;
  const teto = visiveis === 1 ? LARGURA_MAXIMA_COLUNA_UNICA : LARGURA_MAXIMA;
  const larguraColuna = Math.min(teto, (larguraDisponivel - espacos) / visiveis);
  return { larguraColuna, larguraQuadro: visiveis * larguraColuna + espacos };
}
