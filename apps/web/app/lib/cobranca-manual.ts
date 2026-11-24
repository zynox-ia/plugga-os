import { VALOR_MAXIMO_DO_LANCAMENTO, type CompanyKey, type CriarCobranca, type OpcoesDoFinanceiro } from "@plugga/shared";

import { decimalDigitado } from "./compras.ts";
import { competenciaLegivel } from "./financeiro.ts";

/**
 * Nova cobrança manual e "Baixar comprovantes" (PLU-337, W4). A cobrança em lote
 * pelo ciclo da Operação mensal fica para quando ela existir (decisão do André).
 */

export type CamposDaCobranca = {
  empresa: CompanyKey | null;
  clientId: string;
  competencia: string;
  categoriaId: string;
  contaCorrenteId: string;
  descricao: string;
  /** Como a pessoa digitou ("1.234,56"). */
  valor: string;
  vencimento: string;
  ucIds: string[];
  observacao: string;
};

const mesDe = (dia: string) => dia.slice(0, 7);
function somarMeses(mes: string, n: number): string {
  const [ano, m] = mes.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(ano, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export const cobrancaVazia = (hoje: string): CamposDaCobranca => ({
  empresa: null, clientId: "", competencia: somarMeses(mesDe(hoje), -1), categoriaId: "", contaCorrenteId: "", descricao: "", valor: "", vencimento: "", ucIds: [], observacao: "",
});

/** A competência é o mês do consumo: a anterior primeiro (a mais comum), depois a atual e as duas antes. */
export function competenciasParaEscolher(hoje: string): { value: string; label: string }[] {
  const atual = mesDe(hoje);
  return [-1, 0, -2, -3].map((n) => somarMeses(atual, n)).map((m) => ({ value: m, label: competenciaLegivel(m) }));
}

/** Categorias de receita ativas da empresa, na ordem do código. */
export function categoriasDaEntrada(opcoes: Pick<OpcoesDoFinanceiro, "categorias">, empresa: CompanyKey | null) {
  if (!empresa) return [];
  return opcoes.categorias
    .filter((c) => c.empresa === empresa && c.tipo === "receita" && c.ativa)
    .sort((a, b) => a.codigo.localeCompare(b.codigo, "pt-BR", { numeric: true }));
}

/** "Gestão de energia · out/2026", a descrição sugerida pela categoria e a competência. */
export const descricaoSugerida = (categoria: string, competencia: string): string => `${categoria} · ${competenciaLegivel(competencia)}`;

/** Valida e monta o corpo do POST, com os nomes de campo da API. */
export function corpoDaCobranca(c: CamposDaCobranca): { corpo?: CriarCobranca; porCampo: Record<string, string> } {
  const porCampo: Record<string, string> = {};
  if (!c.empresa) porCampo.empresa = "escolha a empresa (Plugga ou Waze Energia).";
  if (!c.clientId) porCampo.clientId = "escolha o cliente.";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(c.competencia)) porCampo.competencia = "escolha a competência.";
  if (!c.categoriaId) porCampo.categoriaId = c.empresa ? "escolha a categoria." : "escolha a empresa primeiro.";
  if (!c.descricao.trim()) porCampo.descricao = "descreva a cobrança.";
  else if (c.descricao.trim().length > 200) porCampo.descricao = "use até 200 caracteres.";
  const valor = decimalDigitado(c.valor);
  if (!valor || Number(valor) <= 0) porCampo.valor = "informe o valor, como 1.234,56.";
  else if (Number(valor) > Number(VALOR_MAXIMO_DO_LANCAMENTO)) porCampo.valor = "o valor passa do máximo permitido.";
  if (!c.vencimento) porCampo.vencimento = "informe o vencimento (dd/mm/aaaa).";
  if (c.observacao.trim().length > 2000) porCampo.observacao = "use até 2000 caracteres.";
  if (Object.keys(porCampo).length || !c.empresa || !valor) return { porCampo };
  return {
    porCampo,
    corpo: {
      empresa: c.empresa, clientId: c.clientId, competencia: c.competencia, categoriaId: c.categoriaId,
      ...(c.contaCorrenteId ? { contaCorrenteId: c.contaCorrenteId } : {}),
      descricao: c.descricao.trim(), valor, vencimento: c.vencimento, ucIds: c.ucIds,
      ...(c.observacao.trim() ? { observacao: c.observacao.trim() } : {}),
    },
  };
}

export type Repetida = { codigo: string; id: string };

/** A cobrança que já existe, no 409 da repetida: `existente: { codigo, id }` no topo do envelope. */
export function cobrancaExistente(corpo: unknown): Repetida | null {
  const existente = (corpo as { existente?: { codigo?: unknown; id?: unknown } } | null)?.existente;
  return typeof existente?.codigo === "string" && typeof existente.id === "string" ? { codigo: existente.codigo, id: existente.id } : null;
}

// ---------------------------------------------------------------- baixar comprovantes

export type TipoDoZip = "todos" | "saida" | "entrada";

/**
 * Prazo do proxy do .zip: o padrão (15 s) vale também para a leitura do corpo em
 * fluxo, e um mês cheio de comprovantes pode levar mais que isso para ser escrito;
 * cortado no meio, o .zip chegaria corrompido.
 */
export const PRAZO_DO_ZIP_MS = 10 * 60_000;

/** Os meses para escolher (do atual para trás), com o primeiro e o último dia. */
export function mesesParaBaixar(hoje: string, quantos = 12): { value: string; label: string; de: string; ate: string }[] {
  const atual = mesDe(hoje);
  return Array.from({ length: quantos }, (_, i) => {
    const mes = somarMeses(atual, -i);
    const [ano, m] = mes.split("-").map(Number) as [number, number];
    const ultimo = new Date(Date.UTC(ano, m, 0)).getUTCDate();
    // O mês corrente vai até hoje: dia futuro não tem comprovante.
    const ate = i === 0 ? hoje : `${mes}-${String(ultimo).padStart(2, "0")}`;
    return { value: mes, label: competenciaLegivel(mes), de: `${mes}-01`, ate };
  });
}

/** O endereço do .zip pelo proxy da web, só com o que foi escolhido. */
export function hrefDoZip(p: { empresa: CompanyKey | null; de: string; ate: string; tipo: TipoDoZip }): string {
  const q = new URLSearchParams();
  if (p.empresa) q.set("empresa", p.empresa);
  q.set("de", p.de);
  q.set("ate", p.ate);
  if (p.tipo !== "todos") q.set("tipo", p.tipo);
  return `/api/financeiro/comprovantes.zip?${q.toString()}`;
}

/** Só os tipos que a pessoa alcança: quem só vê saídas não escolhe "entradas". */
export function tiposDoZip(alcance: { saidas: boolean; entradas: boolean }): { value: TipoDoZip; label: string }[] {
  if (alcance.saidas && alcance.entradas) return [{ value: "todos", label: "Pagamentos e recebimentos" }, { value: "saida", label: "Só pagamentos" }, { value: "entrada", label: "Só recebimentos" }];
  return alcance.saidas ? [{ value: "saida", label: "Pagamentos" }] : [{ value: "entrada", label: "Recebimentos" }];
}
