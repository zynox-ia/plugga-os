import { z } from "zod";

import { companyKeySchema } from "./organization.js";
import { isoDate, uuid } from "./primitivas.js";

/**
 * Pipelines de venda configuráveis (PLU-269). Cada pipeline pertence a uma
 * empresa, e todo negócio dele herda essa empresa. Ganho e Perdido são
 * desfechos fixos, não etapas: o pipeline só escolhe como chamá-los.
 */

export const pipelineMemberRoles = ["vendedor", "gestor"] as const;
export const pipelineMemberRoleSchema = z.enum(pipelineMemberRoles);
export type PipelineMemberRole = z.infer<typeof pipelineMemberRoleSchema>;

/** Paleta oferecida na tela; a API aceita qualquer cor em hexadecimal. */
export const coresDePipeline = ["#0077FF", "#00A3FF", "#7C5CFF", "#0B7A57", "#18A957", "#F5A524", "#E5484D", "#94A3B8"] as const;

const cor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "cor inválida")
  .transform((valor) => valor.toUpperCase());
const nome = (max: number) => z.string().trim().min(1, "informe o nome").max(max);
const textoOpcional = (max: number) =>
  z.preprocess((valor) => (typeof valor === "string" && valor.trim() === "" ? null : valor), z.string().trim().max(max).nullable());

export const pipelineStageInputSchema = z
  .object({
    id: uuid.optional(),
    name: nome(60),
    color: cor,
    /** Dias na etapa a partir dos quais o card ganha o alerta de parado; null desliga. */
    staleAfterDays: z.number().int().min(1).max(365).nullable(),
  })
  .strict();
export type PipelineStageInput = z.infer<typeof pipelineStageInputSchema>;

export const pipelineTagInputSchema = z.object({ id: uuid.optional(), name: nome(40), color: cor }).strict();
export type PipelineTagInput = z.infer<typeof pipelineTagInputSchema>;

export const pipelineLossReasonInputSchema = z
  .object({ id: uuid.optional(), name: nome(80), asksRevisitDate: z.boolean() })
  .strict();
export type PipelineLossReasonInput = z.infer<typeof pipelineLossReasonInputSchema>;

export const pipelineMemberInputSchema = z.object({ userId: uuid, role: pipelineMemberRoleSchema }).strict();
export type PipelineMemberInput = z.infer<typeof pipelineMemberInputSchema>;

const camposDoPipeline = {
  companyId: companyKeySchema,
  name: nome(60),
  description: textoOpcional(500),
  valueLabel: nome(40),
  color: cor,
  wonLabel: nome(40),
  lostLabel: nome(40),
  stages: z.array(pipelineStageInputSchema).min(1, "o pipeline precisa de pelo menos uma etapa").max(20),
  tags: z.array(pipelineTagInputSchema).max(40),
  lossReasons: z.array(pipelineLossReasonInputSchema).max(40),
  members: z.array(pipelineMemberInputSchema).max(200),
};

type ConfiguracaoDoPipeline = z.infer<z.ZodObject<typeof camposDoPipeline>>;

const normalizar = (texto: string) => texto.trim().toLocaleLowerCase("pt-BR");

function repetidos(valores: string[]): number[] {
  const vistos = new Set<string>();
  const indices: number[] = [];
  valores.forEach((valor, i) => {
    if (vistos.has(valor)) indices.push(i);
    vistos.add(valor);
  });
  return indices;
}

/** Nomes repetidos numa lista do pipeline e pessoas repetidas na equipe. */
export function problemasDaConfiguracao(config: ConfiguracaoDoPipeline): { campo: (string | number)[]; problema: string }[] {
  const problemas: { campo: (string | number)[]; problema: string }[] = [];
  const listas = [
    ["stages", config.stages, "já existe uma etapa com este nome"],
    ["tags", config.tags, "já existe uma etiqueta com este nome"],
    ["lossReasons", config.lossReasons, "já existe um motivo com este nome"],
  ] as const;
  for (const [campo, itens, problema] of listas) {
    for (const i of repetidos(itens.map((item) => normalizar(item.name)))) problemas.push({ campo: [campo, i, "name"], problema });
  }
  for (const i of repetidos(config.members.map((membro) => membro.userId))) {
    problemas.push({ campo: ["members", i, "userId"], problema: "pessoa repetida na equipe" });
  }
  return problemas;
}

const comRegrasCruzadas = <T extends ConfiguracaoDoPipeline>(input: T, ctx: z.RefinementCtx) => {
  for (const { campo, problema } of problemasDaConfiguracao(input)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: campo, message: problema });
};

export const createPipelineRequestSchema = z.object(camposDoPipeline).strict().superRefine(comRegrasCruzadas);
export type CreatePipelineRequest = z.infer<typeof createPipelineRequestSchema>;

/**
 * Substitui a configuração inteira. Itens com `id` são mantidos (e editados); os
 * ausentes são excluídos; os sem `id` são criados. `updatedAt` é o que a tela
 * leu: se outra pessoa salvou depois, a API recusa em vez de sobrescrever.
 */
export const updatePipelineRequestSchema = z
  .object({
    ...camposDoPipeline,
    updatedAt: isoDate,
    /** Etapa excluída que tem negócios → etapa mantida (com id) que os recebe. */
    stageDestinations: z.record(uuid, uuid).default({}),
  })
  .strict()
  .superRefine(comRegrasCruzadas);
export type UpdatePipelineRequest = z.infer<typeof updatePipelineRequestSchema>;

export const pipelineStageSchema = z.object({
  id: uuid,
  name: z.string(),
  color: z.string(),
  position: z.number().int(),
  staleAfterDays: z.number().int().nullable(),
  /** Negócios na etapa, de qualquer situação: excluir a etapa exige escolher o destino deles. */
  dealCount: z.number().int(),
});
export type PipelineStage = z.infer<typeof pipelineStageSchema>;

export const pipelineSchema = z.object({
  id: uuid,
  companyId: companyKeySchema,
  name: z.string(),
  description: z.string().nullable(),
  valueLabel: z.string(),
  color: z.string(),
  wonLabel: z.string(),
  lostLabel: z.string(),
  archivedAt: isoDate.nullable(),
  updatedAt: isoDate,
  updatedBy: z.object({ id: uuid, name: z.string() }).nullable(),
  stages: z.array(pipelineStageSchema),
  tags: z.array(z.object({ id: uuid, name: z.string(), color: z.string() })),
  lossReasons: z.array(z.object({ id: uuid, name: z.string(), asksRevisitDate: z.boolean() })),
  members: z.array(z.object({ userId: uuid, name: z.string(), role: pipelineMemberRoleSchema })),
  /** Negócios do pipeline, de qualquer situação: com algum, a empresa não muda. */
  dealCount: z.number().int(),
  /** Se quem pediu pode alterar a configuração deste pipeline. */
  canConfigure: z.boolean(),
});
export type Pipeline = z.infer<typeof pipelineSchema>;

/** O pipeline lido, no formato que a edição devolve (sem o que só a API decide). */
export function pipelineParaEdicao(pipeline: Pipeline): UpdatePipelineRequest {
  return {
    companyId: pipeline.companyId,
    name: pipeline.name,
    description: pipeline.description,
    valueLabel: pipeline.valueLabel,
    color: pipeline.color,
    wonLabel: pipeline.wonLabel,
    lostLabel: pipeline.lostLabel,
    stages: pipeline.stages.map(({ id, name, color, staleAfterDays }) => ({ id, name, color, staleAfterDays })),
    tags: pipeline.tags.map(({ id, name, color }) => ({ id, name, color })),
    lossReasons: pipeline.lossReasons.map(({ id, name, asksRevisitDate }) => ({ id, name, asksRevisitDate })),
    members: pipeline.members.map(({ userId, role }) => ({ userId, role })),
    updatedAt: pipeline.updatedAt,
    stageDestinations: {},
  };
}

/** Pipelines que a pessoa alcança, arquivados inclusive (a tela decide onde mostrá-los). */
export const listPipelinesResponseSchema = z.object({
  pipelines: z.array(pipelineSchema),
  /** Empresas em que a pessoa pode criar pipeline (gerente do CRM ou admin: as duas). */
  canCreateIn: z.array(companyKeySchema),
});
export type ListPipelinesResponse = z.infer<typeof listPipelinesResponseSchema>;

export const pipelinePeopleQuerySchema = z.object({ companyId: companyKeySchema }).strict();
export type PipelinePeopleQuery = z.infer<typeof pipelinePeopleQuerySchema>;

/** Quem pode entrar na equipe de um pipeline: pessoas ativas do CRM. */
export const pipelinePeopleResponseSchema = z.object({ people: z.array(z.object({ id: uuid, name: z.string() })) });
export type PipelinePeopleResponse = z.infer<typeof pipelinePeopleResponseSchema>;
