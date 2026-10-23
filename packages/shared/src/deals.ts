import { z } from "zod";

import { clientPersonTypeSchema } from "./clients.js";
import { companyKeySchema } from "./organization.js";
import { decimalString, isoDate, uuid } from "./primitivas.js";

/**
 * Negócios no quadro do pipeline (PLU-271). O negócio herda a empresa do
 * pipeline em que está; Ganho e Perdido são desfechos que o encerram, não
 * etapas. Datas de calendário (previsão, revisita) são texto AAAA-MM-DD.
 */

export const dealStatuses = ["open", "won", "lost"] as const;
export const dealStatusSchema = z.enum(dealStatuses);
export type DealStatus = z.infer<typeof dealStatusSchema>;

const vazioViraNulo = (valor: unknown) => (typeof valor === "string" && valor.trim() === "" ? null : valor);

const dataDoCalendario = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "use o formato AAAA-MM-DD")
  .refine((v) => !Number.isNaN(new Date(`${v}T12:00:00Z`).getTime()) && new Date(`${v}T12:00:00Z`).toISOString().startsWith(v), "data inválida");
const dataOpcional = z.preprocess(vazioViraNulo, dataDoCalendario.nullable()).optional();
const valorOpcional = z.preprocess(vazioViraNulo, decimalString.nullable()).optional();

export const createDealRequestSchema = z
  .object({
    pipelineId: uuid,
    stageId: uuid,
    clientId: uuid,
    contactId: z.preprocess(vazioViraNulo, uuid.nullable()).optional(),
    title: z.string().trim().min(1, "informe o título").max(120),
    value: valorOpcional,
    expectedCloseDate: dataOpcional,
    ownerId: uuid,
    tagIds: z.array(uuid).max(20).default([]),
    consumerUnitIds: z.array(uuid).max(50).default([]),
  })
  .strict();
export type CreateDealRequest = z.infer<typeof createDealRequestSchema>;

export const moveDealStageRequestSchema = z.object({ stageId: uuid }).strict();
export type MoveDealStageRequest = z.infer<typeof moveDealStageRequestSchema>;

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
export const transferDealRequestSchema = z.object({ pipelineId: uuid, stageId: uuid, ownerId: uuid.optional() }).strict();
export type TransferDealRequest = z.infer<typeof transferDealRequestSchema>;

export const bulkDealsActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("owner"), ownerId: uuid }).strict(),
  z.object({ type: z.literal("tag"), tagId: uuid }).strict(),
  z.object({ type: z.literal("stage"), stageId: uuid }).strict(),
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
  pipelineId: uuid,
  companyId: companyKeySchema,
  stageId: uuid,
  status: dealStatusSchema,
  title: z.string(),
  value: decimalString.nullable(),
  expectedCloseDate: z.string().nullable(),
  client: z.object({ id: uuid, name: z.string(), personType: clientPersonTypeSchema }),
  contact: z.object({ id: uuid, name: z.string() }).nullable(),
  owner: z.object({ id: uuid, name: z.string() }),
  tags: z.array(z.object({ id: uuid, name: z.string(), color: z.string() })),
  consumerUnits: z.array(z.object({ id: uuid, code: z.string() })),
  /** Quando entrou na etapa atual: base dos "dias na etapa" e do alerta de parado. */
  stageEnteredAt: isoDate,
  closedAt: isoDate.nullable(),
  lossReason: z.string().nullable(),
  revisitOn: z.string().nullable(),
  createdAt: isoDate,
});
export type Deal = z.infer<typeof dealSchema>;

export const listDealsResponseSchema = z.object({ deals: z.array(dealSchema) });
export type ListDealsResponse = z.infer<typeof listDealsResponseSchema>;

/** O que o formulário do negócio oferece para o cliente escolhido: contatos e UCs. */
export const dealClientOptionsResponseSchema = z.object({
  contacts: z.array(z.object({ id: uuid, name: z.string(), isPrimary: z.boolean() })),
  consumerUnits: z.array(z.object({ id: uuid, code: z.string(), distributor: z.string() })),
});
export type DealClientOptionsResponse = z.infer<typeof dealClientOptionsResponseSchema>;
