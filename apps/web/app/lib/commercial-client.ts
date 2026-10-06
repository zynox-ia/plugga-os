"use client";

import {
  createContractRequestSchema,
  createOpportunityRequestSchema,
  loseOpportunityRequestSchema,
  opportunityContactRequestSchema,
  revisitOpportunityRequestSchema,
  updateContractStatusRequestSchema,
  updateOpportunityStageRequestSchema,
  winOpportunityRequestSchema,
} from "@plugga/shared";

import { postarJson, type EntradaDe } from "./requisicao";

/**
 * Browser-side mutation calls for the Comercial screens. These hit this
 * app's own /api/commercial/* route handlers (app/api/commercial/**),
 * never apps/api directly — the API only binds to the internal network
 * (see apps/web/app/lib/proxy.ts). Cada corpo é validado com o schema de
 * `@plugga/shared` antes do envio (US12, T122, FR-060).
 */

export type CommercialResult<T> = { ok: true; data: T } | { ok: false; message: string };

const SEM_SERVICO = "não foi possível falar com o serviço comercial agora";
const rota = (caminho: string) => `/api/commercial/${caminho}`;
const rotaComId = (id: string, sufixo: string) => rota(`opportunities/${encodeURIComponent(id)}/${sufixo}`);

export function createOpportunity(input: EntradaDe<typeof createOpportunityRequestSchema>) {
  return postarJson(rota("opportunities"), createOpportunityRequestSchema, input, SEM_SERVICO);
}

export function updateOpportunityStage(id: string, input: EntradaDe<typeof updateOpportunityStageRequestSchema>) {
  return postarJson(rotaComId(id, "stage"), updateOpportunityStageRequestSchema, input, SEM_SERVICO);
}

export function registerOpportunityContact(id: string, input: EntradaDe<typeof opportunityContactRequestSchema>) {
  return postarJson(rotaComId(id, "contacts"), opportunityContactRequestSchema, input, SEM_SERVICO);
}

export function winOpportunity(id: string, input: EntradaDe<typeof winOpportunityRequestSchema>) {
  return postarJson(rotaComId(id, "win"), winOpportunityRequestSchema, input, SEM_SERVICO);
}

export function loseOpportunity(id: string, input: EntradaDe<typeof loseOpportunityRequestSchema>) {
  return postarJson(rotaComId(id, "lose"), loseOpportunityRequestSchema, input, SEM_SERVICO);
}

export function revisitOpportunity(id: string, input: EntradaDe<typeof revisitOpportunityRequestSchema>) {
  return postarJson(rotaComId(id, "revisit"), revisitOpportunityRequestSchema, input, SEM_SERVICO);
}

export function createContract(input: EntradaDe<typeof createContractRequestSchema>) {
  return postarJson(rota("contracts"), createContractRequestSchema, input, SEM_SERVICO);
}

export function updateContractStatus(id: string, input: EntradaDe<typeof updateContractStatusRequestSchema>) {
  return postarJson(
    rota(`contracts/${encodeURIComponent(id)}/status`),
    updateContractStatusRequestSchema,
    input,
    SEM_SERVICO,
  );
}
