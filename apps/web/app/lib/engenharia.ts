import { tiposDeOrdemDeServico, type OrdemDeServicoResumo, type TipoDeOrdemDeServico } from "@plugga/shared";

import { diasEntre, primeiroNome } from "./ordens-de-servico.ts";

/**
 * Visão geral e Configurações da Engenharia (PLU-349): textos e regras de tela.
 * Os números vêm da API (`GET /engenharia/visao-geral`, `GET /engenharia/configuracoes`).
 */

export const ROTA_VISAO_GERAL_DA_ENGENHARIA = "/engenharia/visao-geral";

const MESES_LONGOS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const DIAS_LONGOS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

/** "Segunda, 23 de novembro" para o dia (AAAA-MM-DD, já de Manaus). */
export function diaPorExtenso(dia: string): string {
  const [a, m, d] = dia.split("-").map(Number) as [number, number, number];
  return `${DIAS_LONGOS[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]}, ${d} de ${MESES_LONGOS[m - 1]}`;
}

/** "no mesmo dia", "1 dia útil", "3 dias úteis". */
export const textoDoPrazoPadrao = (dias: number): string => (dias === 0 ? "no mesmo dia" : dias === 1 ? "1 dia útil" : `${dias} dias úteis`);

/** O prazo padrão digitado: inteiro de 0 a 30, ou o problema. */
export function lerPrazoPadrao(texto: string): { valor: number | null; problema: string | null } {
  const limpo = texto.trim();
  if (!/^\d{1,2}$/.test(limpo)) return { valor: null, problema: "use um número de 0 a 30." };
  const valor = Number(limpo);
  return valor > 30 ? { valor: null, problema: "use um número de 0 a 30." } : { valor, problema: null };
}

export const ehTipoDeOrdem = (valor: string): valor is TipoDeOrdemDeServico => (tiposDeOrdemDeServico as readonly string[]).includes(valor);

/** Nota do card Atrasadas: "a mais antiga há 3 dias", pelo prazo mais antigo da lista. */
export function notaDasAtrasadas(total: number, itens: readonly Pick<OrdemDeServicoResumo, "prazo">[], hoje: string): string {
  if (total === 0) return "nenhuma atrasada";
  const maisAntigo = itens.map((o) => o.prazo).sort()[0];
  if (!maisAntigo) return `${total} ${total === 1 ? "atrasada" : "atrasadas"}`;
  const dias = diasEntre(maisAntigo, hoje);
  return dias > 0 ? `a mais antiga há ${dias} ${dias === 1 ? "dia" : "dias"}` : "vencem hoje";
}

/**
 * Nota do card Em campo hoje. A API conta só quem fez o check-in hoje (situação
 * em campo); o bloco Campo hoje traz também as agendadas para hoje. A nota segue
 * a contagem: os técnicos em campo; sem ninguém em campo, quantas estão agendadas.
 */
export function notaDoCampoHoje(campoHoje: readonly Pick<OrdemDeServicoResumo, "tecnico" | "situacao">[]): string {
  const emCampo = campoHoje.filter((o) => o.situacao === "em_campo");
  const nomes = [...new Set(emCampo.flatMap((o) => (o.tecnico ? [primeiroNome(o.tecnico.nome)] : [])))];
  if (nomes.length) return nomes.join(", ");
  if (emCampo.length) return "técnico em campo";
  const agendadas = campoHoje.length;
  return agendadas ? `${agendadas} ${agendadas === 1 ? "agendada" : "agendadas"} para hoje` : "ninguém em campo";
}
