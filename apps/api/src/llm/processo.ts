/**
 * Quem gasta a chave.
 *
 * Lista fechada de propósito. O pedido era saber qual processo consome mais, e
 * isso só se responde se todo consumo tiver dono — um campo de texto livre vira,
 * na terceira funcionalidade, `fatura`, `faturas` e `leitura-fatura` somando
 * separado, e o relatório passa a mentir sem ninguém perceber.
 *
 * Acrescentar processo aqui é uma linha. É de propósito que seja um passo
 * consciente: funcionalidade nova que gasta dinheiro deve aparecer no relatório
 * desde a primeira chamada, não quando alguém estranhar a fatura do mês.
 */
export const PROCESSOS = {
  /** Leitura de fatura de energia por modelo de visão. */
  FATURA_VISAO: "fatura.visao",
} as const;

export type ProcessoLlm = (typeof PROCESSOS)[keyof typeof PROCESSOS];

/** Rótulo humano para a tela de consumo. */
export const NOME_DO_PROCESSO: Record<ProcessoLlm, string> = {
  "fatura.visao": "Leitura de fatura por visão",
};

export function ehProcessoConhecido(valor: string): valor is ProcessoLlm {
  return Object.values(PROCESSOS).includes(valor as ProcessoLlm);
}
