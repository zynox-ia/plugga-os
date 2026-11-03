import { z } from "zod";

import {
  cepOpcional,
  clientContactInputSchema,
  clientContactSchema,
  clientPersonTypeSchema,
  emailOpcional,
  documentoOpcional,
  origemOpcional,
  problemasDoCadastro,
  telefoneOpcional,
  textoOpcional,
  ufOpcional,
  type ClientContactInput,
} from "./clients.js";
import { companyKeySchema } from "./organization.js";
import { decimalString, isoDate, uuid } from "./primitivas.js";

/**
 * Negócios no quadro do pipeline (PLU-271). O negócio herda a empresa do
 * pipeline em que está; Ganho e Perdido são desfechos que o encerram, não
 * etapas. Datas de calendário (previsão, revisita) são texto AAAA-MM-DD.
 *
 * Desde a PLU-271/Fatia 1, o lead tem dados próprios (não um Client): só vira
 * cliente por conversão, explícita ou automática por documento. `clientId` é
 * opcional em todo o ciclo de vida do negócio aberto.
 */

export const dealStatuses = ["open", "won", "lost"] as const;
export const dealStatusSchema = z.enum(dealStatuses);
export type DealStatus = z.infer<typeof dealStatusSchema>;
export const dealPriorities = ["urgente", "medio", "normal"] as const;
export const dealPrioritySchema = z.enum(dealPriorities);
export type DealPriority = z.infer<typeof dealPrioritySchema>;
export const setDealPriorityRequestSchema = z.object({ priority: dealPrioritySchema.nullable() }).strict();
export type SetDealPriorityRequest = z.infer<typeof setDealPriorityRequestSchema>;

const vazioViraNulo = (valor: unknown) => (typeof valor === "string" && valor.trim() === "" ? null : valor);

const dataDoCalendario = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "use o formato AAAA-MM-DD")
  .refine((v) => !Number.isNaN(new Date(`${v}T12:00:00Z`).getTime()) && new Date(`${v}T12:00:00Z`).toISOString().startsWith(v), "data inválida");
const dataOpcional = z.preprocess(vazioViraNulo, dataDoCalendario.nullable()).optional();
const valorOpcional = z.preprocess(vazioViraNulo, decimalString.nullable()).optional();

// --------------------------------------------------------------------- lead

/** Campos próprios do lead (PF ou PJ), sem vínculo com cadastro de cliente. */
const camposDoLead = {
  personType: clientPersonTypeSchema,
  name: z.string().trim().min(1, "informe o nome").max(150),
  legalName: textoOpcional(200),
  document: documentoOpcional,
  phone: telefoneOpcional,
  email: emailOpcional,
  postalCode: cepOpcional,
  street: textoOpcional(200),
  addressComplement: textoOpcional(100),
  district: textoOpcional(100),
  city: textoOpcional(100),
  state: ufOpcional,
  origin: origemOpcional,
  notes: textoOpcional(2000),
};

export const leadProfileInputSchema = z.object(camposDoLead).strict();
export type LeadProfileInput = z.infer<typeof leadProfileInputSchema>;

/** Edição parcial: `undefined` mantém, `null` apaga. As regras cruzadas rodam na API depois de mesclar. */
export const updateLeadProfileRequestSchema = z
  .object({ ...camposDoLead, personType: clientPersonTypeSchema.optional(), name: camposDoLead.name.optional() })
  .strict();
export type UpdateLeadProfileRequest = z.infer<typeof updateLeadProfileRequestSchema>;

export const leadProfileSchema = z.object({
  personType: clientPersonTypeSchema,
  name: z.string(),
  legalName: z.string().nullable(),
  document: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  postalCode: z.string().nullable(),
  street: z.string().nullable(),
  addressComplement: z.string().nullable(),
  district: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  origin: z.string().nullable(),
  notes: z.string().nullable(),
});
export type LeadProfile = z.infer<typeof leadProfileSchema>;

/** Contato do próprio lead: mesmo formato do contato de cliente (PLU-271). */
export const leadContactInputSchema = clientContactInputSchema;
export type LeadContactInput = ClientContactInput;
export const leadContactSchema = clientContactSchema;
export type LeadContact = z.infer<typeof leadContactSchema>;

// -------------------------------------------------------------- negócio

export const createDealRequestSchema = z
  .object({
    pipelineId: uuid,
    stageId: uuid,
    title: z.string().trim().min(1, "informe o título").max(120),
    priority: dealPrioritySchema.nullable().optional(),
    value: valorOpcional,
    expectedCloseDate: dataOpcional,
    ownerId: uuid,
    tagIds: z.array(uuid).max(20).default([]),
    /** Vincula a um cliente já cadastrado; sem isto, o negócio nasce só com o lead. */
    clientId: z.preprocess(vazioViraNulo, uuid.nullable()).optional(),
    lead: leadProfileInputSchema,
    /** Contato opcional do próprio lead; se informado, nasce já selecionado. */
    contact: clientContactInputSchema.nullable().optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    const problemas = problemasDoCadastro({ ...input.lead, temContatos: !!input.contact });
    for (const { campo, problema } of problemas) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["lead", campo], message: problema });
  });
export type CreateDealRequest = z.infer<typeof createDealRequestSchema>;

/** Edita dados do lead e, opcionalmente, substitui o contato selecionado. `undefined` mantém cada campo. */
export const updateLeadRequestSchema = z
  .object({
    /** Clientes legados podem omitir; o modal sempre envia a versão lida. */
    version: z.number().int().positive().optional(),
    lead: updateLeadProfileRequestSchema.optional(),
    contact: clientContactInputSchema.nullable().optional(),
    title: z.string().trim().min(1, "informe o título").max(120).optional(),
    value: z.preprocess(vazioViraNulo, decimalString.refine((v) => Number(v) < 1_000_000_000_000, "valor excede o limite de 12 dígitos inteiros").nullable()).optional(),
    expectedCloseDate: dataOpcional,
    ownerId: uuid.optional(),
    tagIds: z.array(uuid).max(20).transform((ids) => [...new Set(ids)]).optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.version === undefined && [input.title, input.value, input.expectedCloseDate, input.ownerId, input.tagIds].some((v) => v !== undefined)) {
      ctx.addIssue({ code: "custom", path: ["version"], message: "recarregue o negócio e informe a versão antes de editar dados comerciais" });
    }
  });
export type UpdateLeadRequest = z.infer<typeof updateLeadRequestSchema>;

export const moveDealStageRequestSchema = z.object({ stageId: uuid, beforeDealId: uuid.nullable().optional() }).strict();
export type MoveDealStageRequest = z.infer<typeof moveDealStageRequestSchema>;

/** Ganhar sempre pode converter o lead em cliente na mesma transação. */
export const winDealRequestSchema = z.object({ convertToClient: z.boolean().default(false) }).strict();
export type WinDealRequest = z.infer<typeof winDealRequestSchema>;

/** Perder exige o motivo; a data de revisita é exigida pela API quando o motivo pede. */
export const loseDealRequestSchema = z
  .object({
    lossReasonId: uuid,
    revisitOn: dataOpcional,
    note: z.preprocess(vazioViraNulo, z.string().trim().max(500).nullable()).optional(),
  })
  .strict();
export type LoseDealRequest = z.infer<typeof loseDealRequestSchema>;

/** Mover para outro pipeline. O responsável só é pedido se o atual não estiver na equipe do destino. */
export const transferDealRequestSchema = z
  .object({ pipelineId: uuid, stageId: uuid, ownerId: uuid.optional(), convertToClient: z.boolean().default(false) })
  .strict();
export type TransferDealRequest = z.infer<typeof transferDealRequestSchema>;

export const bulkDealsActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("owner"), ownerId: uuid }).strict(),
  z.object({ type: z.literal("tag"), tagId: uuid }).strict(),
  z.object({ type: z.literal("stage"), stageId: uuid }).strict(),
  z.object({ type: z.literal("priority"), priority: dealPrioritySchema.nullable() }).strict(),
]);
export type BulkDealsAction = z.infer<typeof bulkDealsActionSchema>;

export const bulkDealsRequestSchema = z.object({ dealIds: z.array(uuid).min(1).max(200), action: bulkDealsActionSchema }).strict();
export type BulkDealsRequest = z.infer<typeof bulkDealsRequestSchema>;

export const listDealsQuerySchema = z
  .object({ pipelineId: uuid, status: z.enum(["open", "won", "lost", "all"]).default("open") })
  .strict();
export type ListDealsQuery = z.infer<typeof listDealsQuerySchema>;

export const dealSchema = z.object({
  id: uuid,
  number: z.number().int().positive(),
  pipelineId: uuid,
  companyId: companyKeySchema,
  stageId: uuid,
  status: dealStatusSchema,
  priority: dealPrioritySchema.nullable(),
  title: z.string(),
  value: decimalString.nullable(),
  expectedCloseDate: z.string().nullable(),
  lead: leadProfileSchema,
  contact: leadContactSchema.nullable(),
  /** Só existe depois de uma conversão (manual, ao ganhar ou ao mudar de etapa/pipeline). */
  client: z.object({ id: uuid, name: z.string() }).nullable(),
  owner: z.object({ id: uuid, name: z.string() }),
  tags: z.array(z.object({ id: uuid, name: z.string(), color: z.string() })),
  /** Quando entrou na etapa atual: base dos "dias na etapa" e do alerta de parado. */
  stageEnteredAt: isoDate,
  closedAt: isoDate.nullable(),
  lossReason: z.string().nullable(),
  revisitOn: z.string().nullable(),
  createdAt: isoDate,
});
export type Deal = z.infer<typeof dealSchema>;

/** Detalhe relido do servidor; a versão também cobre perfil e contato próprios. */
export const dealDetailSchema = dealSchema.extend({ version: z.number().int().positive(), lossNote: z.string().nullable() });
export type DealDetail = z.infer<typeof dealDetailSchema>;
export const dealDetailsSchema = dealDetailSchema;
export type DealDetails = DealDetail;

const historyReferenceSchema = z.object({ id: uuid, name: z.string() });
export const dealHistoryValueSchema = z.union([
  z.string(), z.boolean(), z.null(), historyReferenceSchema, z.array(historyReferenceSchema),
]);
export type DealHistoryValue = z.infer<typeof dealHistoryValueSchema>;
export const dealHistoryEntrySchema = z.object({
  id: uuid,
  kind: z.enum(["created", "stage_changed", "priority_changed", "document_added", "document_archived", "client_converted", "won", "lost", "transferred", "field_changed"]),
  occurredAt: isoDate,
  actor: historyReferenceSchema.nullable(),
  field: z.string().nullable(),
  before: dealHistoryValueSchema,
  after: dealHistoryValueSchema,
  fromStageName: z.string().nullable(),
  toStageName: z.string().nullable(),
  fromPipelineName: z.string().nullable(),
  toPipelineName: z.string().nullable(),
  fromPriority: dealPrioritySchema.nullable(),
  toPriority: dealPrioritySchema.nullable(),
});
export type DealHistoryEntry = z.infer<typeof dealHistoryEntrySchema>;
export const listDealHistoryQuerySchema = z.object({
  cursor: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
}).strict();
export type ListDealHistoryQuery = z.infer<typeof listDealHistoryQuerySchema>;
export const listDealHistoryResponseSchema = z.object({ entries: z.array(dealHistoryEntrySchema), nextCursor: uuid.nullable() });
export type ListDealHistoryResponse = z.infer<typeof listDealHistoryResponseSchema>;

export const listDealsResponseSchema = z.object({ deals: z.array(dealSchema) });
export type ListDealsResponse = z.infer<typeof listDealsResponseSchema>;

/** O que a conversão oferece pra API decidir entre ambíguos, quando o lead não tem documento. */
export const convertLeadRequestSchema = z
  .object({
    resolution: z
      .discriminatedUnion("type", [
        z.object({ type: z.literal("link"), clientId: uuid }).strict(),
        z.object({ type: z.literal("create") }).strict(),
      ])
      .optional(),
  })
  .strict();
export type ConvertLeadRequest = z.infer<typeof convertLeadRequestSchema>;

export const convertLeadResponseSchema = z.object({
  lead: dealSchema,
  client: z.object({ id: uuid, name: z.string() }),
  /** `false` quando vinculou a um cliente já existente, em vez de criar um novo. */
  created: z.boolean(),
});
export type ConvertLeadResponse = z.infer<typeof convertLeadResponseSchema>;

/** O que o formulário do negócio oferece quando o lead já foi vinculado a um cliente: os contatos dele. */
export const dealClientOptionsResponseSchema = z.object({
  contacts: z.array(z.object({ id: uuid, name: z.string(), isPrimary: z.boolean() })),
});
export type DealClientOptionsResponse = z.infer<typeof dealClientOptionsResponseSchema>;
