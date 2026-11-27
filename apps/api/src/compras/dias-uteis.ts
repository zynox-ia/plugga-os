import { COMPRAS_FUSO_HORARIO, type SituacaoDoPrazo } from "@plugga/shared";

/**
 * Prazos de Compras em dias úteis, no calendário de Manaus. Puro, sem Nest nem
 * banco: é a régua dos indicadores de prazo e precisa ser testável sozinha.
 *
 * Dia útil é segunda a sexta, sem calendário de feriados: feriado conta como
 * dia útil. Ligar feriados depois muda prazos já gravados, então é decisão de
 * negócio, não ajuste de código.
 *
 * O prazo vence no fim do dia (23:59:59.999 em Manaus): duas etapas abertas no
 * mesmo dia vencem juntas, que é como uma pessoa lê "2 dias úteis".
 */

type Dia = { ano: number; mes: number; dia: number };

const formatador = new Intl.DateTimeFormat("en-CA", {
  timeZone: COMPRAS_FUSO_HORARIO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function partesEmManaus(instante: Date): Dia & { hora: number; minuto: number; segundo: number } {
  const partes = formatador.formatToParts(instante);
  const valor = (tipo: Intl.DateTimeFormatPartTypes) => Number(partes.find((parte) => parte.type === tipo)?.value ?? 0);
  return { ano: valor("year"), mes: valor("month"), dia: valor("day"), hora: valor("hour") % 24, minuto: valor("minute"), segundo: valor("second") };
}

/**
 * Instante UTC de uma hora local de Manaus. Lê o deslocamento do fuso em vez de
 * fixar −04:00, para uma mudança futura de regra de fuso não errar em silêncio.
 */
function instanteEmManaus({ ano, mes, dia }: Dia, hora: number, minuto: number, segundo: number, ms: number): Date {
  const palpite = Date.UTC(ano, mes - 1, dia, hora, minuto, segundo, ms);
  const lido = partesEmManaus(new Date(palpite));
  const lidoComoUtc = Date.UTC(lido.ano, lido.mes - 1, lido.dia, lido.hora, lido.minuto, lido.segundo, ms);
  return new Date(palpite - (lidoComoUtc - palpite));
}

function diaSeguinte({ ano, mes, dia }: Dia): Dia {
  const seguinte = new Date(Date.UTC(ano, mes - 1, dia + 1));
  return { ano: seguinte.getUTCFullYear(), mes: seguinte.getUTCMonth() + 1, dia: seguinte.getUTCDate() };
}

function ehDiaUtil({ ano, mes, dia }: Dia): boolean {
  const semana = new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
  return semana >= 1 && semana <= 5;
}

const doisDigitos = (n: number) => String(n).padStart(2, "0");

/** O dia do calendário de Manaus em que o instante cai, como AAAA-MM-DD. */
export function diaEmManaus(instante: Date): string {
  const { ano, mes, dia } = partesEmManaus(instante);
  return `${ano}-${doisDigitos(mes)}-${doisDigitos(dia)}`;
}

function lerDia(dia: string): Dia {
  const encontrado = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia);
  if (!encontrado) throw new Error(`dia inválido: ${dia}`);
  const lido = { ano: Number(encontrado[1]), mes: Number(encontrado[2]), dia: Number(encontrado[3]) };
  const conferido = new Date(Date.UTC(lido.ano, lido.mes - 1, lido.dia));
  if (conferido.getUTCMonth() + 1 !== lido.mes || conferido.getUTCDate() !== lido.dia) throw new Error(`dia inválido: ${dia}`);
  return lido;
}

/** Primeiro instante do dia AAAA-MM-DD em Manaus (filtro "de" de um período). */
export function inicioDoDiaEmManaus(dia: string): Date {
  return instanteEmManaus(lerDia(dia), 0, 0, 0, 0);
}

/**
 * Primeiro instante do dia seguinte a AAAA-MM-DD em Manaus: o fim EXCLUSIVO de
 * um período que inclui o dia (`>= início do primeiro` e `< isto`). O banco
 * guarda microssegundos, que um "último instante" em milissegundos perderia.
 * Sai das partes do dia, sem formatar data, então vale até em 9999-12-31.
 */
export function inicioDoDiaSeguinteEmManaus(dia: string): Date {
  const lido = lerDia(dia);
  return instanteEmManaus({ ...lido, dia: lido.dia + 1 }, 0, 0, 0, 0);
}

/** Último instante do dia AAAA-MM-DD em Manaus (filtro "até" e prazo de entrega desejado). */
export function fimDoDiaEmManaus(dia: string): Date {
  return instanteEmManaus(lerDia(dia), 23, 59, 59, 999);
}

/**
 * Quando vence um prazo de `dias` dias úteis contado de `inicio`. O dia de
 * início não conta: entrar numa segunda com 2 dias úteis vence no fim da quarta.
 */
export function adicionarDiasUteis(inicio: Date, dias: number): Date {
  if (!Number.isInteger(dias) || dias < 1) throw new Error("o prazo em dias úteis precisa ser um inteiro de pelo menos 1");
  let cursor: Dia = partesEmManaus(inicio);
  let restantes = dias;
  while (restantes > 0) {
    cursor = diaSeguinte(cursor);
    if (ehDiaUtil(cursor)) restantes -= 1;
  }
  return instanteEmManaus(cursor, 23, 59, 59, 999);
}

/** Como está o prazo de uma passagem aberta agora. */
export function situacaoDoPrazo(prazoEm: Date, agora: Date): SituacaoDoPrazo {
  if (agora.getTime() > prazoEm.getTime()) return "vencido";
  return diaEmManaus(prazoEm) === diaEmManaus(agora) ? "vence_hoje" : "no_prazo";
}

/** Se a saída da etapa aconteceu dentro do prazo. */
export function cumpriuPrazo(saiuEm: Date, prazoEm: Date): boolean {
  return saiuEm.getTime() <= prazoEm.getTime();
}
