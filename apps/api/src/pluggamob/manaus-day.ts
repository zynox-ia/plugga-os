/**
 * Janela [início, fim) do dia corrente em America/Manaus (UTC-4, sem horário de
 * verão). Zerar as horas UTC e somar 4 não basta: entre 00:00 e 04:00 UTC o
 * "início do dia" calculado assim cai no futuro e o contador do overview zera
 * — 4 horas por dia, todo dia. Desloca-se para o relógio de Manaus antes de
 * zerar, e volta-se depois.
 */
const MANAUS_UTC_OFFSET_MS = 4 * 3_600_000;

export function manausDayWindow(now: Date): { start: Date; end: Date } {
  const local = new Date(now.getTime() - MANAUS_UTC_OFFSET_MS);
  local.setUTCHours(0, 0, 0, 0);
  const start = new Date(local.getTime() + MANAUS_UTC_OFFSET_MS);
  return { start, end: new Date(start.getTime() + 24 * 3_600_000) };
}
