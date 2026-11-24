import { EstadoInvalido, RequisicaoInvalida } from "../common/errors/dominio";

export function exigeRodadaAberta(version: number, expectedVersion: number, endedAt: Date | null): void {
  if (version !== expectedVersion || endedAt !== null) throw new EstadoInvalido("A atividade mudou ou foi encerrada. Recarregue antes de continuar.");
}

export function validarAgenda(startsAt: Date, dueAt: Date): void {
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(dueAt.getTime()) || dueAt < startsAt) {
    throw new RequisicaoInvalida("Confira o horário da atividade.", [{ campo: "dueAt", problema: "o fim não pode ser anterior ao início" }]);
  }
}

/** Só janelas de consulta: não calcula SLA nem feriados. Manaus usa UTC-4. */
export function janelaManaus(now: Date): { today: Date; tomorrow: Date; afterNext7: Date } {
  const civil = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Manaus", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const today = new Date(`${civil}T00:00:00-04:00`);
  return { today, tomorrow: new Date(today.getTime() + 86_400_000), afterNext7: new Date(today.getTime() + 8 * 86_400_000) };
}
