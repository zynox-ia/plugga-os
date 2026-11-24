import { companyKeys, type AgendaDeCampo, type CompanyKey } from "@plugga/shared";

/**
 * Agenda de campo (PLU-346): a semana × técnico, a partir das O.S. agendadas.
 * Filtros pelo endereço, o rótulo da semana e quais dias mostrar.
 */

export const ROTA_AGENDA = "/engenharia/agenda";

export type FiltrosDaAgenda = { semana?: string; empresa?: CompanyKey; tecnicoId?: string };

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function lerFiltrosDaAgenda(p: Record<string, string | undefined>): FiltrosDaAgenda {
  const empresa = companyKeys.find((e) => e === p.empresa);
  return {
    ...(p.semana && DIA.test(p.semana) && !Number.isNaN(Date.parse(`${p.semana}T00:00:00Z`)) ? { semana: p.semana } : {}),
    ...(empresa ? { empresa } : {}),
    ...(p.tecnico && UUID.test(p.tecnico) ? { tecnicoId: p.tecnico } : {}),
  };
}

export function hrefDaAgenda(f: FiltrosDaAgenda): string {
  const q = new URLSearchParams();
  if (f.semana) q.set("semana", f.semana);
  if (f.empresa) q.set("empresa", f.empresa);
  if (f.tecnicoId) q.set("tecnico", f.tecnicoId);
  const texto = q.toString();
  return texto ? `${ROTA_AGENDA}?${texto}` : ROTA_AGENDA;
}

export const consultaDaAgenda = (f: FiltrosDaAgenda): Record<string, string | undefined> => ({ semana: f.semana, empresa: f.empresa, tecnicoId: f.tecnicoId });

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const DIAS_LONGOS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const partes = (dia: string) => { const [a, m, d] = dia.split("-").map(Number) as [number, number, number]; return { a, m, d, semana: new Date(Date.UTC(a, m - 1, d)).getUTCDay() }; };

/** "23 a 27 de novembro", "30 de novembro a 4 de dezembro" (do primeiro ao último dia mostrado). */
export function rotuloDaSemana(inicio: string, fim: string): string {
  const i = partes(inicio); const f = partes(fim);
  if (i.m === f.m) return `${i.d} a ${f.d} de ${MESES[f.m - 1]}`;
  return `${i.d} de ${MESES[i.m - 1]} a ${f.d} de ${MESES[f.m - 1]}${i.a !== f.a ? ` de ${f.a}` : ""}`;
}

/** "23 nov" do dia. */
export const diaCurtoDaAgenda = (dia: string): string => { const p = partes(dia); return `${p.d} ${MESES_CURTOS[p.m - 1]}`; };
export const nomeDoDia = (dia: string): string => DIAS_LONGOS[partes(dia).semana]!;

/** Segunda a sexta sempre; sábado e domingo só se tiverem O.S. (orientação da API). */
export function diasVisiveis(agenda: Pick<AgendaDeCampo, "dias" | "linhas" | "semTecnico">): AgendaDeCampo["dias"] {
  const comOs = new Set<string>();
  for (const linha of [...agenda.linhas, { dias: agenda.semTecnico }]) for (const d of linha.dias) if (d.ordens.length) comOs.add(d.dia);
  return agenda.dias.filter((d) => d.util || comOs.has(d.dia));
}

/** Quantas O.S. o técnico tem na semana. */
export const osNaSemana = (linha: { dias: readonly { ordens: readonly unknown[] }[] }): number => linha.dias.reduce((s, d) => s + d.ordens.length, 0);

/** "IN" de "Igor Nascimento". */
export const iniciaisDoNome = (nome: string): string => nome.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
