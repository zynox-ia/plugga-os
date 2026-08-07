import { z } from "zod";

export const clientsModeSchema = z.literal("mock");

const uuid = z.string().uuid();
const isoDate = z.string().datetime();

export const clientSegmentSchema = z.enum(["prospect", "opm", "pluggamob", "associacoes_gd", "inativo"]);
export type ClientSegment = z.infer<typeof clientSegmentSchema>;

export const clientSummarySchema = z.object({
  id: uuid,
  name: z.string(),
  company: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  externalId: z.string().nullable(),
  segment: clientSegmentSchema,
  active: z.boolean(),
  createdAt: isoDate,
  updatedAt: isoDate,
});
export type ClientSummary = z.infer<typeof clientSummarySchema>;

export const listClientsQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(150).optional(),
    segment: clientSegmentSchema.optional(),
    active: z.enum(["true", "false"]).optional(),
  })
  .strict();
export type ListClientsQuery = z.infer<typeof listClientsQuerySchema>;

export const listClientsResponseSchema = z.object({ mode: clientsModeSchema, items: z.array(clientSummarySchema) });
export type ListClientsResponse = z.infer<typeof listClientsResponseSchema>;

export const createClientRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(150),
    company: z.string().trim().min(1).max(150).optional(),
    phone: z.string().trim().min(1).max(40).optional(),
    email: z.string().trim().toLowerCase().email().max(254).optional(),
    externalId: z.string().trim().min(1).max(100).optional(),
    segment: clientSegmentSchema.optional(),
  })
  .strict();
export type CreateClientRequest = z.infer<typeof createClientRequestSchema>;

export const updateClientRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(150).optional(),
    company: z.string().trim().min(1).max(150).nullable().optional(),
    phone: z.string().trim().min(1).max(40).nullable().optional(),
    email: z.string().trim().toLowerCase().email().max(254).nullable().optional(),
    externalId: z.string().trim().min(1).max(100).nullable().optional(),
    segment: clientSegmentSchema.optional(),
  })
  .strict();
export type UpdateClientRequest = z.infer<typeof updateClientRequestSchema>;

export const inactivateClientRequestSchema = z.object({ reason: z.string().trim().min(1).max(300).optional() }).strict();
export type InactivateClientRequest = z.infer<typeof inactivateClientRequestSchema>;

export const duplicateMatchReasonSchema = z.enum(["phone", "email", "name"]);
export const clientDuplicateCandidateSchema = clientSummarySchema.extend({
  matchedOn: z.array(duplicateMatchReasonSchema).min(1),
});
export type ClientDuplicateCandidate = z.infer<typeof clientDuplicateCandidateSchema>;

export const duplicateCandidatesQuerySchema = z
  .object({
    name: z.string().trim().min(1).max(150).optional(),
    phone: z.string().trim().min(1).max(40).optional(),
    email: z.string().trim().min(1).max(254).optional(),
  })
  .strict();
export type DuplicateCandidatesQuery = z.infer<typeof duplicateCandidatesQuerySchema>;

export const clientDuplicateCandidatesResponseSchema = z.object({
  mode: clientsModeSchema,
  candidates: z.array(clientDuplicateCandidateSchema),
});
export type ClientDuplicateCandidatesResponse = z.infer<typeof clientDuplicateCandidatesResponseSchema>;

export const createClientResponseSchema = z.object({
  mode: clientsModeSchema,
  client: clientSummarySchema,
  duplicateCandidates: z.array(clientDuplicateCandidateSchema),
});
export type CreateClientResponse = z.infer<typeof createClientResponseSchema>;

// Ficha do Cliente — aggregator. Domains not owned by this module (Energia &
// OPM, PluggaMob, Financeiro, Documentos) are never simulated: they report a
// typed "no data"/"not implemented" shape instead of fabricated values.
export const clientOpportunitySummarySchema = z.object({
  id: uuid,
  title: z.string(),
  product: z.string(),
  stage: z.string(),
  status: z.string(),
  estimatedValue: z.string().nullable(),
  nextActionAt: isoDate.nullable(),
});
export type ClientOpportunitySummary = z.infer<typeof clientOpportunitySummarySchema>;

export const clientContractSummarySchema = z.object({
  id: uuid,
  status: z.string(),
  startsAt: isoDate.nullable(),
  endsAt: isoDate.nullable(),
  signedAt: isoDate.nullable(),
});
export type ClientContractSummary = z.infer<typeof clientContractSummarySchema>;

/** Client-level contacts are derived from OpportunityContact — there is no dedicated Contact model yet. */
export const clientContactSchema = z.object({
  id: uuid,
  channel: z.string(),
  outcome: z.string(),
  note: z.string().nullable(),
  createdAt: isoDate,
  opportunityId: uuid,
  opportunityTitle: z.string(),
});
export type ClientContact = z.infer<typeof clientContactSchema>;

export const domainLinkUnavailableSchema = z.object({ available: z.literal(false), reason: z.string() });
export type DomainLinkUnavailable = z.infer<typeof domainLinkUnavailableSchema>;

export const pluggamobLinkSchema = z.discriminatedUnion("available", [
  domainLinkUnavailableSchema,
  z.object({
    available: z.literal(true),
    externalId: z.string(),
    segment: z.string(),
    walletBalance: z.string().nullable(),
    lastSessionAt: isoDate.nullable(),
    phoneMasked: z.string().nullable(),
  }),
]);
export type PluggamobLink = z.infer<typeof pluggamobLinkSchema>;

/** No Energia & OPM domain model exists yet — always "sem dados" until one lands. */
export const energiaOpmLinkSchema = domainLinkUnavailableSchema;
export type EnergiaOpmLink = z.infer<typeof energiaOpmLinkSchema>;

export const notImplementedPlaceholderSchema = z.object({ status: z.literal("em_breve"), message: z.string() });
export type NotImplementedPlaceholder = z.infer<typeof notImplementedPlaceholderSchema>;

export const clientTimelineEntrySchema = z.object({
  id: uuid,
  eventName: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  actorType: z.enum(["user", "agent", "system"]),
  occurredAt: isoDate,
});
export type ClientTimelineEntry = z.infer<typeof clientTimelineEntrySchema>;

export const clientAgentActionSchema = z.object({
  id: uuid,
  agent: z.string(),
  action: z.string(),
  decision: z.string(),
  status: z.string(),
  createdAt: isoDate,
});
export type ClientAgentAction = z.infer<typeof clientAgentActionSchema>;

export const clientFichaSchema = z.object({
  mode: clientsModeSchema,
  resumo: clientSummarySchema,
  contatos: z.array(clientContactSchema),
  oportunidades: z.array(clientOpportunitySummarySchema),
  contratos: z.array(clientContractSummarySchema),
  energiaOpm: energiaOpmLinkSchema,
  pluggamob: pluggamobLinkSchema,
  financeiro: notImplementedPlaceholderSchema,
  documentos: notImplementedPlaceholderSchema,
  timeline: z.array(clientTimelineEntrySchema),
  acoesDoAgente: z.array(clientAgentActionSchema),
});
export type ClientFicha = z.infer<typeof clientFichaSchema>;
