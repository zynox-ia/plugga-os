import type { JobRunInventoryItem } from "@plugga/shared";

/**
 * Fallback local (usado só quando GET /jobs não responde). Espelha o seed
 * do Bloco A — inventário somente leitura, sem pausar/reprocessar/migrar.
 */
export const FALLBACK_JOB_RUNS: JobRunInventoryItem[] = [
  {
    id: "00000000-0000-4000-8000-000000000101",
    jobKey: "inventory.bitrix-sync",
    integrationKey: "bitrix",
    scheduledFor: "2026-08-06T12:00:00.000Z",
    startedAt: null,
    finishedAt: null,
    status: "skipped",
    attempt: 1,
    durationMs: null,
    error: null,
    triggeredBy: "seed:inventory-only",
    logRef: "mock://job-runs/inventory-bitrix-sync",
    createdAt: "2026-08-06T12:00:00.000Z",
  },
  {
    id: "00000000-0000-4000-8000-000000000102",
    jobKey: "inventory.omie-sync",
    integrationKey: "omie",
    scheduledFor: "2026-08-06T12:05:00.000Z",
    startedAt: null,
    finishedAt: null,
    status: "skipped",
    attempt: 1,
    durationMs: null,
    error: null,
    triggeredBy: "seed:inventory-only",
    logRef: "mock://job-runs/inventory-omie-sync",
    createdAt: "2026-08-06T12:05:00.000Z",
  },
  {
    id: "00000000-0000-4000-8000-000000000103",
    jobKey: "inventory.whatsapp-health",
    integrationKey: "whatsapp",
    scheduledFor: "2026-08-06T12:10:00.000Z",
    startedAt: null,
    finishedAt: null,
    status: "skipped",
    attempt: 1,
    durationMs: null,
    error: null,
    triggeredBy: "seed:inventory-only",
    logRef: "mock://job-runs/inventory-whatsapp-health",
    createdAt: "2026-08-06T12:10:00.000Z",
  },
];
