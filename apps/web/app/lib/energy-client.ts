"use client";

import {
  activateMarketMigrationRequestSchema,
  advanceMarketMigrationStageRequestSchema,
  approveCycleReportRequestSchema,
  cancelMarketMigrationRequestSchema,
  closeCycleRequestSchema,
  createAuditRequestSchema,
  createContestationRequestSchema,
  createCycleRequestSchema,
  createMarketMigrationRequestSchema,
  generateCycleReportRequestSchema,
  markCycleDocumentsReceivedRequestSchema,
  resolveAuditRequestSchema,
  sendCycleReportRequestSchema,
  updateContestationStatusRequestSchema,
} from "@plugga/shared";

import { postarJson, type EntradaDe } from "./requisicao";

/**
 * Browser-side mutation calls for the Energia & OPM screens. These hit this
 * app's own /api/energy/* route handlers (app/api/energy/**), never apps/api
 * directly — the API only binds to the internal network (see
 * apps/web/app/lib/proxy.ts), mirrors lib/commercial-client.ts. Cada corpo é
 * validado com o schema de `@plugga/shared` antes do envio (US12, T122, FR-060).
 */

export type EnergyResult<T> = { ok: true; data: T } | { ok: false; message: string };

const SEM_SERVICO = "não foi possível falar com o serviço de energia agora";
const rota = (caminho: string) => `/api/energy/${caminho}`;
const rotaComId = (recurso: string, id: string, sufixo: string) =>
  rota(`${recurso}/${encodeURIComponent(id)}/${sufixo}`);

export function createAudit(input: EntradaDe<typeof createAuditRequestSchema>) {
  return postarJson(rota("audits"), createAuditRequestSchema, input, SEM_SERVICO);
}

export function resolveAudit(id: string, input: EntradaDe<typeof resolveAuditRequestSchema>) {
  return postarJson(rotaComId("audits", id, "resolve"), resolveAuditRequestSchema, input, SEM_SERVICO);
}

export function createContestation(input: EntradaDe<typeof createContestationRequestSchema>) {
  return postarJson(rota("contestations"), createContestationRequestSchema, input, SEM_SERVICO);
}

export function updateContestationStatus(id: string, input: EntradaDe<typeof updateContestationStatusRequestSchema>) {
  return postarJson(rotaComId("contestations", id, "status"), updateContestationStatusRequestSchema, input, SEM_SERVICO);
}

export function createCycle(input: EntradaDe<typeof createCycleRequestSchema>) {
  return postarJson(rota("cycles"), createCycleRequestSchema, input, SEM_SERVICO);
}

export function markCycleDocumentsReceived(
  id: string,
  input: EntradaDe<typeof markCycleDocumentsReceivedRequestSchema> = {},
) {
  return postarJson(
    rotaComId("cycles", id, "documents-received"),
    markCycleDocumentsReceivedRequestSchema,
    input,
    SEM_SERVICO,
  );
}

export function generateCycleReport(id: string, input: EntradaDe<typeof generateCycleReportRequestSchema> = {}) {
  return postarJson(rotaComId("cycles", id, "report"), generateCycleReportRequestSchema, input, SEM_SERVICO);
}

export function approveCycleReport(id: string, input: EntradaDe<typeof approveCycleReportRequestSchema> = {}) {
  return postarJson(rotaComId("cycles", id, "approve-report"), approveCycleReportRequestSchema, input, SEM_SERVICO);
}

export function sendCycleReport(id: string, input: EntradaDe<typeof sendCycleReportRequestSchema> = {}) {
  return postarJson(rotaComId("cycles", id, "send"), sendCycleReportRequestSchema, input, SEM_SERVICO);
}

export function closeCycle(id: string, input: EntradaDe<typeof closeCycleRequestSchema> = {}) {
  return postarJson(rotaComId("cycles", id, "close"), closeCycleRequestSchema, input, SEM_SERVICO);
}

export function createMarketMigration(input: EntradaDe<typeof createMarketMigrationRequestSchema>) {
  return postarJson(rota("market-migrations"), createMarketMigrationRequestSchema, input, SEM_SERVICO);
}

export function advanceMarketMigrationStage(
  id: string,
  input: EntradaDe<typeof advanceMarketMigrationStageRequestSchema>,
) {
  return postarJson(
    rotaComId("market-migrations", id, "stage"),
    advanceMarketMigrationStageRequestSchema,
    input,
    SEM_SERVICO,
  );
}

export function cancelMarketMigration(id: string, input: EntradaDe<typeof cancelMarketMigrationRequestSchema>) {
  return postarJson(rotaComId("market-migrations", id, "cancel"), cancelMarketMigrationRequestSchema, input, SEM_SERVICO);
}

export function activateMarketMigration(id: string, input: EntradaDe<typeof activateMarketMigrationRequestSchema>) {
  return postarJson(
    rotaComId("market-migrations", id, "activate"),
    activateMarketMigrationRequestSchema,
    input,
    SEM_SERVICO,
  );
}
