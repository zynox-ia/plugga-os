/** Passo "redondo" do eixo (1, 2, 2,5 ou 5 × 10ⁿ) para `divisoes` divisões acima de zero que cubram o máximo. */
export function passoDoEixo(maximo: number, divisoes = 4): number {
  if (!(maximo > 0)) return 1;
  const bruto = maximo / divisoes;
  const base = 10 ** Math.floor(Math.log10(bruto));
  return [1, 2, 2.5, 5, 10].map((m) => m * base).find((p) => p >= bruto - 1e-9) ?? 10 * base;
}
