import type { Deal, Pipeline } from "@plugga/shared";

import { calcularProbabilidadeEtapa } from "./negocios/probabilidade-etapa.ts";
import { hojeNoFuso } from "./negocios.ts";

export const META_TRIMESTRAL_EXEMPLO = 4_400_000;

export type PeriodoTrimestral = { inicio: string; fim: string };
export type CenárioPrevisao = "comprometido" | "provavel" | "melhor";
export type PontoPrevisao = { data: string; realizado: number; projetado: number; ritmoMeta: number };
export type ResultadoPrevisao = {
  periodo: PeriodoTrimestral;
  realizado: number;
  negociosAbertos: Deal[];
  cenarios: Record<CenárioPrevisao, { valor: number; percentualMeta: number }>;
  vendedores: Array<{ id: string; nome: string; meta: number; ganho: number; comprometido: number; provavel: number; lacuna: number }>;
  serie: PontoPrevisao[];
};

const valorDo = (deal: Deal) => (deal.value ? Number(deal.value) : 0);
const noPeriodo = (data: string | null, periodo: PeriodoTrimestral) => data !== null && data >= periodo.inicio && data <= periodo.fim;

export function periodoDoTrimestre(data: string): PeriodoTrimestral {
  const ano = Number(data.slice(0, 4));
  const mes = Number(data.slice(5, 7));
  const inicioMes = Math.floor((mes - 1) / 3) * 3;
  const inicio = new Date(Date.UTC(ano, inicioMes, 1));
  const fim = new Date(Date.UTC(ano, inicioMes + 3, 0));
  return { inicio: inicio.toISOString().slice(0, 10), fim: fim.toISOString().slice(0, 10) };
}

function diaIso(data: Date) { return data.toISOString().slice(0, 10); }

function listarDatasDaSerie(periodo: PeriodoTrimestral, hoje: string): string[] {
  const datas = new Set<string>([periodo.inicio, periodo.fim, hoje]);
  const cursor = new Date(`${periodo.inicio}T12:00:00Z`);
  while (diaIso(cursor) < periodo.fim) {
    cursor.setUTCDate(cursor.getUTCDate() + 7);
    datas.add(diaIso(cursor) > periodo.fim ? periodo.fim : diaIso(cursor));
  }
  return [...datas].filter((data) => data >= periodo.inicio && data <= periodo.fim).sort();
}

export function calcularPrevisao(
  negocios: readonly Deal[],
  pipeline: Pick<Pipeline, "stages">,
  hoje: string,
  meta = META_TRIMESTRAL_EXEMPLO,
): ResultadoPrevisao {
  const periodo = periodoDoTrimestre(hoje);
  const ordenadas = [...pipeline.stages].sort((a, b) => a.position - b.position);
  const indiceEtapa = new Map(ordenadas.map((etapa, indice) => [etapa.id, indice]));
  const diaFechamento = (deal: Deal) => deal.closedAt ? hojeNoFuso(new Date(deal.closedAt)) : null;
  const realizados = negocios.filter((deal) => deal.status === "won" && noPeriodo(diaFechamento(deal), periodo));
  const realizado = realizados.reduce((total, deal) => total + valorDo(deal), 0);
  const negociosAbertos = negocios.filter((deal) => deal.status === "open" && noPeriodo(deal.expectedCloseDate, periodo));
  const probabilidade = (deal: Deal) => calcularProbabilidadeEtapa(indiceEtapa.get(deal.stageId) ?? -1, ordenadas.length);
  const comprometidos = negociosAbertos.filter((deal) => probabilidade(deal) >= 0.75);
  const valorComprometido = comprometidos.reduce((total, deal) => total + valorDo(deal), 0);
  const valorProvavel = negociosAbertos.reduce((total, deal) => total + valorDo(deal) * probabilidade(deal), 0);
  const valorMelhor = negociosAbertos.reduce((total, deal) => total + valorDo(deal), 0);
  const cenario = (projecao: number) => ({ valor: realizado + projecao, percentualMeta: meta > 0 ? ((realizado + projecao) / meta) * 100 : 0 });

  const donos = new Map<string, { id: string; nome: string; ganho: number; comprometido: number; provavel: number }>();
  const obterDono = (deal: Deal) => {
    let dono = donos.get(deal.owner.id);
    if (!dono) {
      dono = { id: deal.owner.id, nome: deal.owner.name, ganho: 0, comprometido: 0, provavel: 0 };
      donos.set(deal.owner.id, dono);
    }
    return dono;
  };
  realizados.forEach((deal) => { obterDono(deal).ganho += valorDo(deal); });
  negociosAbertos.forEach((deal) => {
    const dono = obterDono(deal);
    const valor = valorDo(deal);
    if (probabilidade(deal) >= 0.75) dono.comprometido += valor;
    dono.provavel += valor * probabilidade(deal);
  });
  const vendedores = [...donos.values()].map((dono) => ({
    ...dono,
    meta: meta / Math.max(donos.size, 1),
    lacuna: Math.max(0, meta / Math.max(donos.size, 1) - dono.ganho - dono.provavel),
  })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  const diasNoTrimestre = (new Date(`${periodo.fim}T12:00:00Z`).getTime() - new Date(`${periodo.inicio}T12:00:00Z`).getTime()) / 86_400_000;
  const serie = listarDatasDaSerie(periodo, hoje).map((data) => {
    const realizadoAteData = realizados.filter((deal) => {
      const fechamento = diaFechamento(deal);
      return fechamento !== null && fechamento <= data;
    }).reduce((total, deal) => total + valorDo(deal), 0);
    const decorrido = Math.max(0, (new Date(`${data}T12:00:00Z`).getTime() - new Date(`${periodo.inicio}T12:00:00Z`).getTime()) / 86_400_000);
    const fracaoFutura = hoje >= periodo.fim ? 0 : Math.max(0, Math.min(1, (new Date(`${data}T12:00:00Z`).getTime() - new Date(`${hoje}T12:00:00Z`).getTime()) / Math.max(1, new Date(`${periodo.fim}T12:00:00Z`).getTime() - new Date(`${hoje}T12:00:00Z`).getTime())));
    return {
      data,
      realizado: data <= hoje ? realizadoAteData : realizado,
      projetado: data <= hoje ? realizadoAteData : realizado + valorProvavel * fracaoFutura,
      ritmoMeta: meta * Math.min(1, decorrido / Math.max(1, diasNoTrimestre)),
    };
  });

  return {
    periodo,
    realizado,
    negociosAbertos,
    cenarios: { comprometido: cenario(valorComprometido), provavel: cenario(valorProvavel), melhor: cenario(valorMelhor) },
    vendedores: vendedores.map(({ id, nome, meta: metaVendedor, ganho, comprometido, provavel }) => ({ id, nome, meta: metaVendedor, ganho, comprometido, provavel, lacuna: Math.max(0, metaVendedor - ganho - provavel) })),
    serie,
  };
}

export function projetarNegociosSelecionados(negocios: readonly Deal[], idsIncluidos: ReadonlySet<string>, meta = META_TRIMESTRAL_EXEMPLO) {
  const valor = negocios.filter((deal) => idsIncluidos.has(deal.id)).reduce((total, deal) => total + valorDo(deal), 0);
  return { valor, percentualMeta: meta > 0 ? (valor / meta) * 100 : 0 };
}

export type SelecaoDaPrevisao = { pipelineId: string; ids: ReadonlySet<string> } | null;

export function idsSelecionadosDaPipeline(pipelineId: string, selecao: SelecaoDaPrevisao, negocios: readonly Pick<Deal, "id">[]): Set<string> {
  const idsDisponiveis = new Set(negocios.map((deal) => deal.id));
  if (!selecao || selecao.pipelineId !== pipelineId) return idsDisponiveis;
  return new Set([...selecao.ids].filter((id) => idsDisponiveis.has(id)));
}

export function valorDoNegocioNoCenario(deal: Deal, cenario: CenárioPrevisao, etapas: Pipeline["stages"]): number {
  const ordenadas = [...etapas].sort((a, b) => a.position - b.position);
  const indice = ordenadas.findIndex((etapa) => etapa.id === deal.stageId);
  const peso = calcularProbabilidadeEtapa(indice, ordenadas.length);
  if (cenario === "comprometido") return peso >= 0.75 ? valorDo(deal) : 0;
  if (cenario === "melhor") return valorDo(deal);
  return valorDo(deal) * peso;
}

export function calcularProjecaoSelecionada(
  negocios: readonly Deal[],
  idsIncluidos: ReadonlySet<string>,
  cenario: CenárioPrevisao,
  etapas: Pipeline["stages"],
  meta = META_TRIMESTRAL_EXEMPLO,
) {
  const valor = negocios.filter((deal) => idsIncluidos.has(deal.id)).reduce((total, deal) => total + valorDoNegocioNoCenario(deal, cenario, etapas), 0);
  return { valor, percentualMeta: meta > 0 ? (valor / meta) * 100 : 0 };
}
