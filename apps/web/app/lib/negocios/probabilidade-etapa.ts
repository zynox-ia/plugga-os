/** Probabilidade estimada linearmente pela posição da etapa no funil. */
export function calcularProbabilidadeEtapa(indiceEtapa: number, totalEtapas: number): number {
  if (totalEtapas <= 0 || indiceEtapa < 0) return 0;
  return Math.min(1, (indiceEtapa + 1) / (totalEtapas + 1));
}

export function calcularValorPonderado(valor: number, indiceEtapa: number, totalEtapas: number): number {
  return valor * calcularProbabilidadeEtapa(indiceEtapa, totalEtapas);
}
