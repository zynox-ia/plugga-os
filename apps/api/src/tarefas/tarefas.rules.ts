import {
  caiNoDia,
  departamentosComTarefas,
  semanaDe,
  somarDias,
  type Acesso,
  type AcaoDaTarefa,
  type ColunaDoKanbanDeTarefas,
  type DepartamentoComTarefas,
  type PeriodoDeTarefas,
  type RegraDeRecorrencia,
  type SituacaoDaOcorrencia,
  type TipoDeTarefa,
} from "@plugga/shared";

import { RequisicaoInvalida } from "../common/errors/dominio";
import { diaEmManaus, inicioDoDiaEmManaus } from "../compras/dias-uteis";

/**
 * Regras das Tarefas (PLU-349, PLU-340), puras: geração das ocorrências por
 * dia, situação pelo prazo, períodos, Kanban e quem pode o quê.
 */

/** Portão de cada departamento: a chave do ConfigService, ou nulo se não há portão. */
export const PORTAO_DO_DEPARTAMENTO: Record<DepartamentoComTarefas, "FINANCEIRO_LIGADO" | "ENGENHARIA_LIGADA" | null> = {
  financeiro: "FINANCEIRO_LIGADO",
  "engenharia-obras": "ENGENHARIA_LIGADA",
  "energia-opm": null,
};

/** Os departamentos com o portão aberto; portão sem valor conta como fechado. */
export function departamentosLigados(lerPortao: (portao: "FINANCEIRO_LIGADO" | "ENGENHARIA_LIGADA") => boolean | undefined): DepartamentoComTarefas[] {
  return departamentosComTarefas.filter((departamento) => {
    const portao = PORTAO_DO_DEPARTAMENTO[departamento];
    return portao === null || lerPortao(portao) === true;
  });
}

/** Quem é do departamento: alguma tela dele, ou a plataforma (a mesma regra do RLS). */
export function noDepartamento(acesso: Acesso | undefined, departamento: DepartamentoComTarefas): boolean {
  if (!acesso) return false;
  if (acesso.plataforma !== null) return true;
  return acesso.departamentos.some((d) => d.departamento === departamento && (d.telas === undefined || d.telas.length > 0));
}

export function gerenteDoDepartamento(acesso: Acesso | undefined, departamento: DepartamentoComTarefas): boolean {
  if (!acesso) return false;
  return acesso.plataforma !== null || acesso.departamentos.some((d) => d.departamento === departamento && d.nivel === "gerente");
}

const MS_POR_MINUTO = 60_000;

/** O instante-limite da ocorrência: o dia às `horario`, em Manaus (UTC-4, sem horário de verão). */
export function prazoDaOcorrencia(dia: string, horario: string): Date {
  const [hora, minuto] = horario.split(":").map(Number) as [number, number];
  return new Date(inicioDoDiaEmManaus(dia).getTime() + (hora * 60 + minuto) * MS_POR_MINUTO);
}

export type TarefaParaGerar = {
  tipo: TipoDeTarefa;
  regra: RegraDeRecorrencia | null;
  /** Única: o dia. Recorrente: o início. */
  dia: string;
  /** Último dia já gerado, ou nulo. */
  geradaAte: string | null;
  encerrada: boolean;
};

/**
 * Os dias que faltam gerar até `ate` (inclusive). A única tem um só dia; a
 * recorrente, cada dia em que a regra cai, a partir do início ou do dia seguinte
 * ao último gerado. Encerrada não gera mais.
 */
export function diasParaGerar(tarefa: TarefaParaGerar, ate: string): string[] {
  if (tarefa.encerrada) return [];
  const desde = tarefa.geradaAte && tarefa.geradaAte >= tarefa.dia ? somarDias(tarefa.geradaAte, 1) : tarefa.dia;
  if (desde > ate) return [];
  if (tarefa.tipo === "unica" || !tarefa.regra) return tarefa.dia >= desde && tarefa.dia <= ate ? [tarefa.dia] : [];
  const dias: string[] = [];
  for (let cursor = desde; cursor <= ate; cursor = somarDias(cursor, 1)) {
    if (caiNoDia(tarefa.regra, cursor)) dias.push(cursor);
  }
  return dias;
}

export type OcorrenciaParaSituacao = { dia: string; prazoEm: Date; concluidaEm: Date | null };

/** Concluída; atrasada depois do horário-limite; vence hoje; ou no prazo. */
export function situacaoDaOcorrencia(o: OcorrenciaParaSituacao, agora: Date): SituacaoDaOcorrencia {
  if (o.concluidaEm) return "concluida";
  if (agora.getTime() > o.prazoEm.getTime()) return "atrasada";
  return o.dia === diaEmManaus(agora) ? "vence_hoje" : "no_prazo";
}

export function colunaDaSituacao(situacao: SituacaoDaOcorrencia): ColunaDoKanbanDeTarefas {
  return situacao === "concluida" ? "concluidas" : situacao === "atrasada" ? "atrasadas" : "pendentes";
}

/** Hoje e Esta semana incluem as atrasadas; Todas é tudo até o fim da semana. */
export function noPeriodo(periodo: PeriodoDeTarefas, dia: string, situacao: SituacaoDaOcorrencia, hoje: string): boolean {
  if (periodo === "atrasadas") return situacao === "atrasada";
  if (periodo === "todas") return true;
  if (situacao === "atrasada") return true;
  if (periodo === "hoje") return dia === hoje;
  const semana = semanaDe(hoje);
  return dia >= semana.inicio && dia <= semana.fim;
}

export type ContextoDaAcao = {
  departamento: DepartamentoComTarefas;
  acesso: Acesso | undefined;
  principalId: string;
  hoje: string;
  tarefa: { origem: "criada" | "do_departamento"; criadoPorId: string | null; encerrada: boolean; automacao: string | null };
  ocorrencia?: { dia: string; concluida: boolean; cancelada: boolean };
};

/**
 * Concluir: quem é do departamento, numa ocorrência de hoje ou de antes, nunca
 * numa automática. Encerrar: o gerente (ou a plataforma) sempre; quem criou, se a
 * tarefa é criada pela tela.
 */
export function acoesPermitidas(c: ContextoDaAcao): AcaoDaTarefa[] {
  if (!noDepartamento(c.acesso, c.departamento)) return [];
  const acoes: AcaoDaTarefa[] = [];
  const o = c.ocorrencia;
  if (o && !o.concluida && !o.cancelada && c.tarefa.automacao === null && o.dia <= c.hoje) acoes.push("concluir");
  const gerente = gerenteDoDepartamento(c.acesso, c.departamento);
  if (!c.tarefa.encerrada && (gerente || (c.tarefa.origem === "criada" && c.tarefa.criadoPorId === c.principalId))) acoes.push("encerrar");
  return acoes;
}

/** O que a conclusão precisa trazer. */
export function conferirConclusao(
  exige: { evidencia: boolean; resultado: boolean; instrucoes: number },
  dados: { resultado: string | null | undefined; temEvidencia: boolean; checklist: number[] | undefined },
): void {
  if (exige.resultado && !dados.resultado) throw new RequisicaoInvalida("Descreva o resultado.", [{ campo: "resultado", problema: "Esta tarefa pede o resultado." }]);
  if (exige.evidencia && !dados.temEvidencia) throw new RequisicaoInvalida("Anexe a evidência.", [{ campo: "evidencia", problema: "Esta tarefa pede a evidência." }]);
  if ((dados.checklist ?? []).some((i) => i >= exige.instrucoes)) {
    throw new RequisicaoInvalida("O checklist não confere com as instruções da tarefa.", [{ campo: "checklist", problema: "Marque só os itens da tarefa." }]);
  }
}

/** Marca por instrução, na ordem. */
export const marcasDoChecklist = (instrucoes: number, marcados: number[] | undefined): boolean[] =>
  Array.from({ length: instrucoes }, (_, i) => (marcados ?? []).includes(i));
