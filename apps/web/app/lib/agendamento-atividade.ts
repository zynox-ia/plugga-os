import type { Activity, ActivityRound, CreateActivityRequest, UpdateActivityRequest } from "@plugga/shared";
import { parseDate } from "../components/ui/date-value.ts";
import { FUSO_HORARIO } from "./format.ts";

export type DadosAgendamento = Omit<CreateActivityRequest, "requestId" | "target">;

/** O agendamento é digitado no fuso da operação, independentemente do navegador. */
export function instanteEmManaus(valor: string): string | null {
  const partes = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)$/.exec(valor);
  if (!partes || !parseDate(partes[1]!)) return null;
  return new Date(`${valor}:00-04:00`).toISOString();
}

export function horarioDeManaus(instante: string): string {
  const data = new Date(instante);
  if (Number.isNaN(data.getTime())) return "";
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO_HORARIO, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(data);
  const valor = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((parte) => parte.type === tipo)!.value;
  return `${valor("year")}-${valor("month")}-${valor("day")}T${valor("hour")}:${valor("minute")}`;
}

export function validarHorarioDaAtividade(inicio: string, fim: string): Partial<Record<"startsAt" | "dueAt", string>> {
  const erros: Partial<Record<"startsAt" | "dueAt", string>> = {};
  const startsAt = instanteEmManaus(inicio);
  const dueAt = fim ? instanteEmManaus(fim) : startsAt;
  if (!startsAt) erros.startsAt = "Informe uma data e hora válidas.";
  if (fim && !dueAt) erros.dueAt = "Informe um prazo válido.";
  else if (startsAt && dueAt && dueAt < startsAt) erros.dueAt = "O prazo não pode ser anterior ao início.";
  return erros;
}

export function alteracoesDoAgendamento(atividade: Pick<Activity, "title" | "notes" | "priority" | "origin"> & {
  currentRound: Pick<ActivityRound, "ownerId" | "startsAt" | "dueAt">;
}, dados: DadosAgendamento): Omit<UpdateActivityRequest, "version"> {
  const patch: Omit<UpdateActivityRequest, "version"> = {};
  for (const campo of ["title", "notes", "priority"] as const) {
    if (dados[campo] !== atividade[campo]) Object.assign(patch, { [campo]: dados[campo] });
  }
  if (atividade.origin !== "process") {
    if (dados.ownerId !== atividade.currentRound.ownerId) patch.ownerId = dados.ownerId;
    for (const campo of ["startsAt", "dueAt"] as const) {
      if (horarioDeManaus(dados[campo]) !== horarioDeManaus(atividade.currentRound[campo])) patch[campo] = dados[campo];
    }
  }
  return patch;
}
