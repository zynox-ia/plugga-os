import { z } from "zod";

import { diaDoCalendario } from "./compras.js";
import { isoDate, uuid } from "./primitivas.js";

/**
 * Tarefas do departamento (PLU-340 no Financeiro, PLU-349 na Engenharia e,
 * depois, as obrigações da CCEE na Energia): um só contrato e um só código para
 * todos, em `/{departamento}/tarefas`. Antes "Rotinas do dia" (decisão do André,
 * 23/11/2026): a tela geral de tarefas do departamento.
 *
 * - **Tarefa** é a definição: Única (um dia e um horário-limite) ou Recorrente
 *   (todo dia útil, dias da semana, mensal num dia ou no 1º dia útil).
 * - **Ocorrência** é a tarefa num dia: é o que aparece na lista e no Kanban e o
 *   que se conclui. Cada dia de uma recorrente vira uma ocorrência; a não feita
 *   fica atrasada (decisão de 23/11/2026).
 * - Feriado conta como dia útil (E13/F13): dia útil é de segunda a sexta, e o
 *   1º dia útil é o primeiro dia de segunda a sexta do mês.
 * - Datas e horários no fuso de Manaus.
 * - A empresa é Plugga, Waze ou as duas; o filtro de uma empresa mostra também as
 *   tarefas das duas.
 *
 * Rotas, com `:departamento` = `financeiro` | `engenharia-obras` | `energia-opm`
 * (o departamento atrás de um portão responde 404 com o portão fechado):
 *
 * ```
 * GET  /tarefas/:departamento                    lista (ListarTarefasQuery → ListarTarefasResposta)
 * GET  /tarefas/:departamento/opcoes             pessoas, categorias, podeCriar
 * POST /tarefas/:departamento                    nova tarefa (CriarTarefa → Tarefa)
 * GET  /tarefas/:departamento/:tarefaId          a definição (Tarefa)
 * POST /tarefas/:departamento/:tarefaId/encerrar (EncerrarTarefa → Tarefa)
 * POST /tarefas/:departamento/ocorrencias/:id/concluir   multipart: resultado, checklist, arquivo `evidencia` → OcorrenciaDeTarefa
 * GET  /tarefas/:departamento/ocorrencias/:id/evidencias/:evidenciaId   o arquivo (inline)
 * ```
 */

// ---------------------------------------------------------------- enums

/** Departamentos com a tela de Tarefas. */
export const departamentosComTarefas = ["financeiro", "engenharia-obras", "energia-opm"] as const;
export const departamentoComTarefasSchema = z.enum(departamentosComTarefas);
export type DepartamentoComTarefas = z.infer<typeof departamentoComTarefasSchema>;

export const empresasDaTarefa = ["plugga", "waze", "ambas"] as const;
export const empresaDaTarefaSchema = z.enum(empresasDaTarefa);
export type EmpresaDaTarefa = z.infer<typeof empresaDaTarefaSchema>;

export const tiposDeTarefa = ["unica", "recorrente"] as const;
export const tipoDeTarefaSchema = z.enum(tiposDeTarefa);
export type TipoDeTarefa = z.infer<typeof tipoDeTarefaSchema>;

/**
 * `criada`: alguém criou pela tela. `do_departamento`: rotina fixa do
 * departamento (ex.: "Acompanhar contas a pagar e receber"), semeada pelo
 * sistema; só gerente encerra.
 */
export const origensDaTarefa = ["criada", "do_departamento"] as const;
export const origemDaTarefaSchema = z.enum(origensDaTarefa);
export type OrigemDaTarefa = z.infer<typeof origemDaTarefaSchema>;

export const recorrencias = ["dia_util", "dias_da_semana", "mensal_dia", "mensal_primeiro_dia_util"] as const;
export const recorrenciaSchema = z.enum(recorrencias);
export type Recorrencia = z.infer<typeof recorrenciaSchema>;

/** Situação da ocorrência pelo prazo, para os filtros e os selos. */
export const situacoesDaOcorrencia = ["no_prazo", "vence_hoje", "atrasada", "concluida"] as const;
export const situacaoDaOcorrenciaSchema = z.enum(situacoesDaOcorrencia);
export type SituacaoDaOcorrencia = z.infer<typeof situacaoDaOcorrenciaSchema>;

/** Colunas do Kanban: pendentes (no prazo ou vence hoje), atrasadas e concluídas. */
export const colunasDoKanbanDeTarefas = ["pendentes", "atrasadas", "concluidas"] as const;
export type ColunaDoKanbanDeTarefas = (typeof colunasDoKanbanDeTarefas)[number];

/** Período: Hoje inclui as atrasadas; Esta semana (segunda a domingo) também. */
export const periodosDeTarefas = ["hoje", "semana", "atrasadas", "todas"] as const;
export const periodoDeTarefasSchema = z.enum(periodosDeTarefas);
export type PeriodoDeTarefas = z.infer<typeof periodoDeTarefasSchema>;

/**
 * Tarefa automática: o sistema a conclui quando o trabalho dela é feito em outra
 * tela (ex.: o monitoramento do dia, quando as plataformas forem conferidas).
 * Ninguém a conclui pela tela de Tarefas.
 */
export const automacoesDeTarefa = ["engenharia.monitoramento_do_dia", "engenharia.protocolos_do_dia"] as const;
export const automacaoDeTarefaSchema = z.enum(automacoesDeTarefa);
export type AutomacaoDeTarefa = z.infer<typeof automacaoDeTarefaSchema>;

/** Atalho da tarefa para a tela onde o trabalho acontece. A web monta o link. */
export const atalhosDeTarefa = ["usinas", "protocolos", "agenda", "obras", "agencia_virtual", "lancamentos", "conciliacao"] as const;
export const atalhoDeTarefaSchema = z.enum(atalhosDeTarefa);
export type AtalhoDeTarefa = z.infer<typeof atalhoDeTarefaSchema>;

export const acoesDaTarefa = ["concluir", "encerrar"] as const;
export type AcaoDaTarefa = (typeof acoesDaTarefa)[number];

// ---------------------------------------------------------------- arquivos

export const EVIDENCIA_DE_TAREFA_MAX_BYTES = 25 * 1024 * 1024;
/** Print, foto ou PDF, conferidos pelo conteúdo. */
export const tiposDeEvidenciaDeTarefa = ["application/pdf", "image/jpeg", "image/png"] as const;

// ---------------------------------------------------------------- entradas

const texto = (min: number, max: number, problema: string) => z.string().trim().min(min, problema).max(max);
const textoOpcional = (max: number) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().trim().max(max).nullable()).optional();

/** Horário do dia (HH:mm, 24 h), no fuso de Manaus. */
const horario = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "use o formato HH:mm");

/** 0 = domingo … 6 = sábado. */
const diaDaSemana = z.number().int().min(0).max(6);

export const regraDeRecorrenciaSchema = z.discriminatedUnion("recorrencia", [
  z.object({ recorrencia: z.literal("dia_util") }).strict(),
  z
    .object({ recorrencia: z.literal("dias_da_semana"), dias: z.array(diaDaSemana).min(1, "escolha ao menos um dia").max(7) })
    .strict()
    .refine((r) => new Set(r.dias).size === r.dias.length, { message: "dias repetidos", path: ["dias"] }),
  /** De 1 a 28, para valer em todos os meses. */
  z.object({ recorrencia: z.literal("mensal_dia"), dia: z.number().int().min(1, "de 1 a 28").max(28, "de 1 a 28") }).strict(),
  z.object({ recorrencia: z.literal("mensal_primeiro_dia_util") }).strict(),
]);
export type RegraDeRecorrencia = z.infer<typeof regraDeRecorrenciaSchema>;

const baseDaTarefa = {
  titulo: texto(1, 90, "dê um nome à tarefa"),
  empresa: empresaDaTarefaSchema,
  responsavelId: uuid,
  substitutoId: uuid.nullable().optional(),
  /** Categoria livre do departamento (ex.: "CCEE", "Fiscal"), com filtro. */
  categoria: textoOpcional(40),
  horarioLimite: horario,
  exigeEvidencia: z.boolean(),
  exigeResultado: z.boolean(),
  /** Viram o checklist na hora de concluir. */
  instrucoes: z.array(texto(1, 200, "escreva o item")).max(20).default([]),
  atalho: atalhoDeTarefaSchema.nullable().optional(),
};

const conferirBase = (t: { exigeEvidencia: boolean; exigeResultado: boolean; responsavelId: string; substitutoId?: string | null }, ctx: z.RefinementCtx) => {
  if (!t.exigeEvidencia && !t.exigeResultado) ctx.addIssue({ code: "custom", path: ["exigeEvidencia"], message: "marque ao menos um: evidência ou resultado" });
  if (t.substitutoId && t.substitutoId === t.responsavelId) ctx.addIssue({ code: "custom", path: ["substitutoId"], message: "o substituto precisa ser outra pessoa" });
};

/** Nova tarefa. A data (única) e o início (recorrente) não podem estar no passado; a API confere com o relógio. */
export const criarTarefaSchema = z
  .discriminatedUnion("tipo", [
    z.object({ tipo: z.literal("unica"), ...baseDaTarefa, data: diaDoCalendario }).strict(),
    z.object({ tipo: z.literal("recorrente"), ...baseDaTarefa, regra: regraDeRecorrenciaSchema, inicio: diaDoCalendario }).strict(),
  ])
  .superRefine(conferirBase);
export type CriarTarefa = z.infer<typeof criarTarefaSchema>;

/** Concluir uma ocorrência (`POST .../ocorrencias/:id/concluir`, multipart: estes campos + o arquivo `evidencia`). */
export const concluirOcorrenciaSchema = z
  .object({
    resultado: textoOpcional(2000),
    /** Índices das instruções marcadas, separados por vírgula ("0,2"). */
    checklist: z
      .preprocess((v) => (typeof v === "string" ? (v.trim() === "" ? [] : v.split(",").map((x) => Number(x.trim()))) : v), z.array(z.number().int().min(0).max(19)).max(20))
      .optional(),
  })
  .strict();
export type ConcluirOcorrencia = z.infer<typeof concluirOcorrenciaSchema>;

/** Encerrar uma tarefa: a recorrente para de gerar ocorrências; as pendentes de hoje em diante saem da lista. */
export const encerrarTarefaSchema = z.object({ motivo: texto(1, 500, "informe o motivo") }).strict();
export type EncerrarTarefa = z.infer<typeof encerrarTarefaSchema>;

export const listarTarefasQuerySchema = z
  .object({
    periodo: periodoDeTarefasSchema.default("hoje"),
    /** Plugga ou Waze: inclui as tarefas das duas empresas. */
    empresa: z.enum(["plugga", "waze"]).optional(),
    /** Responsável ou substituto. */
    responsavelId: uuid.optional(),
    categoria: z.string().trim().min(1).max(40).optional(),
  })
  .strict();
export type ListarTarefasQuery = z.infer<typeof listarTarefasQuerySchema>;

// ---------------------------------------------------------------- saídas

const pessoa = z.object({ id: uuid, nome: z.string() });
const registro = z.object({ por: pessoa.nullable(), em: isoDate });

/** Mesmo formato do anexo do lançamento (financeiro.ts), para a mesma lista de anexos na web. */
export const evidenciaDeTarefaSchema = z.object({
  id: uuid,
  nome: z.string(),
  tamanhoBytes: z.number().int().positive(),
  mime: z.string(),
  /** Caminho da API para baixar, relativo (nunca a URL do armazenamento). */
  url: z.string(),
  enviado: registro,
});
export type EvidenciaDeTarefa = z.infer<typeof evidenciaDeTarefaSchema>;

export const ocorrenciaDeTarefaSchema = z.object({
  /** Id da ocorrência (a tarefa num dia). */
  id: uuid,
  tarefaId: uuid,
  departamento: departamentoComTarefasSchema,
  titulo: z.string(),
  categoria: z.string().nullable(),
  empresa: empresaDaTarefaSchema,
  responsavel: pessoa,
  substituto: pessoa.nullable(),
  tipo: tipoDeTarefaSchema,
  origem: origemDaTarefaSchema,
  /** Texto pronto: "Todo dia útil, até 12:00", "seg, qua, até 16:00", "Única · sex 20/11, até 17:00". */
  recorrenciaTexto: z.string(),
  /** Dia da ocorrência e o instante-limite (dia + horário-limite, em Manaus). */
  dia: diaDoCalendario,
  prazoEm: isoDate,
  situacao: situacaoDaOcorrenciaSchema,
  coluna: z.enum(colunasDoKanbanDeTarefas),
  automacao: automacaoDeTarefaSchema.nullable(),
  atalho: atalhoDeTarefaSchema.nullable(),
  exigeEvidencia: z.boolean(),
  exigeResultado: z.boolean(),
  instrucoes: z.array(z.object({ texto: z.string() })),
  conclusao: registro
    .extend({
      resultado: z.string().nullable(),
      evidencias: z.array(evidenciaDeTarefaSchema),
      checklist: z.array(z.object({ texto: z.string(), feito: z.boolean() })),
      /** Concluída pelo sistema (tarefa automática). */
      automatica: z.boolean(),
    })
    .nullable(),
  /** O que a pessoa pode fazer agora. `concluir` nunca vem numa automática. */
  acoesPermitidas: z.array(z.enum(acoesDaTarefa)),
});
export type OcorrenciaDeTarefa = z.infer<typeof ocorrenciaDeTarefaSchema>;

const contagem = z.number().int().nonnegative();
export const contagensDeTarefasSchema = z.object({
  /** Por período, com os filtros de empresa, responsável e categoria. */
  periodos: z.object({ hoje: contagem, semana: contagem, atrasadas: contagem, todas: contagem }),
  /** Do período escolhido, por coluna do Kanban. */
  colunas: z.object({ pendentes: contagem, atrasadas: contagem, concluidas: contagem }),
});

export const listarTarefasRespostaSchema = z.object({
  hoje: diaDoCalendario,
  itens: z.array(ocorrenciaDeTarefaSchema),
  /** "3 de 8 concluídas" do período escolhido. */
  progresso: z.object({ concluidas: contagem, total: contagem }),
  contagens: contagensDeTarefasSchema,
});
export type ListarTarefasResposta = z.infer<typeof listarTarefasRespostaSchema>;

/** A tarefa (definição), devolvida ao criar e ao encerrar. */
export const tarefaSchema = z.object({
  id: uuid,
  departamento: departamentoComTarefasSchema,
  titulo: z.string(),
  categoria: z.string().nullable(),
  empresa: empresaDaTarefaSchema,
  responsavel: pessoa,
  substituto: pessoa.nullable(),
  tipo: tipoDeTarefaSchema,
  origem: origemDaTarefaSchema,
  regra: regraDeRecorrenciaSchema.nullable(),
  /** Única: o dia. Recorrente: o início. */
  dia: diaDoCalendario,
  horarioLimite: z.string(),
  recorrenciaTexto: z.string(),
  exigeEvidencia: z.boolean(),
  exigeResultado: z.boolean(),
  instrucoes: z.array(z.object({ texto: z.string() })),
  automacao: automacaoDeTarefaSchema.nullable(),
  atalho: atalhoDeTarefaSchema.nullable(),
  /** As próximas ocorrências, de hoje em diante (até 5). */
  proximas: z.array(diaDoCalendario),
  criada: registro,
  encerrada: registro.extend({ motivo: z.string() }).nullable(),
});
export type Tarefa = z.infer<typeof tarefaSchema>;

/** Menus do modal e dos filtros: pessoas ativas do departamento e as categorias já usadas nele. */
export const opcoesDeTarefasRespostaSchema = z.object({
  pessoas: z.array(pessoa),
  categorias: z.array(z.string()),
  podeCriar: z.boolean(),
});
export type OpcoesDeTarefasResposta = z.infer<typeof opcoesDeTarefasRespostaSchema>;

// ---------------------------------------------------------------- regras puras (web e API)

const DIA_MS = 86_400_000;
const NOMES_DOS_DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** Dia da semana de AAAA-MM-DD (0 = domingo), sem fuso: o dia já é de Manaus. */
export function diaDaSemanaDe(dia: string): number {
  const [a, m, d] = dia.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

export function somarDias(dia: string, quantos: number): string {
  const [a, m, d] = dia.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(a, m - 1, d) + quantos * DIA_MS).toISOString().slice(0, 10);
}

/** Feriado conta como dia útil: de segunda a sexta. */
export const ehDiaUtilDaTarefa = (dia: string): boolean => {
  const semana = diaDaSemanaDe(dia);
  return semana >= 1 && semana <= 5;
};

function primeiroDiaUtilDoMes(dia: string): string {
  let cursor = `${dia.slice(0, 8)}01`;
  while (!ehDiaUtilDaTarefa(cursor)) cursor = somarDias(cursor, 1);
  return cursor;
}

/** Se a regra cai no dia. A prévia do modal usa `proximasOcorrencias` direto, sem chamar a API. */
export function caiNoDia(regra: RegraDeRecorrencia, dia: string): boolean {
  switch (regra.recorrencia) {
    case "dia_util": return ehDiaUtilDaTarefa(dia);
    case "dias_da_semana": return regra.dias.includes(diaDaSemanaDe(dia));
    case "mensal_dia": return Number(dia.slice(8, 10)) === regra.dia;
    case "mensal_primeiro_dia_util": return primeiroDiaUtilDoMes(dia) === dia;
  }
}

/** As próximas `quantidade` ocorrências da regra a partir de `inicio` (inclusive), até `ate` se houver. */
export function proximasOcorrencias(regra: RegraDeRecorrencia, inicio: string, quantidade: number, ate?: string): string[] {
  const dias: string[] = [];
  let cursor = inicio;
  // Um ano e pouco cobre qualquer regra (a mensal cai pelo menos uma vez por mês).
  for (let k = 0; k < 400 && dias.length < quantidade && (!ate || cursor <= ate); k += 1) {
    if (caiNoDia(regra, cursor)) dias.push(cursor);
    cursor = somarDias(cursor, 1);
  }
  return dias;
}

const curta = (dia: string) => `${NOMES_DOS_DIAS[diaDaSemanaDe(dia)]} ${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

/** "Todo dia útil, até 12:00", "seg, qua, até 16:00", "Todo dia 5 do mês, até 10:00", "Única · sex 20/11, até 17:00". */
export function textoDaRecorrencia(tarefa: { tipo: TipoDeTarefa; regra: RegraDeRecorrencia | null; dia: string; horarioLimite: string }): string {
  const ate = `até ${tarefa.horarioLimite}`;
  if (tarefa.tipo === "unica" || !tarefa.regra) return `Única · ${curta(tarefa.dia)}, ${ate}`;
  switch (tarefa.regra.recorrencia) {
    case "dia_util": return `Todo dia útil, ${ate}`;
    case "dias_da_semana": return `${[...tarefa.regra.dias].sort().map((d) => NOMES_DOS_DIAS[d]).join(", ")}, ${ate}`;
    case "mensal_dia": return `Todo dia ${tarefa.regra.dia} do mês, ${ate}`;
    case "mensal_primeiro_dia_util": return `1º dia útil do mês, ${ate}`;
  }
}

/** Segunda e domingo da semana de `dia`. */
export function semanaDe(dia: string): { inicio: string; fim: string } {
  const recuo = (diaDaSemanaDe(dia) + 6) % 7;
  const inicio = somarDias(dia, -recuo);
  return { inicio, fim: somarDias(inicio, 6) };
}
