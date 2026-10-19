import type { Deal, DealStatus, Pipeline } from "@plugga/shared";

// Extensão explícita: este módulo também roda sob `node --test` (test/negocios.test.ts).
import { FUSO_HORARIO } from "./format.ts";

/**
 * Regras de exibição dos negócios no quadro e na lista (PLU-271): dias na
 * etapa, alerta de parado, somas e filtros. Tudo puro, para testar sem tela.
 */

export type Visao = "kanban" | "lista";
export type FiltroDeStatus = DealStatus | "todos";
export type FiltroDePrevisao = "qualquer" | "atrasada" | "este-mes" | "proximo-mes" | "sem-previsao";
export type Filtros = { busca: string; responsavel: string; etiqueta: string; status: FiltroDeStatus; previsao: FiltroDePrevisao };
export type Ordem = { campo: "titulo" | "valor" | "previsao" | "dias" | "etapa"; direcao: "asc" | "desc" };

export const FILTROS_INICIAIS: Filtros = { busca: "", responsavel: "", etiqueta: "", status: "open", previsao: "qualquer" };

export const ROTULO_STATUS: Record<DealStatus, string> = { open: "Aberto", won: "Ganho", lost: "Perdido" };

const DIA_MS = 86_400_000;

/** Hoje no fuso da operação (Manaus), "AAAA-MM-DD": base de previsão vencida e revisita. */
export function hojeNoFuso(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO_HORARIO, year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);
}

export function diasNaEtapa(negocio: Pick<Deal, "stageEnteredAt">, agora: Date = new Date()): number {
  return Math.max(0, Math.floor((agora.getTime() - new Date(negocio.stageEnteredAt).getTime()) / DIA_MS));
}

/** Aberto e na etapa há mais dias que o prazo de parado dela. */
export function estaParado(negocio: Deal, pipeline: Pipeline, agora: Date = new Date()): boolean {
  if (negocio.status !== "open") return false;
  const prazo = pipeline.stages.find((e) => e.id === negocio.stageId)?.staleAfterDays;
  return prazo != null && diasNaEtapa(negocio, agora) > prazo;
}

export function somaDosValores(negocios: readonly Deal[]): number {
  return negocios.reduce((total, n) => total + (n.value ? Number(n.value) : 0), 0);
}

/** "R$ 3,28 mi", "R$ 658 mil", "R$ 950": o quanto cabe no topo de uma coluna. */
export function valorCurto(valor: number): string {
  const brl = (n: number, casas: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
  if (valor >= 1_000_000) return `R$ ${brl(valor / 1_000_000, 2)} mi`;
  if (valor >= 1_000) return `R$ ${brl(Math.round(valor / 1_000), 0)} mil`;
  return `R$ ${brl(valor, 0)}`;
}

function mesDe(data: string): string {
  return data.slice(0, 7);
}

function proximoMes(hoje: string): string {
  const [ano, mes] = hoje.split("-").map(Number) as [number, number];
  return mes === 12 ? `${ano + 1}-01` : `${ano}-${String(mes + 1).padStart(2, "0")}`;
}

const normalizar = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export function aplicarFiltros(negocios: readonly Deal[], filtros: Filtros, hoje: string): Deal[] {
  const termo = normalizar(filtros.busca.trim());
  return negocios.filter((n) => {
    if (filtros.status !== "todos" && n.status !== filtros.status) return false;
    if (filtros.responsavel && n.owner.id !== filtros.responsavel) return false;
    if (filtros.etiqueta && !n.tags.some((t) => t.id === filtros.etiqueta)) return false;
    if (termo && !normalizar(`${n.title} ${n.client.name} ${n.contact?.name ?? ""}`).includes(termo)) return false;
    const previsao = n.expectedCloseDate;
    switch (filtros.previsao) {
      case "atrasada":
        return previsao !== null && previsao < hoje && n.status === "open";
      case "este-mes":
        return previsao !== null && mesDe(previsao) === mesDe(hoje);
      case "proximo-mes":
        return previsao !== null && mesDe(previsao) === proximoMes(hoje);
      case "sem-previsao":
        return previsao === null;
      default:
        return true;
    }
  });
}

export function ordenar(negocios: readonly Deal[], ordem: Ordem, pipeline: Pipeline, agora: Date = new Date()): Deal[] {
  const posicao = new Map(pipeline.stages.map((e) => [e.id, e.position]));
  const chave = (n: Deal): number | string => {
    switch (ordem.campo) {
      case "titulo":
        return normalizar(n.title);
      case "valor":
        return n.value ? Number(n.value) : -1;
      case "previsao":
        return n.expectedCloseDate ?? "9999-99-99";
      case "dias":
        return diasNaEtapa(n, agora);
      case "etapa":
        return posicao.get(n.stageId) ?? 0;
    }
  };
  const sinal = ordem.direcao === "asc" ? 1 : -1;
  return [...negocios].sort((a, b) => {
    const [x, y] = [chave(a), chave(b)];
    return (x < y ? -1 : x > y ? 1 : 0) * sinal;
  });
}

export function hrefDaVisao(pipelineId: string, visao: Visao): string {
  const consulta = new URLSearchParams({ pipeline: pipelineId });
  if (visao === "lista") consulta.set("visao", "lista");
  return `/comercial/pipelines?${consulta.toString()}`;
}

/**
 * Valor digitado na tela para o decimal da API: "480.000,00", "480000" e
 * "1.250,5" viram "480000.00", "480000.00" e "1250.50". Vazio é null (sem
 * valor); o que não for número é undefined (erro).
 */
export function valorDigitadoParaDecimal(texto: string): string | null | undefined {
  const limpo = texto.replace(/\s|R\$/g, "");
  if (limpo === "") return null;
  let normal = limpo;
  if (normal.includes(",")) normal = normal.replace(/\./g, "").replace(",", ".");
  else if ((normal.match(/\./g) ?? []).length > 1 || /\.\d{3}$/.test(normal)) normal = normal.replace(/\./g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(normal)) return undefined;
  return Number(normal).toFixed(2);
}
