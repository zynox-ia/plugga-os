import { createHash } from "node:crypto";

import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { IntegrationMode } from "@plugga/shared";

import {
  BITRIX_INTEGRATION_KEY,
  BITRIX_MAX_PAGES,
  BITRIX_OPM_DOMAIN,
} from "./bitrix.constants";
import { BitrixReadClient, type BitrixListParams } from "./bitrix-read.client";
import { BitrixRepository } from "./bitrix.repository";

export interface ImportSummary {
  domain: string;
  read: number;
  created: number;
  updated: number;
  unchanged: number;
  /** Records returned by Bitrix with no usable id — mirrored nowhere. */
  skipped: number;
  /** True when the page cap stopped the run before Bitrix ran out of pages. */
  truncated: boolean;
}

interface DomainDescriptor {
  domain: string;
  method: string;
  params: BitrixListParams;
}

/** Why the migrator may (or may not) read Bitrix right now. */
export type BitrixGate =
  | { allowed: true; entityTypeId: number }
  | { allowed: false; reason: "mode"; mode: IntegrationMode | null }
  | { allowed: false; reason: "credential" };

export type ImportOutcome =
  | { skipped: true; reason: "mode" | "credential" }
  | { skipped: false; summary: ImportSummary };

@Injectable()
export class BitrixImportService {
  private readonly logger = new Logger(BitrixImportService.name);

  constructor(
    @Inject(BitrixReadClient) private readonly client: BitrixReadClient,
    @Inject(BitrixRepository) private readonly repository: BitrixRepository,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  /**
   * The capability gate (ADR-0009): reading Bitrix requires BOTH `read_only`
   * mode AND a configured credential. It lives here — the narrowest point every
   * caller passes through — so no entry path (HTTP, scheduler, BullMQ retry
   * after a mode downgrade) can reach Bitrix by going around the controller.
   */
  async evaluateGate(): Promise<BitrixGate> {
    const mode = await this.repository.getIntegrationMode(BITRIX_INTEGRATION_KEY);
    if (mode !== "read_only") {
      return { allowed: false, reason: "mode", mode };
    }

    const webhookUrl = this.config.get<string>("BITRIX_WEBHOOK_URL");
    const entityTypeId = this.config.get<number>("BITRIX_OPM_ENTITY_TYPE_ID");
    if (!webhookUrl || !entityTypeId) {
      return { allowed: false, reason: "credential" };
    }

    return { allowed: true, entityTypeId };
  }

  /**
   * Imports the OPM (Bitrix "C7") domain into the read-only mirror. Re-checks
   * the gate itself and returns a skip instead of reading when it is closed.
   */
  async importOpm(): Promise<ImportOutcome> {
    const gate = await this.evaluateGate();
    if (!gate.allowed) {
      this.logger.warn(
        `bitrix import refused before any read: domain='${BITRIX_OPM_DOMAIN}' reason=${gate.reason}` +
          (gate.reason === "mode" ? ` mode=${gate.mode ?? "unknown"}` : ""),
      );
      return { skipped: true, reason: gate.reason };
    }

    const summary = await this.importDomain({
      domain: BITRIX_OPM_DOMAIN,
      method: "crm.item.list",
      params: { entityTypeId: gate.entityTypeId },
    });
    return { skipped: false, summary };
  }

  private async importDomain(descriptor: DomainDescriptor): Promise<ImportSummary> {
    try {
      const summary = await this.readDomainIntoMirror(descriptor);
      await this.repository.recordSyncOutcome({ at: new Date(), error: null });
      return summary;
    } catch (error) {
      // Registrar sem engolir: a falha vai para a tela de Integrações E segue
      // para o job_run — por isso o try/catch interno não pode substituir o
      // erro original pelo de registro.
      try {
        await this.repository.recordSyncOutcome({ at: new Date(), error: truncatedMessageOf(error) });
      } catch (recordError) {
        this.logger.error(`bitrix import: failed to record sync outcome: ${String(recordError)}`);
      }
      throw error;
    }
  }

  private async readDomainIntoMirror(descriptor: DomainDescriptor): Promise<ImportSummary> {
    const pageSize = this.config.get<number>("BITRIX_IMPORT_PAGE_SIZE", 50);
    const summary: ImportSummary = {
      domain: descriptor.domain,
      read: 0,
      created: 0,
      updated: 0,
      unchanged: 0,
      skipped: 0,
      truncated: false,
    };

    let start = 0;
    let exhausted = false;
    for (let page = 0; page < BITRIX_MAX_PAGES; page += 1) {
      const response = await this.client.callList(
        descriptor.method,
        { ...descriptor.params, limit: pageSize },
        start,
      );

      const fetchedAt = new Date();
      for (const item of response.result) {
        summary.read += 1;
        const externalId = extractExternalId(item);
        if (externalId === null) {
          // Never silently drop: an id-less record is a data-quality signal.
          summary.skipped += 1;
          continue;
        }
        const outcome = await this.repository.upsertMirrorRecord({
          domain: descriptor.domain,
          externalId,
          payload: item,
          sourceFingerprint: fingerprintOf(item),
          fetchedAt,
        });
        summary[outcome] += 1;
      }

      if (response.next === undefined || response.next === null) {
        exhausted = true;
        break;
      }
      start = response.next;
    }

    summary.truncated = !exhausted;
    if (summary.truncated) {
      this.logger.warn(
        `bitrix import domain='${descriptor.domain}' stopped at the ${BITRIX_MAX_PAGES}-page cap; mirror may be incomplete`,
      );
    }
    if (summary.skipped > 0) {
      this.logger.warn(
        `bitrix import domain='${descriptor.domain}' skipped ${summary.skipped} record(s) with no usable id`,
      );
    }

    this.logger.log(
      `bitrix import domain='${descriptor.domain}' read=${summary.read} created=${summary.created} ` +
        `updated=${summary.updated} unchanged=${summary.unchanged} skipped=${summary.skipped}`,
    );
    return summary;
  }
}

/** Truncado porque lastError é vitrine de diagnóstico, não log completo. */
function truncatedMessageOf(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 500 ? `${message.slice(0, 500)}…` : message;
}

function extractExternalId(item: unknown): string | null {
  if (typeof item !== "object" || item === null) {
    return null;
  }
  const id = (item as { id?: unknown }).id;
  if (typeof id === "string" && id.length > 0) {
    return id;
  }
  if (typeof id === "number" && Number.isFinite(id)) {
    return String(id);
  }
  return null;
}

function fingerprintOf(item: unknown): string {
  return createHash("sha256").update(stableStringify(item)).digest("hex");
}

/** Deterministic JSON with sorted object keys, so fingerprints are stable. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
