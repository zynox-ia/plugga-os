import type { AuditSummary, ContestationSummary } from "@plugga/shared";

/**
 * Fallback local (usado só quando GET /energy/audits ou /energy/contestations
 * não responde). Espelha o wireframe do fluxo Energia & OPM — nomes e valores
 * ilustrativos, sem dado real de cliente.
 */
export const FALLBACK_AUDITS: AuditSummary[] = [
  {
    id: "00000000-0000-4000-8000-000000002001",
    origin: "ciclo_mensal",
    type: "conferencia_fatura",
    status: "divergencia_encontrada",
    cycleId: "00000000-0000-4000-8000-000000003001",
    marketMigrationId: null,
    summary: "Demanda medida acima da contratada em jul/2026",
    divergenceBlocksClosing: false,
    createdById: "00000000-0000-4000-8000-000000009001",
    createdAt: "2026-08-02T12:00:00.000Z",
    updatedAt: "2026-08-05T12:00:00.000Z",
  },
  {
    id: "00000000-0000-4000-8000-000000002002",
    origin: "avulsa",
    type: "oportunidade",
    status: "em_analise",
    cycleId: null,
    marketMigrationId: null,
    summary: "Revisão de tarifa fora de ponta",
    divergenceBlocksClosing: false,
    createdById: "00000000-0000-4000-8000-000000009002",
    createdAt: "2026-08-04T12:00:00.000Z",
    updatedAt: "2026-08-04T12:00:00.000Z",
  },
];

export const FALLBACK_CONTESTATIONS: ContestationSummary[] = [
  {
    id: "00000000-0000-4000-8000-000000004001",
    auditId: "00000000-0000-4000-8000-000000002001",
    distributor: "Amazonas Energia",
    reason: "Demanda ultrapassagem",
    estimatedAmount: "1240.00",
    protocol: "PROT-2026-0871",
    openedAt: "2026-08-06T12:00:00.000Z",
    expectedResponseAt: "2026-09-05T12:00:00.000Z",
    status: "aguardando_distribuidora",
    ownerId: "00000000-0000-4000-8000-000000009001",
    financialResult: null,
    createdAt: "2026-08-06T12:00:00.000Z",
    updatedAt: "2026-08-06T12:00:00.000Z",
  },
];
