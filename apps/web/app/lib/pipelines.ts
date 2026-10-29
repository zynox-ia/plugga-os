import {
  coresDePipeline,
  pipelineParaEdicao,
  type CompanyKey,
  type CreatePipelineRequest,
  type Pipeline,
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
type ComChave<T> = T & { chave: string };

export type Rascunho = Omit<UpdatePipelineRequest, "stages" | "tags" | "lossReasons" | "updatedAt"> & {
  /** null: pipeline novo, ainda não gravado. */
  id: string | null;
  updatedAt: string | null;
  stages: ComChave<UpdatePipelineRequest["stages"][number]>[];
  tags: ComChave<UpdatePipelineRequest["tags"][number]>[];
  lossReasons: ComChave<UpdatePipelineRequest["lossReasons"][number]>[];
};

let sequencia = 0;
export const novaChave = () => `novo-${++sequencia}`;

const comChave = <T extends { id?: string }>(itens: T[]): ComChave<T>[] => itens.map((item) => ({ ...item, chave: item.id ?? novaChave() }));

export function rascunhoDe(pipeline: Pipeline): Rascunho {
  const edicao = pipelineParaEdicao(pipeline);
  return {
    ...edicao,
    id: pipeline.id,
    stages: comChave(edicao.stages),
    tags: comChave(edicao.tags),
    lossReasons: comChave(edicao.lossReasons),
  };
}

/** Ponto de partida de um pipeline novo: etapas genéricas e os motivos de perda que o time já usa no Bitrix. */
export function rascunhoNovo(empresa: CompanyKey): Rascunho {
  return {
    id: null,
    updatedAt: null,
    companyId: empresa,
    name: "",
    description: null,
    valueLabel: "Valor",
    color: "#0077FF",
    wonLabel: "Ganho",
    lostLabel: "Perdido",
    stageDestinations: {},
    stages: comChave<UpdatePipelineRequest["stages"][number]>([
      { name: "Iniciar atendimento", color: "#94A3B8", staleAfterDays: 5 },
      { name: "Qualificação", color: "#00A3FF", staleAfterDays: 7 },
      { name: "Proposta", color: "#7C5CFF", staleAfterDays: 10 },
      { name: "Negociação", color: "#F5A524", staleAfterDays: 7 },
    ]),
    tags: [],
    lossReasons: comChave<UpdatePipelineRequest["lossReasons"][number]>(
      [
        "Fechou com concorrente",
        "Preço ou condição comercial",
        "Sem crédito ou financeiro",
        "Sem viabilidade técnica",
        "Sem documentação ou fatura",
        "Sem retorno",
        "Prazo inadequado",
        "Desistiu do projeto",
      ].map((name) => ({ name, asksRevisitDate: name === "Prazo inadequado" })),
    ),
    members: [],
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
    stages: rascunho.stages.map(({ id, name, color, staleAfterDays }) => ({ id, name, color, staleAfterDays })),
    tags: rascunho.tags.map(({ id, name, color }) => ({ id, name, color })),
    lossReasons: rascunho.lossReasons.map(({ id, name, asksRevisitDate }) => ({ id, name, asksRevisitDate })),
    members: [],
  };
}

export function paraEdicao(rascunho: Rascunho, updatedAt: string): UpdatePipelineRequest {
  return { ...paraCriacao(rascunho), updatedAt, stageDestinations: rascunho.stageDestinations };
}

/** Compara o que vai para a API: a chave local não conta. */
export function mesmoConteudo(a: Rascunho, b: Rascunho): boolean {
  return JSON.stringify(paraCriacao(a)) === JSON.stringify(paraCriacao(b));
}

export function hrefDoPipeline(id: string | null): string {
  return id ? `/comercial/pipelines?pipeline=${encodeURIComponent(id)}` : "/comercial/pipelines";
}
