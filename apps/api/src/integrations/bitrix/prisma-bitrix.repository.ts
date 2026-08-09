import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { IntegrationMode } from "@plugga/shared";

import { PrismaService } from "../../prisma/prisma.service";
import { BITRIX_INTEGRATION_KEY } from "./bitrix.constants";
import {
  BitrixRepository,
  type MirrorRecordInput,
  type MirrorUpsertOutcome,
  type SyncOutcome,
} from "./bitrix.repository";

@Injectable()
export class PrismaBitrixRepository extends BitrixRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  async getIntegrationMode(key: string): Promise<IntegrationMode | null> {
    const integration = await this.prisma.integration.findUnique({
      where: { key },
      select: { mode: true },
    });
    return integration?.mode ?? null;
  }

  async upsertMirrorRecord(input: MirrorRecordInput): Promise<MirrorUpsertOutcome> {
    const payload = input.payload as Prisma.InputJsonValue;
    const existing = await this.prisma.bitrixMirrorRecord.findUnique({
      where: { domain_externalId: { domain: input.domain, externalId: input.externalId } },
      select: { sourceFingerprint: true },
    });

    if (!existing) {
      await this.prisma.bitrixMirrorRecord.create({
        data: {
          domain: input.domain,
          externalId: input.externalId,
          payload,
          sourceFingerprint: input.sourceFingerprint,
          fetchedAt: input.fetchedAt,
        },
      });
      return "created";
    }

    if (existing.sourceFingerprint === input.sourceFingerprint) {
      // True no-op: a re-import of unchanged data writes nothing (idempotent).
      return "unchanged";
    }

    await this.prisma.bitrixMirrorRecord.update({
      where: { domain_externalId: { domain: input.domain, externalId: input.externalId } },
      data: {
        payload,
        sourceFingerprint: input.sourceFingerprint,
        fetchedAt: input.fetchedAt,
      },
    });
    return "updated";
  }

  async recordSyncOutcome(outcome: SyncOutcome): Promise<void> {
    // "down", não "degraded", numa falha: a rodada parou no meio e o espelho
    // pode estar incompleto; a tela precisa acender vermelho até passar inteira.
    await this.prisma.integration.update({
      where: { key: BITRIX_INTEGRATION_KEY },
      data: {
        lastSyncAt: outcome.at,
        status: outcome.error === null ? "healthy" : "down",
        lastError: outcome.error,
      },
    });
  }
}
