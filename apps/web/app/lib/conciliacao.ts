import { companyKeys, type CompanyKey } from "@plugga/shared";

/**
 * Conciliação bancária (PLU-339): o painel lê a API com conta opcional e um
 * período de até um ano. Filtros ficam no endereço, como em Lançamentos.
 */

export const ROTA_CONCILIACAO = "/financeiro/conciliacao";

export const abasDaConciliacao = ["sugeridos", "diferente", "sem-lancamento", "sem-extrato", "conciliados"] as const;
export type AbaDaConciliacao = (typeof abasDaConciliacao)[number];

export type FiltrosDaConciliacao = {
  empresa?: CompanyKey;
  conta?: string;
  de: string;
  ate: string;
  aba: AbaDaConciliacao;
};

const DIA = /^(\d{4})-(\d{2})-(\d{2})$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** O mês corrente em Manaus, do dia 1 até hoje. */
export function periodoDoMes(hoje: string): { de: string; ate: string } {
  return { de: `${hoje.slice(0, 7)}-01`, ate: hoje };
}

export function diaDeCalendario(valor: string | undefined): valor is string {
  const match = valor?.match(DIA);
  if (!match) return false;
  const ano = Number(match[1]);
  const mes = Number(match[2]);
  const dia = Number(match[3]);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia;
}

/** A API recusa fim antes do início e período maior que um ano. */
export function periodoAceito(de: string, ate: string): boolean {
  return diaDeCalendario(de) && diaDeCalendario(ate) && de <= ate && (Date.parse(ate) - Date.parse(de)) / 86_400_000 <= 366;
}

export function lerFiltrosDaConciliacao(p: Record<string, string | undefined>, hoje: string): FiltrosDaConciliacao {
  const padrao = periodoDoMes(hoje);
  const de = diaDeCalendario(p.de) ? p.de : padrao.de;
  const ate = diaDeCalendario(p.ate) ? p.ate : padrao.ate;
  const periodo = periodoAceito(de, ate) ? { de, ate } : padrao;
  const empresa = companyKeys.find((item) => item === p.empresa);
  const aba = abasDaConciliacao.find((item) => item === p.aba) ?? "sugeridos";
  return {
    ...periodo,
    aba,
    ...(empresa ? { empresa } : {}),
    ...(p.conta && UUID.test(p.conta) ? { conta: p.conta } : {}),
  };
}

export function hrefDaConciliacao(f: FiltrosDaConciliacao): string {
  const q = new URLSearchParams();
  if (f.empresa) q.set("empresa", f.empresa);
  if (f.conta) q.set("conta", f.conta);
  q.set("de", f.de);
  q.set("ate", f.ate);
  if (f.aba !== "sugeridos") q.set("aba", f.aba);
  return `${ROTA_CONCILIACAO}?${q.toString()}`;
}

/** Consulta do `GET /financeiro/conciliacao`. A conta, quando vem, é o id. */
export function consultaDaConciliacao(f: FiltrosDaConciliacao): Record<string, string> {
  return {
    de: f.de,
    ate: f.ate,
    ...(f.empresa ? { empresa: f.empresa } : {}),
    ...(f.conta ? { contaCorrenteId: f.conta } : {}),
  };
}
