import { Injectable } from "@nestjs/common";
import {
  auditSummarySchema,
  consumerUnitSummarySchema,
  contestationSummarySchema,
  cycleSummarySchema,
  marketMigrationSummarySchema,
  type ListAuditsResponse,
  type ListConsumerUnitsResponse,
  type ListContestationsResponse,
  type ListCyclesResponse,
  type ListMarketMigrationsResponse,
} from "@plugga/shared";

import { PrismaService } from "../prisma/prisma.service";
import { EnergyRepository } from "./energy.repository";

@Injectable()
export class PrismaEnergyRepository extends EnergyRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listConsumerUnits(): Promise<ListConsumerUnitsResponse> {
    const rows = await this.prisma.consumerUnit.findMany({
      include: { client: true },
      orderBy: { createdAt: "desc" },
    });
    return {
      items: rows.map((row) =>
        consumerUnitSummarySchema.parse({
          id: row.id,
          clientId: row.clientId,
          clientName: row.client.name,
          code: row.code,
          distributor: row.distributor,
          address: row.address,
          status: row.status,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        }),
      ),
    };
  }

  async listMarketMigrations(): Promise<ListMarketMigrationsResponse> {
    const rows = await this.prisma.marketMigration.findMany({
      include: { client: true, consumerUnit: true, owner: true },
      orderBy: { createdAt: "desc" },
    });
    return {
      items: rows.map((row) =>
        marketMigrationSummarySchema.parse({
          id: row.id,
          clientId: row.clientId,
          clientName: row.client?.name ?? null,
          consumerUnitId: row.consumerUnitId,
          consumerUnitCode: row.consumerUnit.code,
          stage: row.stage,
          status: row.status,
          ownerId: row.ownerId,
          ownerName: row.owner?.name ?? null,
          nextActionAt: row.nextActionAt?.toISOString() ?? null,
          nextActionNote: row.nextActionNote,
          cancelReason: row.cancelReason,
          activatedAt: row.activatedAt?.toISOString() ?? null,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        }),
      ),
    };
  }

  async listCycles(): Promise<ListCyclesResponse> {
    const rows = await this.prisma.cycle.findMany({
      include: { client: true, consumerUnit: true, owner: true },
      orderBy: [{ competenceYear: "desc" }, { competenceMonth: "desc" }],
    });
    return {
      items: rows.map((row) =>
        cycleSummarySchema.parse({
          id: row.id,
          clientId: row.clientId,
          clientName: row.client.name,
          consumerUnitId: row.consumerUnitId,
          consumerUnitCode: row.consumerUnit.code,
          marketMigrationId: row.marketMigrationId,
          competenceMonth: row.competenceMonth,
          competenceYear: row.competenceYear,
          status: row.status,
          ownerId: row.ownerId,
          ownerName: row.owner?.name ?? null,
          nextActionAt: row.nextActionAt?.toISOString() ?? null,
          nextActionNote: row.nextActionNote,
          reportStatus: row.reportStatus,
          reportVersion: row.reportVersion,
          reportGeneratedAt: row.reportGeneratedAt?.toISOString() ?? null,
          reportApprovedAt: row.reportApprovedAt?.toISOString() ?? null,
          reportSentAt: row.reportSentAt?.toISOString() ?? null,
          estimatedSavings: row.estimatedSavings?.toString() ?? null,
          realizedSavings: row.realizedSavings?.toString() ?? null,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        }),
      ),
    };
  }

  async listAudits(): Promise<ListAuditsResponse> {
    const rows = await this.prisma.audit.findMany({ orderBy: { createdAt: "desc" } });
    return {
      items: rows.map((row) =>
        auditSummarySchema.parse({
          id: row.id,
          origin: row.origin,
          type: row.type,
          status: row.status,
          cycleId: row.cycleId,
          marketMigrationId: row.marketMigrationId,
          summary: row.summary,
          divergenceBlocksClosing: row.divergenceBlocksClosing,
          createdById: row.createdById,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        }),
      ),
    };
  }

  async listContestations(): Promise<ListContestationsResponse> {
    const rows = await this.prisma.contestation.findMany({ orderBy: { createdAt: "desc" } });
    return {
      items: rows.map((row) =>
        contestationSummarySchema.parse({
          id: row.id,
          auditId: row.auditId,
          distributor: row.distributor,
          reason: row.reason,
          estimatedAmount: row.estimatedAmount?.toString() ?? null,
          protocol: row.protocol,
          openedAt: row.openedAt?.toISOString() ?? null,
          expectedResponseAt: row.expectedResponseAt?.toISOString() ?? null,
          status: row.status,
          ownerId: row.ownerId,
          financialResult: row.financialResult?.toString() ?? null,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        }),
      ),
    };
  }
}
