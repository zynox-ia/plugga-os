import { z } from "zod";

const jsonObjectSchema = z.record(z.string(), z.unknown());

export const agentActionDecisionSchema = z.enum([
  "allowed",
  "blocked",
  "pending_approval",
]);

export const agentActionApprovalStatusSchema = z.enum([
  "not_required",
  "pending",
  "approved",
  "rejected",
]);

export const agentActionStatusSchema = z.enum([
  "recorded",
  "blocked",
  "pending",
  "failed",
]);

export const createAgentActionSchema = z
  .object({
    agent: z.string().trim().min(1).max(100),
    channel: z.string().trim().min(1).max(50),
    action: z.string().trim().min(1).max(150),
    entityType: z.string().trim().min(1).max(100),
    entityId: z.string().trim().min(1).max(150),
    input: jsonObjectSchema.default({}),
    payload: jsonObjectSchema.default({}),
    decision: agentActionDecisionSchema,
    approvalStatus: agentActionApprovalStatusSchema,
    status: agentActionStatusSchema,
    result: z.string().trim().max(2_000).optional(),
    error: z.string().trim().max(2_000).optional(),
  })
  .strict();

export const agentActionResponseSchema = z.object({
  id: z.guid(),
  status: agentActionStatusSchema,
  createdAt: z.string().datetime(),
});

export type CreateAgentAction = z.infer<typeof createAgentActionSchema>;
export type AgentActionResponse = z.infer<typeof agentActionResponseSchema>;
export type AgentActionStatus = z.infer<typeof agentActionStatusSchema>;

// ---------------------------------------------------------------- escopo por ação (B-01)

/**
 * Ações que uma identidade de agente pode receber, além das telas do
 * departamento. Sem a ação, o agente não usa o ponto de entrada dela, nem com a
 * tela certa. A lista vazia é o padrão. A mesma lista está no CHECK de
 * `agent_identities.acoes`.
 */
export const acoesDeAgente = ["engenharia.ordem.criar"] as const;
export const acaoDeAgenteSchema = z.enum(acoesDeAgente);
export type AcaoDeAgente = z.infer<typeof acaoDeAgenteSchema>;

export const DESCRICAO_DA_ACAO_DE_AGENTE: Readonly<Record<AcaoDeAgente, string>> = {
  "engenharia.ordem.criar": "Abrir ordem de serviço da Engenharia pelo pedido do canal",
};

/**
 * Cabeçalho `Idempotency-Key` dos pontos de entrada de agente: o mesmo pedido
 * repetido devolve o que foi criado da primeira vez, sem duplicar.
 */
export const chaveDeIdempotenciaSchema = z.string().regex(/^[A-Za-z0-9_.:-]{8,120}$/, "use de 8 a 120 letras, números, _ . : ou -");
