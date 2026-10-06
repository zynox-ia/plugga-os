/**
 * Formatador único de moeda, número e datas (US12, T129).
 *
 * Havia cerca de doze cópias de `toLocaleDateString("pt-BR")` espalhadas pelas
 * views. As que não fixavam fuso formatavam no fuso de quem renderizava: o
 * servidor (UTC) e o navegador (qualquer um) discordavam, e um evento às 22h30
 * em Manaus aparecia no dia seguinte. Aqui o fuso é fixo (`America/Manaus`,
 * UTC-4, sem horário de verão), então servidor e navegador sempre concordam.
 */

export const FUSO_HORARIO = "America/Manaus";
const LOCALE = "pt-BR";
const VAZIO = "—";

type Entrada = string | number | Date | null | undefined;

function paraData(valor: Entrada): Date | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const data = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data;
}

const formatoDiaMes = new Intl.DateTimeFormat(LOCALE, { day: "2-digit", month: "2-digit", timeZone: FUSO_HORARIO });
const formatoData = new Intl.DateTimeFormat(LOCALE, {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: FUSO_HORARIO,
});
const formatoDataHora = new Intl.DateTimeFormat(LOCALE, {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
  timeZone: FUSO_HORARIO,
});
const formatoDataHoraCurta = new Intl.DateTimeFormat(LOCALE, {
  dateStyle: "short",
  timeStyle: "short",
  hourCycle: "h23",
  timeZone: FUSO_HORARIO,
});
const formatoBRL = new Intl.NumberFormat(LOCALE, { style: "currency", currency: "BRL" });
const formatoNumero = new Intl.NumberFormat(LOCALE);

/** `10/03` */
export function formatarDiaMes(valor: Entrada): string {
  const data = paraData(valor);
  return data ? formatoDiaMes.format(data) : VAZIO;
}

/** `10/03/2026` */
export function formatarData(valor: Entrada): string {
  const data = paraData(valor);
  return data ? formatoData.format(data) : VAZIO;
}

/** `10/03/2026, 22:30:00` */
export function formatarDataHora(valor: Entrada): string {
  const data = paraData(valor);
  return data ? formatoDataHora.format(data) : VAZIO;
}

/** `10/03/2026, 22:30` */
export function formatarDataHoraCurta(valor: Entrada): string {
  const data = paraData(valor);
  return data ? formatoDataHoraCurta.format(data) : VAZIO;
}

/** `R$ 1.234,56`. Aceita o decimal em texto que a API devolve. */
export function formatarBRL(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined || valor === "") return VAZIO;
  const numero = Number(valor);
  return Number.isFinite(numero) ? formatoBRL.format(numero) : VAZIO;
}

/** `1.234,5` */
export function formatarNumero(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined || valor === "") return VAZIO;
  const numero = Number(valor);
  return Number.isFinite(numero) ? formatoNumero.format(numero) : VAZIO;
}
