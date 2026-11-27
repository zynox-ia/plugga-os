import type { IntervaloLivre } from "./periodo-livre.ts";

/**
 * Os atalhos de mês dos filtros de período do Financeiro (Conciliação e Baixar comprovantes) e a regra
 * que decide se o intervalo do endereço é um atalho ou um período personalizado. Puro, sem React.
 */

/** O período da API de Conciliação vai até um ano (366 dias entre o início e o fim). */
export const LIMITE_DE_DIAS_DA_CONCILIACAO = 366;

export type AtalhoDeMes = { value: string; label: string; de: string; ate: string };

function somarMeses(mes: string, n: number): string {
  const [ano, m] = mes.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(ano, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Os meses de hoje para trás ("AAAA-MM"), com o primeiro e o último dia. O mês de hoje vai até hoje: dia futuro não tem movimento. */
export function atalhosDeMes(hoje: string, quantos: number, rotulo: (mes: string) => string): AtalhoDeMes[] {
  const atual = hoje.slice(0, 7);
  return Array.from({ length: quantos }, (_, i) => {
    const mes = somarMeses(atual, -i);
    const [ano, m] = mes.split("-").map(Number) as [number, number];
    const ultimo = new Date(Date.UTC(ano, m, 0)).getUTCDate();
    return { value: mes, label: rotulo(mes), de: `${mes}-01`, ate: i === 0 ? hoje : `${mes}-${String(ultimo).padStart(2, "0")}` };
  });
}

/** Atalho e intervalo livre são exclusivos: o intervalo que bate exatamente com um atalho é o atalho; qualquer outro é personalizado. */
export function escolhaDoPeriodo(de: string, ate: string, atalhos: readonly AtalhoDeMes[]): { atalho: string; intervalo: null } | { atalho: ""; intervalo: IntervaloLivre } {
  const atalho = atalhos.find((a) => a.de === de && a.ate === ate);
  return atalho ? { atalho: atalho.value, intervalo: null } : { atalho: "", intervalo: { de, ate } };
}
