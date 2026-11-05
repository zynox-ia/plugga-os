/** Velocidade em px/s; permite atravessar um pouco a borda sem perder a rolagem. */
export function velocidadeNaBorda(ponteiro: number, inicio: number, fim: number): number {
  if (ponteiro < inicio - 64 || ponteiro > fim + 64) return 0;
  const margem = Math.min(64, (fim - inicio) / 3);
  if (ponteiro < inicio + margem) return -720 * Math.min(1, (inicio + margem - ponteiro) / margem);
  if (ponteiro > fim - margem) return 720 * Math.min(1, (ponteiro - fim + margem) / margem);
  return 0;
}

/** A ordem fica na mesma lista dos dados; a releitura do servidor continua sendo canônica. */
export function moverCartao<T extends { id: string; stageId: string; stageEnteredAt: string }>(
  cartoes: readonly T[], id: string, etapaId: string, antesDeId: string | null | undefined, entrouEm: string,
): T[] {
  const negocio = cartoes.find((n) => n.id === id);
  if (!negocio) return [...cartoes];
  const restantes = cartoes.filter((n) => n.id !== id);
  const referencia = antesDeId === undefined ? restantes.find((n) => n.stageId === etapaId)?.id : antesDeId;
  const indice = restantes.findIndex((n) => n.id === referencia && n.stageId === etapaId);
  restantes.splice(indice < 0 ? restantes.length : indice, 0, {
    ...negocio, stageId: etapaId, stageEnteredAt: negocio.stageId === etapaId ? negocio.stageEnteredAt : entrouEm,
  });
  return restantes;
}
