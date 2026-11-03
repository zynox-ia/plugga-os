import type { DealHistoryEntry } from "@plugga/shared";
import { formatarData, FUSO_HORARIO } from "./format.ts";

const diaMes = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", timeZone: FUSO_HORARIO });
const diaCompleto = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: FUSO_HORARIO });
const hora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: FUSO_HORARIO });

export function formatarHoraHistorico(data: string): string {
  return hora.format(new Date(data));
}

export function agruparHistoricoPorDia(entradas: DealHistoryEntry[], agora = new Date()) {
  const hoje = formatarData(agora);
  const ontem = formatarData(new Date(agora.getTime() - 86_400_000));
  const grupos = new Map<string, { data: string; rotulo: string; entradas: DealHistoryEntry[] }>();
  for (const entrada of [...entradas].sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))) {
    const data = formatarData(entrada.occurredAt);
    let grupo = grupos.get(data);
    if (!grupo) {
      const instante = new Date(entrada.occurredAt);
      const rotulo = data === hoje ? `Hoje, ${diaMes.format(instante)}` : data === ontem ? `Ontem, ${diaMes.format(instante)}` : diaCompleto.format(instante);
      grupo = { data, rotulo, entradas: [] };
      grupos.set(data, grupo);
    }
    grupo.entradas.push(entrada);
  }
  return [...grupos.values()];
}
