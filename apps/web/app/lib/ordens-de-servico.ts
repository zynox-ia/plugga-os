import {
  companyKeys,
  filtrosDeAtencao,
  situacoesDaOrdemDeServico,
  tiposDeOrdemDeServico,
  type ColunaDoQuadroDeOrdens,
  type CompanyKey,
  type ContagensDasColunas,
  type FiltroDeAtencao,
  type OrdemDeServicoResumo,
  type PrioridadeDaOrdemDeServico,
  type SituacaoDaOrdemDeServico,
  type TipoDeOrdemDeServico,
} from "@plugga/shared";

import { hojeEmManaus } from "./compras.ts";

/**
 * Ordens de serviço da Engenharia (PLU-345): filtros pelo endereço, rótulos e
 * os textos de agenda e atraso dos cards, da lista e do quadro. Uma tela só
 * para Plugga e Waze; a empresa é filtro e campo da O.S.
 */

export const ROTA_ORDENS_DE_SERVICO = "/engenharia/ordens-de-servico";

export const visoesDasOrdens = ["cards", "lista", "quadro"] as const;
export type VisaoDasOrdens = (typeof visoesDasOrdens)[number];

/**
 * O filtro Situação da tela, em grupos (protótipo de 23/11/2026): um valor só
 * no endereço, que vira `grupo`, `situacao` ou `atencao` na consulta da API.
 */
export const filtrosDeSituacaoDaTela = ["em_andamento", ...situacoesDaOrdemDeServico, ...filtrosDeAtencao] as const;
export type FiltroDeSituacaoDaTela = (typeof filtrosDeSituacaoDaTela)[number];

export const GRUPOS_DO_FILTRO_DE_SITUACAO: { rotulo: string; valores: readonly FiltroDeSituacaoDaTela[] }[] = [
  { rotulo: "Em aberto", valores: ["em_andamento", "aberta", "agendada", "em_campo", "laudo"] },
  { rotulo: "Atenção", valores: ["atrasadas", "em_campo_hoje", "adiada"] },
  { rotulo: "Encerradas", valores: ["concluida", "cancelada"] },
];

export const ROTULO_DO_FILTRO_DE_SITUACAO: Record<FiltroDeSituacaoDaTela, string> = {
  em_andamento: "Todas em aberto",
  aberta: "Para agendar",
  agendada: "Agendadas",
  em_campo: "Em campo",
  laudo: "Laudo · colher assinatura",
  concluida: "Concluídas",
  adiada: "Adiadas",
  cancelada: "Canceladas",
  atrasadas: "Atrasadas",
  em_campo_hoje: "Em campo hoje",
};

/** Quantas O.S. cada opção do filtro mostra, pelas contagens da API (que ignoram o próprio filtro de situação). */
export function contagemDoFiltro(valor: FiltroDeSituacaoDaTela | "todas", c: ContagensDasColunas): number {
  const emAndamento = c.para_agendar + c.agendadas + c.em_campo + c.colher_assinatura + c.adiadas;
  switch (valor) {
    case "todas": return emAndamento + c.concluidas + c.canceladas;
    case "em_andamento": return emAndamento;
    case "aberta": return c.para_agendar;
    case "agendada": return c.agendadas;
    case "em_campo": return c.em_campo;
    case "laudo": return c.colher_assinatura;
    case "concluida": return c.concluidas;
    case "adiada": return c.adiadas;
    case "cancelada": return c.canceladas;
    case "atrasadas": return c.atrasadas;
    case "em_campo_hoje": return c.em_campo_hoje;
  }
}

export const ROTULO_DO_TIPO: Record<TipoDeOrdemDeServico, string> = {
  manutencao: "Manutenção",
  limpeza: "Limpeza",
  garantia: "Garantia",
  emergencia: "Emergência",
  visita_tecnica: "Visita técnica",
  instalacao: "Instalação",
  configuracao: "Configuração",
  comissionamento: "Comissionamento",
  orcamento_tecnico: "Orçamento técnico",
  eletroposto: "Eletroposto",
  grid_zero_bess: "Grid zero · BESS",
  analise_energia: "Análise de energia",
  outros: "Outros",
};

/** O selo de etapa usa o nome da coluna do quadro, como no protótipo. */
export const ROTULO_DA_SITUACAO: Record<SituacaoDaOrdemDeServico, string> = {
  aberta: "Para agendar",
  agendada: "Agendada",
  em_campo: "Em campo",
  laudo: "Colher assinatura",
  concluida: "Concluída",
  adiada: "Adiada",
  cancelada: "Cancelada",
};

export const ROTULO_DA_COLUNA: Record<ColunaDoQuadroDeOrdens, string> = {
  para_agendar: "Para agendar",
  agendadas: "Agendadas",
  em_campo: "Em campo",
  colher_assinatura: "Colher assinatura",
  concluidas: "Concluídas",
  adiadas: "Adiadas",
};

export const ROTULO_DA_PRIORIDADE: Record<PrioridadeDaOrdemDeServico, string> = {
  baixa: "Baixa",
  normal: "Normal",
  alta: "Alta",
  urgente: "Urgente",
};

export type FiltrosDasOrdens = {
  visao: VisaoDasOrdens;
  busca?: string;
  /** No quadro, a situação não filtra: as colunas já são as situações. */
  situacao?: FiltroDeSituacaoDaTela;
  tipo?: TipoDeOrdemDeServico;
  tecnicoId?: string;
  empresa?: CompanyKey;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ehUuid = (valor: string | undefined | null): valor is string => Boolean(valor && UUID.test(valor));

/** Lê os filtros do endereço; valor desconhecido cai no padrão em vez de virar erro da API. */
export function lerFiltrosDasOrdens(p: Record<string, string | undefined>): FiltrosDasOrdens {
  const situacao = filtrosDeSituacaoDaTela.find((s) => s === p.situacao);
  const tipo = tiposDeOrdemDeServico.find((t) => t === p.tipo);
  const empresa = companyKeys.find((e) => e === p.empresa);
  return {
    visao: visoesDasOrdens.find((v) => v === p.visao) ?? "cards",
    busca: p.busca?.trim().slice(0, 150) || undefined,
    ...(situacao ? { situacao } : {}),
    ...(tipo ? { tipo } : {}),
    ...(ehUuid(p.tecnico) ? { tecnicoId: p.tecnico } : {}),
    ...(empresa ? { empresa } : {}),
  };
}

/** Filtros, visão e ficha vão no endereço: o mesmo link abre a mesma tela. */
export function hrefDasOrdens(f: Partial<FiltrosDasOrdens>, ordem?: string | null): string {
  const q = new URLSearchParams();
  if (f.visao && f.visao !== "cards") q.set("visao", f.visao);
  if (f.busca) q.set("busca", f.busca);
  if (f.situacao && f.visao !== "quadro") q.set("situacao", f.situacao);
  if (f.tipo) q.set("tipo", f.tipo);
  if (f.tecnicoId) q.set("tecnico", f.tecnicoId);
  if (f.empresa) q.set("empresa", f.empresa);
  if (ordem) q.set("os", ordem);
  const texto = q.toString();
  return texto ? `${ROTA_ORDENS_DE_SERVICO}?${texto}` : ROTA_ORDENS_DE_SERVICO;
}

/** Há filtro na visão atual (para mostrar "Limpar"). */
export function temFiltroNasOrdens(f: FiltrosDasOrdens): boolean {
  return Boolean(f.busca || f.tipo || f.tecnicoId || f.empresa || (f.visao !== "quadro" && f.situacao));
}

/** Quantos filtros estão ativos (o selo do botão Filtros no celular). */
export function filtrosAtivosNasOrdens(f: FiltrosDasOrdens): number {
  return [f.busca, f.tipo, f.tecnicoId, f.empresa, f.visao !== "quadro" ? f.situacao : undefined].filter(Boolean).length;
}

/** Consulta da lista (`GET /engenharia/ordens-de-servico`). */
export function consultaDaLista(f: FiltrosDasOrdens): Record<string, string | undefined> {
  const s = f.situacao;
  return {
    empresa: f.empresa,
    tipo: f.tipo,
    tecnicoId: f.tecnicoId,
    busca: f.busca,
    grupo: s === "em_andamento" ? s : undefined,
    situacao: s && (situacoesDaOrdemDeServico as readonly string[]).includes(s) ? s : undefined,
    atencao: s && (filtrosDeAtencao as readonly string[]).includes(s) ? (s as FiltroDeAtencao) : undefined,
  };
}

/** Consulta do quadro: sem situação. */
export function consultaDoQuadro(f: FiltrosDasOrdens): Record<string, string | undefined> {
  return { empresa: f.empresa, tipo: f.tipo, tecnicoId: f.tecnicoId, busca: f.busca };
}

// ---------------------------------------------------------------- datas

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const DIAS_DA_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const UM_DIA = 24 * 60 * 60 * 1000;

const dataDoDia = (dia: string) => new Date(`${dia.slice(0, 10)}T00:00:00Z`);
/** Dias de `de` até `ate` (AAAA-MM-DD); negativo quando `ate` vem antes. */
export const diasEntre = (de: string, ate: string): number => Math.round((dataDoDia(ate).getTime() - dataDoDia(de).getTime()) / UM_DIA);

/** "08:00" do instante ISO, no relógio de Manaus (UTC−4, sem horário de verão). */
export function horarioEmManaus(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 4 * 60 * 60 * 1000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/** "Hoje", "Amanhã", "ter 24 nov" (nos próximos 6 dias) ou "20 nov". */
export function diaDaAgenda(dia: string, hoje: string): string {
  const distancia = diasEntre(hoje, dia);
  if (distancia === 0) return "Hoje";
  if (distancia === 1) return "Amanhã";
  const d = dataDoDia(dia);
  const curto = `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`;
  return distancia > 1 && distancia < 7 ? `${DIAS_DA_SEMANA[d.getUTCDay()]} ${curto}` : curto;
}

/** "atrasada há 2 dias"; no próprio dia, só "atrasada". */
export function textoDoAtraso(desde: string, hoje: string): string {
  const dias = diasEntre(desde, hoje);
  return dias <= 0 ? "atrasada" : `atrasada há ${dias} ${dias === 1 ? "dia" : "dias"}`;
}

export type TomDaAgenda = "atraso" | "aviso" | null;

/**
 * Agenda da O.S. em duas linhas, como nos cards: o dia e, abaixo, o atraso, a
 * nova data do adiamento, o horário ou o prazo de quem ainda não tem data.
 */
export function agendaDaOrdem(
  o: Pick<OrdemDeServicoResumo, "situacao" | "agendadaPara" | "prazo" | "atrasada">,
  hoje: string,
): { dia: string; detalhe: string | null; tom: TomDaAgenda } {
  if (!o.agendadaPara) {
    const prazo = diaDaAgenda(o.prazo, hoje);
    if (o.atrasada) return { dia: "Sem data", detalhe: `prazo ${prazo} · ${textoDoAtraso(o.prazo, hoje)}`, tom: "atraso" };
    return { dia: "Sem data", detalhe: `prazo ${prazo.toLowerCase()}`, tom: null };
  }
  const dia = hojeEmManaus(new Date(o.agendadaPara));
  const rotulo = diaDaAgenda(dia, hoje);
  if (o.atrasada) return { dia: rotulo, detalhe: textoDoAtraso(dia < o.prazo ? dia : o.prazo, hoje), tom: "atraso" };
  if (o.situacao === "adiada") return { dia: rotulo, detalhe: "nova data", tom: "aviso" };
  if (o.situacao === "concluida" || o.situacao === "cancelada") return { dia: rotulo, detalhe: null, tom: null };
  return { dia: rotulo, detalhe: horarioEmManaus(o.agendadaPara), tom: null };
}

/** "Igor Nascimento" → "Igor". */
export const primeiroNome = (nome: string): string => nome.trim().split(/\s+/)[0] ?? nome;
