import {
  departamentosComTarefas,
  periodosDeTarefas,
  proximasOcorrencias,
  type AtalhoDeTarefa,
  type CriarTarefa,
  type DepartamentoComTarefas,
  type EmpresaDaTarefa,
  type OcorrenciaDeTarefa,
  type PeriodoDeTarefas,
  type RegraDeRecorrencia,
} from "@plugga/shared";

import { diasEntre, horarioEmManaus } from "./ordens-de-servico.ts";

/**
 * Tarefas dos departamentos (PLU-349 na Engenharia, PLU-340 no Financeiro e,
 * depois, a CCEE na Energia): um só componente. Aqui ficam os filtros pelo
 * endereço, os textos de prazo e situação e a validação da Nova tarefa e do
 * concluir. O que muda de um departamento para outro vem em `ConfiguracaoDeTarefas`.
 */

/** O que cada departamento passa para a tela de Tarefas. Só texto: atravessa do servidor para o navegador. */
export type ConfiguracaoDeTarefas = {
  departamento: DepartamentoComTarefas;
  /** Endereço da tela (ex.: /engenharia/tarefas). */
  rota: string;
  /** "a Engenharia", "o Financeiro": entra no subtítulo. */
  nomeDoDepartamento: string;
  /** Exemplos do modal Nova tarefa. */
  exemplo: { titulo: string; item: string };
  /** Atalho → tela onde o trabalho acontece. Sem a tela pronta, o atalho não aparece. */
  atalhos: Partial<Record<AtalhoDeTarefa, { href: string; rotulo: string }>>;
  /**
   * Aviso opcional do departamento, no fim da tela e sempre à vista (ex.: no
   * Financeiro, "Copiar comprovantes deixou de ser tarefa: …"; na Engenharia,
   * como o monitoramento se conclui sozinho).
   */
  nota?: string;
};

export const ehDepartamentoComTarefas = (valor: string): valor is DepartamentoComTarefas => (departamentosComTarefas as readonly string[]).includes(valor);

export const visoesDeTarefas = ["lista", "kanban"] as const;
export type VisaoDeTarefas = (typeof visoesDeTarefas)[number];

export type FiltrosDeTarefas = {
  visao: VisaoDeTarefas;
  periodo: PeriodoDeTarefas;
  empresa?: "plugga" | "waze";
  responsavelId?: string;
  categoria?: string;
};

export const ROTULO_DO_PERIODO_DE_TAREFAS: Record<PeriodoDeTarefas, string> = { hoje: "Hoje", semana: "Esta semana", atrasadas: "Atrasadas", todas: "Todas" };
export const TITULO_DO_PERIODO: Record<PeriodoDeTarefas, string> = { hoje: "Tarefas de hoje", semana: "Tarefas desta semana", atrasadas: "Tarefas atrasadas", todas: "Todas as tarefas" };
const SUFIXO_DO_PERIODO: Record<PeriodoDeTarefas, string> = { hoje: " hoje", semana: " nesta semana", atrasadas: "", todas: " no total" };

export const ROTULO_DA_EMPRESA_DA_TAREFA: Record<EmpresaDaTarefa, string> = { plugga: "Plugga", waze: "Waze Energia", ambas: "Plugga e Waze" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lê os filtros do endereço; valor desconhecido cai no padrão (Lista, Hoje). */
export function lerFiltrosDeTarefas(p: Record<string, string | undefined>): FiltrosDeTarefas {
  const empresa = p.empresa === "plugga" || p.empresa === "waze" ? p.empresa : undefined;
  const categoria = p.categoria?.trim().slice(0, 40);
  return {
    visao: visoesDeTarefas.find((v) => v === p.visao) ?? "lista",
    periodo: periodosDeTarefas.find((x) => x === p.periodo) ?? "hoje",
    ...(empresa ? { empresa } : {}),
    ...(p.responsavel && UUID.test(p.responsavel) ? { responsavelId: p.responsavel } : {}),
    ...(categoria ? { categoria } : {}),
  };
}

export function hrefDeTarefas(rota: string, f: Partial<FiltrosDeTarefas>): string {
  const q = new URLSearchParams();
  if (f.visao && f.visao !== "lista") q.set("visao", f.visao);
  if (f.periodo && f.periodo !== "hoje") q.set("periodo", f.periodo);
  if (f.categoria) q.set("categoria", f.categoria);
  if (f.empresa) q.set("empresa", f.empresa);
  if (f.responsavelId) q.set("responsavel", f.responsavelId);
  const texto = q.toString();
  return texto ? `${rota}?${texto}` : rota;
}

export const temFiltroNasTarefas = (f: FiltrosDeTarefas): boolean => Boolean(f.periodo !== "hoje" || f.empresa || f.responsavelId || f.categoria);
export const filtrosAtivosNasTarefas = (f: FiltrosDeTarefas): number => [f.periodo !== "hoje" ? f.periodo : undefined, f.empresa, f.responsavelId, f.categoria].filter(Boolean).length;

export const consultaDeTarefas = (f: FiltrosDeTarefas): Record<string, string | undefined> => ({
  periodo: f.periodo, empresa: f.empresa, responsavelId: f.responsavelId, categoria: f.categoria,
});

/** "3 de 8 concluídas hoje"; no período Atrasadas, "2 tarefas atrasadas". */
export function textoDoProgresso(periodo: PeriodoDeTarefas, progresso: { concluidas: number; total: number }): string {
  if (periodo === "atrasadas") return `${progresso.total} ${progresso.total === 1 ? "tarefa atrasada" : "tarefas atrasadas"}`;
  return `${progresso.concluidas} de ${progresso.total} ${progresso.total === 1 ? "concluída" : "concluídas"}${SUFIXO_DO_PERIODO[periodo]}`;
}

// ---------------------------------------------------------------- prazo e situação

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** "hoje", "amanhã" ou "sex 20/11". */
export function diaCurtoDaTarefa(dia: string, hoje: string): string {
  const distancia = diasEntre(hoje, dia);
  if (distancia === 0) return "hoje";
  if (distancia === 1) return "amanhã";
  const [a, m, d] = dia.split("-").map(Number) as [number, number, number];
  return `${DIAS[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

export type TomDoPrazoDaTarefa = "perigo" | null;

/** O prazo em duas linhas, como no protótipo: o dia e "até 18:00", "atrasada há 3 dias" ou "feita às 09:40". */
export function prazoDaOcorrencia(o: Pick<OcorrenciaDeTarefa, "dia" | "prazoEm" | "situacao" | "conclusao">, hoje: string): { dia: string; detalhe: string; tom: TomDoPrazoDaTarefa } {
  if (o.situacao === "concluida") {
    return { dia: diaCurtoDaTarefa(o.dia, hoje), detalhe: o.conclusao ? `feita às ${horarioEmManaus(o.conclusao.em)}` : "concluída", tom: null };
  }
  if (o.situacao === "atrasada") {
    const dias = diasEntre(o.dia, hoje);
    return { dia: diaCurtoDaTarefa(o.dia, hoje), detalhe: dias <= 0 ? `atrasada desde ${horarioEmManaus(o.prazoEm)}` : `atrasada há ${dias} ${dias === 1 ? "dia" : "dias"}`, tom: "perigo" };
  }
  return { dia: diaCurtoDaTarefa(o.dia, hoje), detalhe: `até ${horarioEmManaus(o.prazoEm)}`, tom: null };
}

/** A segunda linha da tarefa: o que foi feito, na concluída; a recorrência, na pendente. */
export function linhaDaOcorrencia(o: Pick<OcorrenciaDeTarefa, "situacao" | "conclusao" | "recorrenciaTexto" | "automacao">): string {
  if (o.situacao === "concluida" && o.conclusao) {
    if (o.conclusao.automatica) return `Concluída sozinha às ${horarioEmManaus(o.conclusao.em)}`;
    const partes = [`Feita às ${horarioEmManaus(o.conclusao.em)}`, o.conclusao.evidencias[0]?.nome, o.conclusao.resultado].filter(Boolean);
    return partes.join(" · ");
  }
  return o.automacao ? `${o.recorrenciaTexto} · conclui sozinha` : o.recorrenciaTexto;
}

/** Não concluídas primeiro, as atrasadas na frente, depois pelo prazo e pelo responsável. */
export function ordenarOcorrencias<T extends Pick<OcorrenciaDeTarefa, "situacao" | "prazoEm" | "responsavel">>(itens: readonly T[]): T[] {
  const peso = (o: T) => (o.situacao === "concluida" ? 2 : o.situacao === "atrasada" ? 0 : 1);
  return [...itens].sort((a, b) => peso(a) - peso(b) || a.prazoEm.localeCompare(b.prazoEm) || a.responsavel.nome.localeCompare(b.responsavel.nome, "pt-BR"));
}

// ---------------------------------------------------------------- Nova tarefa

export const recorrenciasDaTela = ["dia_util", "dias_da_semana", "mensal_dia", "mensal_primeiro_dia_util"] as const;
export const ROTULO_DA_RECORRENCIA: Record<(typeof recorrenciasDaTela)[number], string> = {
  dia_util: "Todo dia útil",
  dias_da_semana: "Dias da semana",
  mensal_dia: "Todo mês, num dia",
  mensal_primeiro_dia_util: "1º dia útil do mês",
};

/** Horários-limite do menu: de 30 em 30 minutos, das 07:00 às 20:00. */
export const HORARIOS_LIMITE: readonly string[] = Array.from({ length: 27 }, (_, i) => {
  const minutos = 7 * 60 + i * 30;
  return `${String(Math.floor(minutos / 60)).padStart(2, "0")}:${String(minutos % 60).padStart(2, "0")}`;
});

export type RascunhoDeTarefa = {
  titulo: string;
  empresa: EmpresaDaTarefa | "";
  responsavelId: string;
  substitutoId: string;
  categoria: string;
  tipo: "unica" | "recorrente";
  horarioLimite: string;
  data: string;
  recorrencia: (typeof recorrenciasDaTela)[number];
  dias: number[];
  diaDoMes: string;
  inicio: string;
  exigeEvidencia: boolean;
  exigeResultado: boolean;
  instrucoes: string[];
};

export const rascunhoVazio = (hoje: string, empresa?: "plugga" | "waze"): RascunhoDeTarefa => ({
  titulo: "", empresa: empresa ?? "", responsavelId: "", substitutoId: "", categoria: "", tipo: "unica", horarioLimite: "18:00", data: hoje,
  recorrencia: "dia_util", dias: [], diaDoMes: "5", inicio: hoje, exigeEvidencia: true, exigeResultado: true, instrucoes: [],
});

/** A regra da recorrente, ou null enquanto ela está incompleta (sem dia da semana, dia do mês fora de 1 a 28). */
export function regraDoRascunho(r: Pick<RascunhoDeTarefa, "recorrencia" | "dias" | "diaDoMes">): RegraDeRecorrencia | null {
  switch (r.recorrencia) {
    case "dia_util": return { recorrencia: "dia_util" };
    case "mensal_primeiro_dia_util": return { recorrencia: "mensal_primeiro_dia_util" };
    case "dias_da_semana": return r.dias.length ? { recorrencia: "dias_da_semana", dias: [...r.dias].sort((a, b) => a - b) } : null;
    case "mensal_dia": {
      const dia = Number(r.diaDoMes);
      return /^\d{1,2}$/.test(r.diaDoMes.trim()) && dia >= 1 && dia <= 28 ? { recorrencia: "mensal_dia", dia } : null;
    }
  }
}

/** A prévia "Próximas ocorrências" do modal, sem chamar a API: 5 dias da recorrente, ou o dia da única. */
export function previaDoRascunho(r: RascunhoDeTarefa, hoje: string): string[] {
  if (r.tipo === "unica") return r.data && r.data >= hoje ? [r.data] : [];
  const regra = regraDoRascunho(r);
  return regra && r.inicio && r.inicio >= hoje ? proximasOcorrencias(regra, r.inicio, 5) : [];
}

export type ProblemasDoRascunho = Partial<Record<"titulo" | "empresa" | "responsavelId" | "substitutoId" | "data" | "inicio" | "dias" | "diaDoMes" | "exigeEvidencia", string>>;

/** Confere o rascunho e monta o corpo de `POST /tarefas/:departamento`; a API confere de novo. */
export function corpoDaNovaTarefa(r: RascunhoDeTarefa, hoje: string): { problemas: ProblemasDoRascunho; corpo: CriarTarefa | null } {
  const problemas: ProblemasDoRascunho = {};
  if (!r.titulo.trim()) problemas.titulo = "dê um nome à tarefa.";
  if (!r.empresa) problemas.empresa = "escolha a empresa.";
  if (!r.responsavelId) problemas.responsavelId = "escolha o responsável.";
  if (r.substitutoId && r.substitutoId === r.responsavelId) problemas.substitutoId = "o substituto precisa ser outra pessoa.";
  if (!r.exigeEvidencia && !r.exigeResultado) problemas.exigeEvidencia = "marque ao menos um: evidência ou resultado.";
  if (r.tipo === "unica") {
    if (!r.data) problemas.data = "informe a data (dd/mm/aaaa).";
    else if (r.data < hoje) problemas.data = "a data não pode estar no passado.";
  } else {
    if (!r.inicio) problemas.inicio = "informe quando começa (dd/mm/aaaa).";
    else if (r.inicio < hoje) problemas.inicio = "o início não pode estar no passado.";
    if (r.recorrencia === "dias_da_semana" && !r.dias.length) problemas.dias = "escolha ao menos um dia.";
    if (r.recorrencia === "mensal_dia" && !regraDoRascunho(r)) problemas.diaDoMes = "use um dia de 1 a 28.";
  }
  if (Object.values(problemas).some(Boolean)) return { problemas, corpo: null };
  const base = {
    titulo: r.titulo.trim(),
    empresa: r.empresa as EmpresaDaTarefa,
    responsavelId: r.responsavelId,
    substitutoId: r.substitutoId || null,
    categoria: r.categoria.trim() || null,
    horarioLimite: r.horarioLimite,
    exigeEvidencia: r.exigeEvidencia,
    exigeResultado: r.exigeResultado,
    instrucoes: r.instrucoes.map((i) => i.trim()).filter(Boolean),
  };
  const corpo: CriarTarefa = r.tipo === "unica" ? { tipo: "unica", ...base, data: r.data } : { tipo: "recorrente", ...base, regra: regraDoRascunho(r)!, inicio: r.inicio };
  return { problemas, corpo };
}

// ---------------------------------------------------------------- concluir

/** O que falta para concluir: resultado e evidência, quando a tarefa pede. */
export function problemasDoConcluir(o: Pick<OcorrenciaDeTarefa, "exigeEvidencia" | "exigeResultado">, resultado: string, temEvidencia: boolean): { resultado?: string; evidencia?: string } {
  return {
    ...(o.exigeResultado && !resultado.trim() ? { resultado: "descreva o resultado." } : {}),
    ...(o.exigeEvidencia && !temEvidencia ? { evidencia: "anexe a evidência (PDF, JPG ou PNG)." } : {}),
  };
}

/** Caminho do arquivo que o navegador abre: a API devolve o caminho dela, sem /api. */
export const urlDaEvidencia = (url: string): string => (url.startsWith("/api/") ? url : `/api${url.startsWith("/") ? "" : "/"}${url}`);
