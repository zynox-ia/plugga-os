import { z } from "zod";

import { isoDate, uuid } from "./primitivas.js";

const id = uuid.transform((value) => value.toLowerCase());
const reference = z.object({ fieldId: id }).strict();

/** Papéis fixos do processo Solar; os nomes das etapas continuam editáveis. */
export const solarStageRoles = ["atendimento", "qualificacao", "proposta", "visita", "documentos", "validacaoKit"] as const;
export type SolarStageRole = (typeof solarStageRoles)[number];
export const SOLAR_STAGE_ROLE_LABELS: Record<SolarStageRole, string> = {
  atendimento: "Lead recebido/Atendimento", qualificacao: "Qualificação", proposta: "Cotações/Proposta",
  visita: "O.S de Visita Técnica", documentos: "Documentos/Gestão de Contratos", validacaoKit: "Validação do Kit",
};
const solarStages = z.object(Object.fromEntries(solarStageRoles.map((role) => [role, id])) as Record<SolarStageRole, typeof id>).strict();
/** Ativação operacional: tarefas, bloqueios e fechamento passam a valer juntos. */
export const solarProcessActivationSchema = z.object({
  stages: solarStages,
  activatedAt: isoDate,
  activatedById: id,
}).strict();
export type SolarProcessActivation = z.infer<typeof solarProcessActivationSchema>;

/** Associação de dados; a ativação (`activation`) é a única chave das regras do processo. */
export const pipelineProcessProfileSchema = z.object({
  key: z.literal("solar_commercial"),
  version: z.literal(1),
  bindings: z.object({
    installationType: z.object({
      fieldId: id,
      options: z.object({ residential: id, commercial: id, rural: id }).strict(),
    }).strict(),
    averageConsumptionKwh: reference,
    roofType: reference,
    availableAreaM2: reference,
    estimatedPowerKwp: reference,
  }).strict(),
  activation: solarProcessActivationSchema.optional(),
}).strict();
export type PipelineProcessProfile = z.infer<typeof pipelineProcessProfileSchema>;

export const SOLAR_UC_CODE_MAX_LENGTH = 80;
const uc = z.object({ code: z.string().trim().min(1, "informe a UC").max(SOLAR_UC_CODE_MAX_LENGTH) }).strict();
const normalize = (code: string) => code.toLocaleLowerCase("pt-BR");
/** Dados prospectivos do negócio; nenhum ID desta ficha é ConsumerUnit.id. */
export const dealSolarProjectSchema = z.object({
  principalUc: uc.nullable(),
  beneficiaryUcs: z.array(uc.extend({ id })),
  primaryEnergyBillDocumentId: id.nullable(),
}).strict().superRefine((project, ctx) => {
  const codes = new Set(project.principalUc ? [normalize(project.principalUc.code)] : []);
  const ids = new Set<string>();
  project.beneficiaryUcs.forEach((item, index) => {
    const code = normalize(item.code);
    if (codes.has(code)) ctx.addIssue({ code: "custom", path: ["beneficiaryUcs", index, "code"], message: "UC repetida nesta ficha" });
    if (ids.has(item.id)) ctx.addIssue({ code: "custom", path: ["beneficiaryUcs", index, "id"], message: "identificador repetido nesta ficha" });
    codes.add(code);
    ids.add(item.id);
  });
});
export type DealSolarProject = z.infer<typeof dealSolarProjectSchema>;

/** Tipos de instalação do projeto Solar no lead (aba Projetos). */
export const leadSolarInstallationTypeSchema = z.enum(["residential", "commercial", "rural"]);
export type LeadSolarInstallationType = z.infer<typeof leadSolarInstallationTypeSchema>;

/** Tipos de telhado / base do projeto Solar no lead. */
export const leadSolarRoofTypeSchema = z.enum([
  "metalico",
  "ceramico",
  "fibra",
  "cimento",
  "laje",
  "solo",
  "outro",
]);
export type LeadSolarRoofType = z.infer<typeof leadSolarRoofTypeSchema>;

function normalizarDecimalBr(valor: string) {
  const limpo = valor.trim().replace(/\s/g, "");
  return limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
}

const positiveDecimal = z.string().trim().transform(normalizarDecimalBr).pipe(
  z.string().regex(/^\d{1,12}(?:\.\d{1,3})?$/, "Informe um número válido."),
);

const money = z.string().trim().transform(normalizarDecimalBr).pipe(
  z.string().regex(/^\d{1,12}(?:\.\d{1,2})?$/, "Informe um valor em reais válido."),
);

const consumerUnitCode = z.string().trim().min(1, "informe a UC").max(SOLAR_UC_CODE_MAX_LENGTH);
const opcional = <T extends z.ZodTypeAny>(schema: T) => z.preprocess((value) => value === "" || value === undefined ? null : value, schema.nullable());
const beneficiaryUcs = z.array(z.object({ id, code: consumerUnitCode }).strict()).max(50);
/** UC principal e beneficiárias distintas, sem identificador repetido. */
function ucsDistintas(project: { consumerUnit: string; beneficiaryUcs: { id: string; code: string }[] }, ctx: z.RefinementCtx) {
  const codes = new Set([normalize(project.consumerUnit)]);
  const ids = new Set<string>();
  project.beneficiaryUcs.forEach((item, index) => {
    if (codes.has(normalize(item.code))) ctx.addIssue({ code: "custom", path: ["beneficiaryUcs", index, "code"], message: "UC repetida neste projeto" });
    if (ids.has(item.id)) ctx.addIssue({ code: "custom", path: ["beneficiaryUcs", index, "id"], message: "identificador repetido neste projeto" });
    codes.add(normalize(item.code)); ids.add(item.id);
  });
}

/**
 * Projeto Solar vinculado ao lead, listado só no modal (não cria card no Kanban).
 * Tipo de instalação, consumo e UC principal são obrigatórios; a conta de energia
 * é cobrada ao salvar a Qualificação. Telhado, área, potência e investimento
 * podem ser completados depois (PLU-313).
 */
export const leadSolarProjectSchema = z.object({
  id: id,
  installationType: leadSolarInstallationTypeSchema,
  averageConsumptionKwh: positiveDecimal,
  consumerUnit: consumerUnitCode,
  beneficiaryUcs: beneficiaryUcs.default([]),
  energyBillDocumentIds: z.array(id),
  roofType: opcional(leadSolarRoofTypeSchema),
  availableAreaM2: opcional(positiveDecimal),
  estimatedPowerKwp: opcional(positiveDecimal),
  estimatedInvestment: opcional(money),
  createdAt: isoDate,
  updatedAt: isoDate,
}).strict().superRefine(ucsDistintas);
export type LeadSolarProject = z.infer<typeof leadSolarProjectSchema>;

const projectFields = {
  installationType: leadSolarInstallationTypeSchema,
  averageConsumptionKwh: positiveDecimal,
  consumerUnit: consumerUnitCode,
  beneficiaryUcs: beneficiaryUcs.default([]),
  energyBillDocumentIds: z.array(id).default([]),
  roofType: opcional(leadSolarRoofTypeSchema).default(null),
  availableAreaM2: opcional(positiveDecimal).default(null),
  estimatedPowerKwp: opcional(positiveDecimal).default(null),
  estimatedInvestment: opcional(money).default(null),
};
/** `version` é a versão do negócio lida pela tela: edições concorrentes são recusadas. */
export const createLeadSolarProjectRequestSchema = z.object({
  ...projectFields,
  version: z.number().int().positive().optional(),
}).strict().superRefine(ucsDistintas);
export type CreateLeadSolarProjectRequest = z.infer<typeof createLeadSolarProjectRequestSchema>;

/** Mesmos campos da criação; a atualização substitui o projeto inteiro na ficha. */
export const updateLeadSolarProjectRequestSchema = createLeadSolarProjectRequestSchema;
export type UpdateLeadSolarProjectRequest = z.infer<typeof updateLeadSolarProjectRequestSchema>;

/** Os quatro dados que a Qualificação exige em pelo menos um projeto do lead. */
export function pendenciasDaQualificacao(projects: readonly Pick<LeadSolarProject, "installationType" | "averageConsumptionKwh" | "consumerUnit" | "energyBillDocumentIds">[]): string[] {
  if (projects.some((project) => project.installationType && Number(project.averageConsumptionKwh) > 0 && project.consumerUnit && project.energyBillDocumentIds.length > 0)) return [];
  if (!projects.length) return ["Cadastre um projeto com tipo de instalação, consumo médio, UC principal e conta de energia."];
  const pendencias: string[] = [];
  if (!projects.some((project) => Number(project.averageConsumptionKwh) > 0)) pendencias.push("Informe o consumo médio mensal (kWh) maior que zero.");
  if (!projects.some((project) => project.energyBillDocumentIds.length > 0)) pendencias.push("Anexe a conta de energia ao projeto.");
  return pendencias.length ? pendencias : ["Um mesmo projeto precisa reunir tipo de instalação, consumo, UC principal e conta de energia."];
}

export const listLeadSolarProjectsResponseSchema = z.object({
  projects: z.array(leadSolarProjectSchema),
}).strict();
export type ListLeadSolarProjectsResponse = z.infer<typeof listLeadSolarProjectsResponseSchema>;

export const leadSolarProjectResponseSchema = z.object({
  project: leadSolarProjectSchema,
  /** Salvar na Qualificação com os quatro dados avança o negócio para Cotações/Proposta. */
  advancedToProposal: z.boolean().default(false),
}).strict();
export type LeadSolarProjectResponse = z.infer<typeof leadSolarProjectResponseSchema>;
