/** Velocidade em px/s; permite atravessar um pouco a borda sem perder a rolagem. */
export function velocidadeNaBorda(ponteiro: number, inicio: number, fim: number): number {
  if (ponteiro < inicio - 64 || ponteiro > fim + 64) return 0;
  const margem = Math.min(64, (fim - inicio) / 3);
  if (ponteiro < inicio + margem) return -720 * Math.min(1, (inicio + margem - ponteiro) / margem);
  if (ponteiro > fim - margem) return 720 * Math.min(1, (ponteiro - fim + margem) / margem);
  return 0;
}

/** Ordem apenas desta visualização. A etapa e os cartões existentes vêm dos dados reais. */
export function ordenarCartoes<T extends { id: string }>(cartoes: T[], ordem?: string[]): T[] {
  if (!ordem) return cartoes;
  const posicoes = new Map(ordem.map((id, indice) => [id, indice]));
  return [...cartoes].sort((a, b) => (posicoes.get(a.id) ?? -1) - (posicoes.get(b.id) ?? -1));
}
