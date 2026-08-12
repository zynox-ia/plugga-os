/** A parte pura da passagem FormData -> premissas do estudo. */

export const ERRO_HSP_MENSAL =
  "informe exatamente 12 valores positivos de HSP mensal antes de abrir o estudo";

export function seriePositiva(valor: FormDataEntryValue | null): number[] {
  return String(valor ?? "")
    .split(/[,;\s]+/)
    .map((parte) => Number(parte))
    .filter((numero) => Number.isFinite(numero) && numero > 0);
}

export function premissasDaFicha(formData: FormData): {
  ok: true;
  demandaComplementoValor: number | null;
  hspMensal: number[];
} | {
  ok: false;
  erro: string;
} {
  const bruto = String(formData.get("demandaComplementoValor") ?? "").trim();
  const complemento = bruto ? Number(bruto) : null;
  const hsp = seriePositiva(formData.get("hspMensal"));

  if (hsp.length !== 12) return { ok: false, erro: ERRO_HSP_MENSAL };

  return {
    ok: true,
    demandaComplementoValor:
      complemento !== null && Number.isFinite(complemento) ? complemento : null,
    hspMensal: hsp,
  };
}
