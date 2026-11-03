import { parseDate } from "../components/ui/date-value.ts";

export const COLUNAS_TAREFAS = [
  { id: "todo", titulo: "A fazer" },
  { id: "doing", titulo: "Em andamento" },
  { id: "done", titulo: "Concluído" },
] as const;
export const PRIORIDADES_TAREFAS = [
  { id: "normal", titulo: "Normal" },
  { id: "medio", titulo: "Médio" },
  { id: "urgente", titulo: "Urgente" },
] as const;
export type StatusTarefa = typeof COLUNAS_TAREFAS[number]["id"];
export type PrioridadeTarefa = typeof PRIORIDADES_TAREFAS[number]["id"];
export type DadosTarefa = {
  titulo: string;
  descricao: string;
  responsavelId: string;
  dataInicio: string;
  dataFim: string;
  prioridade: PrioridadeTarefa;
  status: StatusTarefa;
};
export type TarefaDoLead = DadosTarefa & { id: string };
export type ErrosTarefa = Partial<Record<keyof DadosTarefa, string>>;

export function validarTarefa(dados: DadosTarefa, responsaveis: readonly string[]): ErrosTarefa {
  const erros: ErrosTarefa = {};
  if (!dados.titulo.trim()) erros.titulo = "Informe o título da tarefa.";
  else if (dados.titulo.trim().length > 120) erros.titulo = "Use até 120 caracteres.";
  if (dados.descricao.trim().length > 2000) erros.descricao = "Use até 2.000 caracteres.";
  if (!responsaveis.includes(dados.responsavelId)) erros.responsavelId = "Selecione um responsável.";
  if (!parseDate(dados.dataInicio)) erros.dataInicio = "Informe uma data de início válida.";
  if (dados.dataFim && !parseDate(dados.dataFim)) erros.dataFim = "Informe uma data de fim válida.";
  else if (!erros.dataInicio && dados.dataFim && dados.dataFim < dados.dataInicio) erros.dataFim = "A data de fim não pode ser anterior ao início.";
  return erros;
}

export function normalizarTarefa(dados: DadosTarefa): DadosTarefa {
  return { ...dados, titulo: dados.titulo.trim(), descricao: dados.descricao.trim() };
}

export function moverTarefa(tarefas: TarefaDoLead[], id: string, destino: string): TarefaDoLead[] {
  const coluna = COLUNAS_TAREFAS.find((item) => item.id === destino);
  if (!coluna) return tarefas;
  return tarefas.map((tarefa) => tarefa.id === id ? { ...tarefa, status: coluna.id } : tarefa);
}
