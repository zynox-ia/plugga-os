import {
  companyKeys,
  PRINT_DA_CONFERENCIA_MAX_BYTES,
  tiposDePrintDaConferencia,
  type CardDePlataforma,
  type CompanyKey,
  type SituacaoDoMonitoramento,
} from "@plugga/shared";

import { horarioEmManaus } from "./ordens-de-servico.ts";

/**
 * Usinas e monitoramento do dia (PLU-347): filtros pelo endereço, textos e a
 * conferência de uma plataforma. Uma tela, /engenharia/usinas, com as abas
 * Monitoramento de hoje e Cadastro.
 */

export const ROTA_USINAS = "/engenharia/usinas";

export const abasDasUsinas = ["monitoramento", "cadastro"] as const;
export type AbaDasUsinas = (typeof abasDasUsinas)[number];

export type FiltrosDasUsinas = {
  aba: AbaDasUsinas;
  empresa?: CompanyKey;
  /** Cadastro. */
  busca?: string;
  plataformaId?: string;
  atencao?: boolean;
};

const ID_DE_PLATAFORMA = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ehUuidDeUsina = (v: string | undefined | null): v is string => Boolean(v && UUID.test(v));

export function lerFiltrosDasUsinas(p: Record<string, string | undefined>): FiltrosDasUsinas {
  const empresa = companyKeys.find((e) => e === p.empresa);
  const plataformaId = p.plataforma && p.plataforma.length <= 40 && ID_DE_PLATAFORMA.test(p.plataforma) ? p.plataforma : undefined;
  return {
    aba: abasDasUsinas.find((a) => a === p.aba) ?? "monitoramento",
    ...(empresa ? { empresa } : {}),
    ...(p.busca?.trim() ? { busca: p.busca.trim().slice(0, 150) } : {}),
    ...(plataformaId ? { plataformaId } : {}),
    ...(p.atencao === "sim" ? { atencao: true } : {}),
  };
}

export function hrefDasUsinas(f: Partial<FiltrosDasUsinas>, usina?: string | null): string {
  const q = new URLSearchParams();
  if (f.aba && f.aba !== "monitoramento") q.set("aba", f.aba);
  if (f.empresa) q.set("empresa", f.empresa);
  if (f.aba === "cadastro") {
    if (f.busca) q.set("busca", f.busca);
    if (f.plataformaId) q.set("plataforma", f.plataformaId);
    if (f.atencao) q.set("atencao", "sim");
  }
  if (usina) q.set("usina", usina);
  const texto = q.toString();
  return texto ? `${ROTA_USINAS}?${texto}` : ROTA_USINAS;
}

export const temFiltroNoCadastro = (f: FiltrosDasUsinas): boolean => Boolean(f.busca || f.plataformaId || f.atencao);

export const consultaDasUsinas = (f: FiltrosDasUsinas): Record<string, string | undefined> => ({
  empresa: f.empresa, busca: f.busca, plataformaId: f.plataformaId, atencao: f.atencao ? "sim" : undefined,
});

/** "12,4" (pt-BR, até 3 casas) a partir do kWp com ponto da API. */
export function kwpLegivel(kwp: string): string {
  const n = Number(kwp);
  return Number.isFinite(n) ? n.toLocaleString("pt-BR", { maximumFractionDigits: 3 }) : kwp;
}

export const ROTULO_DA_SITUACAO_DO_MONITORAMENTO: Record<SituacaoDoMonitoramento, string> = {
  normal: "Normal",
  anomalia: "Anomalia",
  sem_comunicacao: "Sem comunicação",
};

/** "1 usina", "2 usinas". */
export const contagemDeUsinas = (n: number): string => `${n} ${n === 1 ? "usina" : "usinas"}`;

/** A linha do card: "Ainda não conferida hoje" ou "Conferida às 09:12 por Marcus Vinicius". */
export function linhaDaConferencia(card: Pick<CardDePlataforma, "conferencia">): string {
  const c = card.conferencia;
  if (!c) return "Ainda não conferida hoje";
  return `Conferida às ${horarioEmManaus(c.conferida.em)}${c.conferida.por ? ` por ${c.conferida.por.nome}` : ""}`;
}

/**
 * Situação da usina na conferência já fechada. A usina cadastrada depois dela não entrou e fica
 * "não conferida" (entra na de amanhã). Sem a lista de conferidas (API antiga), vale a regra de antes.
 */
export function situacaoNaConferenciaFeita(
  usinaId: string,
  conferencia: Pick<NonNullable<CardDePlataforma["conferencia"]>, "excecoes" | "usinasConferidas">,
): SituacaoDoMonitoramento | "nao_conferida" {
  const excecao = conferencia.excecoes.find((e) => e.usinaId === usinaId);
  if (excecao) return excecao.situacao;
  if (conferencia.usinasConferidas && !conferencia.usinasConferidas.includes(usinaId)) return "nao_conferida";
  return "normal";
}

/** O que cada usina virou na conferência que está sendo montada. */
export type MarcacaoDaUsina = { situacao: SituacaoDoMonitoramento; nota: string; abrirOs: boolean };

/** A situação nova traz o padrão do protótipo: anomalia já vem com "abrir O.S." marcado; normal limpa a nota. */
export function mudarSituacao(atual: MarcacaoDaUsina, situacao: SituacaoDoMonitoramento, podeAbrirOs: boolean): MarcacaoDaUsina {
  if (situacao === "normal") return { situacao, nota: "", abrirOs: false };
  return { situacao, nota: atual.nota, abrirOs: podeAbrirOs && situacao === "anomalia" };
}

export type ProblemasDaConferencia = { print?: string; notas: Record<string, string> };

/**
 * Confere a conferência antes do envio e monta os `resultados`: só as usinas que
 * fugiram do normal (as que faltam contam como normais), com a nota obrigatória.
 */
export function resultadosDaConferencia(marcacoes: Record<string, MarcacaoDaUsina>, print: File | null): {
  problemas: ProblemasDaConferencia;
  resultados: { usinaId: string; situacao: SituacaoDoMonitoramento; nota: string; abrirOs: boolean }[] | null;
} {
  const notas: Record<string, string> = {};
  const resultados: { usinaId: string; situacao: SituacaoDoMonitoramento; nota: string; abrirOs: boolean }[] = [];
  for (const [usinaId, m] of Object.entries(marcacoes)) {
    if (m.situacao === "normal") continue;
    if (!m.nota.trim()) notas[usinaId] = "descreva o que foi visto na plataforma.";
    resultados.push({ usinaId, situacao: m.situacao, nota: m.nota.trim(), abrirOs: m.abrirOs });
  }
  const problemaDoPrint = !print ? "anexe o print da plataforma." : problemaDoArquivoDoPrint(print);
  const problemas = { ...(problemaDoPrint ? { print: problemaDoPrint } : {}), notas };
  return { problemas, resultados: problemaDoPrint || Object.keys(notas).length ? null : resultados };
}

/** O print: JPG, PNG ou PDF, até 25 MB (a API confere de novo pelo conteúdo). */
export function problemaDoArquivoDoPrint(arquivo: { type: string; size: number }): string | null {
  if (!(tiposDePrintDaConferencia as readonly string[]).includes(arquivo.type)) return "envie o print em JPG, PNG ou PDF.";
  if (arquivo.size > PRINT_DA_CONFERENCIA_MAX_BYTES) return "o print passa de 25 MB.";
  return null;
}

/** Caminho que o navegador abre: a API devolve o caminho dela, sem /api. */
export const urlDaApi = (url: string): string => (url.startsWith("/api/") ? url : `/api${url.startsWith("/") ? "" : "/"}${url}`);

const POTENCIA = /^\d{1,6}([.,]\d{1,3})?$/;

/** A potência digitada ("12,75" ou "12.75"), com ponto, ou o problema (a mesma regra do contrato). */
export function lerPotencia(texto: string): { valor: string | null; problema: string | null } {
  const t = texto.trim();
  if (!POTENCIA.test(t)) return { valor: null, problema: "use um número como 12,75." };
  const valor = t.replace(",", ".");
  return Number(valor) > 0 ? { valor, problema: null } : { valor: null, problema: "a potência precisa ser maior que zero." };
}
