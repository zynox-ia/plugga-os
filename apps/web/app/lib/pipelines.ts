import {
  coresDePipeline,
  pipelineParaEdicao,
  type CompanyKey,
  type CreatePipelineRequest,
  type Pipeline,
  type PipelineFieldInput,
  type UpdatePipelineRequest,
} from "@plugga/shared";

/** Nome de cada cor da paleta, para leitor de tela e para o seletor. */
export const NOME_DA_COR: Record<(typeof coresDePipeline)[number], string> = {
  "#0077FF": "Azul",
  "#00A3FF": "Céu",
  "#7C5CFF": "Violeta",
  "#0B7A57": "Verde",
  "#18A957": "Verde-claro",
  "#F5A524": "Âmbar",
  "#E5484D": "Vermelho",
  "#94A3B8": "Cinza",
};
export const CORES = coresDePipeline;

/** Item de lista ainda sem id ganha uma chave local, só para o React. */
export type ComChave<T> = T & { chave: string };

export type Rascunho = Omit<UpdatePipelineRequest, "stages" | "tags" | "lossReasons" | "updatedAt" | "fields"> & {
  /** null: pipeline novo, ainda não gravado. */
  id: string | null;
  updatedAt: string | null;
  stages: ComChave<UpdatePipelineRequest["stages"][number]>[];
  tags: ComChave<UpdatePipelineRequest["tags"][number]>[];
  lossReasons: ComChave<UpdatePipelineRequest["lossReasons"][number]>[];
  fields: ComChave<PipelineFieldInput & { valueCount?: number }>[];
};

let sequencia = 0;
export const novaChave = () => `novo-${++sequencia}`;

export const comChave = <T extends { id?: string }>(itens: T[]): ComChave<T>[] =>
  itens.map((item) => ({ ...item, chave: item.id ?? novaChave() }));

export function rascunhoDe(pipeline: Pipeline): Rascunho {
  const edicao = pipelineParaEdicao(pipeline);
  return {
    ...edicao,
    id: pipeline.id,
    stages: comChave(edicao.stages),
    tags: comChave(edicao.tags),
    lossReasons: comChave(edicao.lossReasons),
    fields: comChave((edicao.fields ?? []).map((field) => ({ ...field, valueCount: pipeline.fields?.find((item) => item.id === field.id)?.valueCount ?? 0 }))),
    confirmedFieldRemovals: [],
  };
}

export const carregarPipeline = rascunhoDe;

/** Rascunho inicial de um pipeline novo, com sugestões de etapas e motivos. */
export function rascunhoNovo(empresa: CompanyKey): Rascunho {
  return {
    id: null,
    updatedAt: null,
    companyId: empresa,
    name: "",
    description: null,
    valueLabel: "Investimento estimado",
    color: "#0077FF",
    wonLabel: "Ganho",
    lostLabel: "Perdido",
    stageDestinations: {},
    stages: comChave<UpdatePipelineRequest["stages"][number]>([
      { name: "Iniciar atendimento", color: "#94A3B8", staleAfterDays: 5, asksClientConversion: false },
      { name: "Qualificação", color: "#00A3FF", staleAfterDays: 7, asksClientConversion: false },
      { name: "Proposta", color: "#7C5CFF", staleAfterDays: 10, asksClientConversion: false },
      { name: "Negociação", color: "#F5A524", staleAfterDays: 7, asksClientConversion: false },
    ]),
    tags: [],
    lossReasons: comChave<UpdatePipelineRequest["lossReasons"][number]>([
      { name: "Preço fora do orçamento", asksRevisitDate: false },
      { name: "Optou por concorrente", asksRevisitDate: false },
      { name: "Sem retorno / desistiu", asksRevisitDate: true },
      { name: "Inviabilidade técnica da UC", asksRevisitDate: false },
    ]),
    members: [],
    fields: [],
    confirmedFieldRemovals: [],
  };
}

export function paraCriacao(rascunho: Rascunho): CreatePipelineRequest {
  return {
    companyId: rascunho.companyId,
    name: rascunho.name,
    description: rascunho.description,
    valueLabel: rascunho.valueLabel,
    color: rascunho.color,
    wonLabel: rascunho.wonLabel,
    lostLabel: rascunho.lostLabel,
    stages: rascunho.stages.map(({ id, name, color, staleAfterDays, asksClientConversion }) => ({
      id,
      name,
      color,
      staleAfterDays,
      asksClientConversion,
    })),
    tags: rascunho.tags.map(({ id, name, color }) => ({ id, name, color })),
    lossReasons: rascunho.lossReasons.map(({ id, name, asksRevisitDate }) => ({ id, name, asksRevisitDate })),
    members: [],
    fields: rascunho.fields.map(({ id, name, type, options, showOnCard, showInList }) => ({ id, name, type, options: options?.map(({ id, name }) => ({ id, name })), showOnCard, showInList })),
  };
}

export function paraEdicao(rascunho: Rascunho, updatedAt: string): UpdatePipelineRequest {
  return {
    ...paraCriacao(rascunho),
    updatedAt,
    stageDestinations: rascunho.stageDestinations,
    confirmedFieldRemovals: rascunho.confirmedFieldRemovals ?? [],
  };
}

export function mesmoConteudo(a: Rascunho, b: Rascunho): boolean {
  return JSON.stringify(paraCriacao(a)) === JSON.stringify(paraCriacao(b));
}

export function mesclarPipelineAtual(lista: Pipeline[], atual: Pipeline): Pipeline[] {
  return lista.map((pipeline) => pipeline.id === atual.id ? atual : pipeline);
}

/** Revalida apenas metadados de uso; definições, campos novos e versão continuam no rascunho. */
export function conferirCamposAntesDeSalvar(original: Rascunho, rascunho: Rascunho, atual: Pipeline) {
  if (atual.updatedAt !== rascunho.updatedAt) return { conflito: true as const };
  const presentes = new Set(rascunho.fields.map((campo) => campo.id));
  const confirmados = new Set(rascunho.confirmedFieldRemovals ?? []);
  const removidos = (atual.fields ?? []).filter((campo) => {
    const anterior = original.fields.find((item) => item.id === campo.id);
    return anterior && !presentes.has(campo.id) && campo.valueCount > 0
      && (!confirmados.has(campo.id) || campo.valueCount !== anterior.valueCount);
  });
  const atualizarContagens = (anterior: Rascunho): Rascunho => ({
    ...anterior,
    fields: anterior.fields.map((campo) => campo.id
      ? { ...campo, valueCount: atual.fields?.find((item) => item.id === campo.id)?.valueCount ?? 0 }
      : campo),
  });
  return {
    conflito: false as const,
    original: atualizarContagens(original),
    rascunho: {
      ...atualizarContagens(rascunho),
      confirmedFieldRemovals: [...confirmados].filter((id) => !removidos.some((campo) => campo.id === id)),
    },
    removidos,
  };
}

export function hrefDoPipeline(id: string | null): string {
  return id ? `/comercial/pipelines?pipeline=${encodeURIComponent(id)}` : "/comercial/pipelines";
}
