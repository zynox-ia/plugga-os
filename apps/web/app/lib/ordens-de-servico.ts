import {
  companyKeys,
  filtrosDeAtencao,
  situacoesDaOrdemDeServico,
  tiposDeOrdemDeServico,
  type ColunaDoQuadroDeOrdens,
  type CompanyKey,
  type ContagensDasColunas,
  type FiltroDeAtencao,
  type OrdemDeServico,
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
  o: Pick<OrdemDeServicoResumo, "situacao" | "agendadaPara" | "prazo" | "atrasada"> & { novaData?: string | null },
  hoje: string,
): { dia: string; detalhe: string | null; tom: TomDaAgenda } {
  // A adiada fica sem agendamento até reagendar; a nova data vem à parte (sem horário).
  if (o.situacao === "adiada" && o.novaData) return { dia: diaDaAgenda(o.novaData, hoje), detalhe: "nova data", tom: "aviso" };
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

// ---------------------------------------------------------------- ficha

/** As 5 etapas da trilha da ficha; adiada e cancelada não são passos. */
export const ETAPAS_DA_TRILHA = ["aberta", "agendada", "em_campo", "laudo", "concluida"] as const;
export const ROTULO_DA_ETAPA_DA_TRILHA: Record<(typeof ETAPAS_DA_TRILHA)[number], string> = {
  aberta: "Aberta",
  agendada: "Agendada",
  em_campo: "Em campo",
  laudo: "Laudo",
  concluida: "Concluída",
};

/** Em que passo da trilha a O.S. está: a adiada volta para Agendada; a cancelada fica onde parou. */
export function passoNaTrilha(situacao: SituacaoDaOrdemDeServico, situacaoAnterior?: SituacaoDaOrdemDeServico | null): number {
  const efetiva = situacao === "cancelada" ? (situacaoAnterior ?? "aberta") : situacao;
  if (efetiva === "adiada" || efetiva === "cancelada") return 1;
  return ETAPAS_DA_TRILHA.indexOf(efetiva);
}

export type PendenciaDaOrdem = { feito: boolean; texto: string };

/** O que falta para avançar, por etapa, como no protótipo. */
export function pendenciasDaOrdem(o: { situacao: SituacaoDaOrdemDeServico; descricao: string; tecnico: unknown; agendadaPara: string | null; checkinEm: string | null; fotos: readonly unknown[]; laudo: unknown; termo: unknown }): PendenciaDaOrdem[] {
  const fotos = o.fotos.length;
  const evidencias = { feito: fotos > 0, texto: fotos > 0 ? `Evidências (${fotos})` : "Evidências" };
  switch (o.situacao) {
    case "aberta": return [{ feito: o.descricao.trim().length > 0, texto: "Equipamento ou escopo descrito" }, { feito: false, texto: "Técnico e data" }];
    case "adiada": return [{ feito: true, texto: "Motivo e nova data" }, { feito: false, texto: "Reagendar com técnico e horário" }];
    case "agendada": return [{ feito: Boolean(o.tecnico && o.agendadaPara), texto: "Técnico e data" }, { feito: false, texto: "Check-in no local" }];
    case "em_campo": return [{ feito: Boolean(o.checkinEm), texto: "Check-in no local" }, evidencias, { feito: Boolean(o.laudo), texto: "Laudo" }];
    case "laudo": return [{ feito: Boolean(o.laudo), texto: "Laudo" }, evidencias, { feito: Boolean(o.termo), texto: "Termo assinado pelo cliente" }];
    default: return [];
  }
}

export type TomDoPrazo = "ok" | "hoje" | "vencido";

/** "Prazo hoje", "Prazo em 3 dias" ou "Atrasada há 2 dias", com o tom da cor. */
export function prazoDaOrdem(o: { prazo: string; atrasada: boolean }, hoje: string): { texto: string; tom: TomDoPrazo } {
  const faltam = diasEntre(hoje, o.prazo);
  if (o.atrasada || faltam < 0) {
    const dias = Math.max(0, -faltam);
    return { texto: dias === 0 ? "Atrasada" : `Atrasada há ${dias} ${dias === 1 ? "dia" : "dias"}`, tom: "vencido" };
  }
  if (faltam === 0) return { texto: "Prazo hoje", tom: "hoje" };
  return { texto: `Prazo em ${faltam} ${faltam === 1 ? "dia" : "dias"}`, tom: "ok" };
}

/** Horários do menu de agendamento: de 30 em 30 minutos, das 06:00 às 20:00. */
export const HORARIOS_DE_AGENDAMENTO: readonly string[] = Array.from({ length: 29 }, (_, i) => {
  const minutos = 6 * 60 + i * 30;
  return `${String(Math.floor(minutos / 60)).padStart(2, "0")}:${String(minutos % 60).padStart(2, "0")}`;
});

/** "14:30" de agora em Manaus. */
export const agoraEmManaus = (agora: Date = new Date()): string => horarioEmManaus(agora.toISOString());

/** Confere o agendamento antes de enviar: técnico, data e horário obrigatórios, nada no passado (a API confere de novo). */
export function problemasDoAgendamento(a: { tecnicoId: string; data: string; horario: string }, hoje: string, agora: string): Record<"tecnicoId" | "data" | "horario", string | undefined> {
  return {
    tecnicoId: a.tecnicoId ? undefined : "escolha o técnico.",
    data: !a.data ? "informe a data (dd/mm/aaaa)." : a.data < hoje ? "a data não pode estar no passado." : undefined,
    horario: !a.horario ? "escolha o horário." : a.data === hoje && a.horario <= agora ? "o horário de hoje já passou." : undefined,
  };
}

/** Confere o adiamento: motivo e nova data futura. */
export function problemasDoAdiamento(a: { motivo: string; novaData: string }, hoje: string): Record<"motivo" | "novaData", string | undefined> {
  return {
    motivo: a.motivo.trim() ? undefined : "informe o motivo do adiamento.",
    novaData: !a.novaData ? "informe a nova data (dd/mm/aaaa)." : a.novaData <= hoje ? "a nova data precisa ser depois de hoje." : undefined,
  };
}

/** "Hoje", "Ontem" ou "seg 23 nov" para os grupos da linha do tempo. */
export function rotuloDoDia(dia: string, hoje: string): string {
  const distancia = diasEntre(dia, hoje);
  if (distancia === 0) return "Hoje";
  if (distancia === 1) return "Ontem";
  const d = dataDoDia(dia);
  return `${DIAS_DA_SEMANA[d.getUTCDay()]} ${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`;
}

/** Os eventos da O.S. agrupados pelo dia de Manaus, do mais novo para o mais antigo. */
export function eventosPorDia<T extends { em: string }>(eventos: readonly T[], hoje: string): { dia: string; rotulo: string; itens: T[] }[] {
  const grupos = new Map<string, T[]>();
  for (const e of [...eventos].sort((a, b) => b.em.localeCompare(a.em))) {
    const dia = hojeEmManaus(new Date(e.em));
    grupos.set(dia, [...(grupos.get(dia) ?? []), e]);
  }
  return [...grupos].map(([dia, itens]) => ({ dia, rotulo: rotuloDoDia(dia, hoje), itens }));
}

/** O dia e a hora da agenda no topo da ficha: "hoje, 08:00", "sex 20 nov, 08:30" ou "Sem data". */
export function quandoNaFicha(agendadaPara: string | null, hoje: string): string {
  if (!agendadaPara) return "Sem data";
  const dia = diaDaAgenda(hojeEmManaus(new Date(agendadaPara)), hoje);
  return `${dia === "Hoje" || dia === "Amanhã" ? dia.toLowerCase() : dia}, ${horarioEmManaus(agendadaPara)}`;
}

/** Caminho de download que o navegador abre: a API devolve o caminho dela, sem /api. */
export const urlDoArquivoDaOrdem = (url: string): string => (url.startsWith("/api/") ? url : `/api${url.startsWith("/") ? "" : "/"}${url}`);

/**
 * O PATCH de Editar leva só o que mudou (como `camposDoPedidoAlterados` de
 * Compras): a API recusa qualquer `prazo` no passado, então reenviar o prazo
 * de uma O.S. atrasada travaria a edição de outro campo.
 */
export function camposDaOrdemAlterados(
  o: Pick<OrdemDeServico, "tipo" | "local" | "descricao" | "prioridade" | "prazo" | "equipamento">,
  corpo: Partial<Record<"tipo" | "local" | "descricao" | "prioridade" | "prazo" | "equipamento" | "fabricante" | "modelo" | "numeroSerie", string | null>>,
): Record<string, string | null> {
  const original: Record<string, string | null> = {
    tipo: o.tipo, local: o.local, descricao: o.descricao, prioridade: o.prioridade, prazo: o.prazo,
    equipamento: o.equipamento.equipamento, fabricante: o.equipamento.fabricante, modelo: o.equipamento.modelo, numeroSerie: o.equipamento.numeroSerie,
  };
  const mudou: Record<string, string | null> = {};
  for (const [campo, valor] of Object.entries(corpo)) if (valor !== undefined && valor !== original[campo]) mudou[campo] = valor;
  return mudou;
}
