import { companyKeys, type CompanyKey, type ContaCorrente, type LancamentoNaConciliacao, type MovimentoDoExtrato, type PainelDaConciliacao } from "@plugga/shared";

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

/** "-1234.56" em centavos inteiros: dinheiro não passa por float. */
function centavos(valor: string): bigint {
  const negativo = valor.trim().startsWith("-");
  const [inteiro = "0", fracao = ""] = valor.trim().replace(/^[-+]/, "").split(".");
  const absoluto = BigInt(inteiro || "0") * 100n + BigInt((fracao + "00").slice(0, 2));
  return negativo ? -absoluto : absoluto;
}

function deCentavos(total: bigint): string {
  const absoluto = total < 0n ? -total : total;
  return `${total < 0n ? "-" : ""}${absoluto / 100n}.${(absoluto % 100n).toString().padStart(2, "0")}`;
}

export type SaldosDaConciliacao =
  /** `diferenca`: o calculado menos o conciliado, o liquidado que ainda não foi conferido com o extrato. */
  | { tipo: "calculado"; calculado: string; conciliado: string; diferenca: string; semSaldo: number }
  /** A API esconde o saldo de quem só acompanha pagar ou só receber (seria parcial). */
  | { tipo: "oculto" }
  | { tipo: "sem-saldo-inicial" };

/**
 * O saldo conciliado e a diferença (PLU-339, C4) das contas do escopo: a escolhida, ou as
 * ativas da empresa. A conta sem saldo calculado fica fora da soma, e `semSaldo` diz quantas.
 */
export function saldosDaConciliacao(contas: readonly Pick<ContaCorrente, "saldoCalculado" | "saldoConciliado" | "saldoInicial">[]): SaldosDaConciliacao | null {
  if (contas.length === 0) return null;
  const com = contas.filter((c) => c.saldoCalculado && c.saldoConciliado);
  if (com.length === 0) return contas.some((c) => c.saldoInicial) ? { tipo: "oculto" } : { tipo: "sem-saldo-inicial" };
  const calculado = com.reduce((t, c) => t + centavos(c.saldoCalculado!), 0n);
  const conciliado = com.reduce((t, c) => t + centavos(c.saldoConciliado!), 0n);
  return { tipo: "calculado", calculado: deCentavos(calculado), conciliado: deCentavos(conciliado), diferenca: deCentavos(calculado - conciliado), semSaldo: contas.length - com.length };
}

/** "Sem par" na faixa: as duas pontas, a linha do extrato sem lançamento e o lançamento sem extrato. */
export function semParDoResumo(r: Pick<PainelDaConciliacao["resumo"], "semLancamento" | "semExtrato">): { total: number; detalhe: string } {
  const total = r.semLancamento + r.semExtrato;
  return { total, detalhe: total === 0 ? "nada sem par" : `${r.semLancamento} no extrato · ${r.semExtrato} no Plugga OS` };
}

/**
 * "Corrigir" no par com valor diferente: a correção de valor da ficha, que no pago ou recebido
 * ainda não conciliado é da gerência (API, `podeExecutar`). Já vem com o valor da linha do
 * extrato, como se digita ("1.234,56"). A perna de uma transferência fica de fora: as duas
 * pontas têm o mesmo valor, e a correção de uma só não fecharia.
 */
export function correcaoDoPar(
  par: { movimento: Pick<MovimentoDoExtrato, "valor">; lancamento: Pick<LancamentoNaConciliacao, "valor" | "transferencia"> },
  gerente: boolean,
): { valorInicial: string } | null {
  if (!gerente || par.lancamento.transferencia) return null;
  const doExtrato = deCentavos(centavos(par.movimento.valor.replace(/^-/, "")));
  return { valorInicial: Number(doExtrato).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) };
}

/** O motivo do "Desfazer", no campo, antes de ir à API (`desfazerConciliacaoSchema`: 3 a 500 letras). */
export function problemaDoMotivo(motivo: string): string | null {
  const texto = motivo.trim();
  if (texto.length < 3) return "informe o motivo, com pelo menos 3 letras.";
  return texto.length > 500 ? "use até 500 caracteres." : null;
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
