import type { IntegrationMode } from "@plugga/shared";

export interface MirrorRecordInput {
  domain: string;
  externalId: string;
  payload: unknown;
  /** Stable hash of the source payload; lets a re-import skip unchanged rows. */
  sourceFingerprint: string;
  fetchedAt: Date;
}

export type MirrorUpsertOutcome = "created" | "updated" | "unchanged";

/**
 * Data-access boundary for the Bitrix Migrator: reads the integration mode (for
 * the read_only gate) and idempotently writes mirror rows. Read-only toward
 * Bitrix; the only writes are into the OS Postgres mirror (ADR-0009).
 */
export abstract class BitrixRepository {
  abstract getIntegrationMode(key: string): Promise<IntegrationMode | null>;
  abstract upsertMirrorRecord(input: MirrorRecordInput): Promise<MirrorUpsertOutcome>;
}
