/** Fuso em que "hoje" é contado para previsões e revisitas (o mesmo da web, em lib/format.ts). */
const FUSO_DA_OPERACAO = "America/Manaus";

/** Data de hoje no fuso da operação, "AAAA-MM-DD". */
export function hojeNoFuso(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO_DA_OPERACAO, year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);
}

/**
 * Perder exige motivo do pipeline; se o motivo pede, exige a data de revisita,
 * que não pode estar no passado. Devolve o problema, ou null.
 */
export function problemaDaPerda(
  motivo: { asksRevisitDate: boolean } | null,
  revisitOn: string | null | undefined,
  hoje: string,
): { campo: string; problema: string } | null {
  if (!motivo) return { campo: "lossReasonId", problema: "escolha um motivo de perda deste pipeline" };
  if (motivo.asksRevisitDate && !revisitOn) return { campo: "revisitOn", problema: "este motivo pede a data para revisitar" };
  if (revisitOn && revisitOn < hoje) return { campo: "revisitOn", problema: "a data de revisita não pode estar no passado" };
  return null;
}

/** Ids pedidos que não estão entre os permitidos (etiquetas do pipeline, UCs do cliente...). */
export const foraDe = (pedidos: readonly string[], permitidos: readonly string[]): string[] => pedidos.filter((id) => !permitidos.includes(id));
