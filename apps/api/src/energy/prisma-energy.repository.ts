import { Injectable, NotFoundException } from "@nestjs/common";
import type { ActorType } from "@prisma/client";
import {
  auditSummarySchema,
  consumerUnitSummarySchema,
  contestationSummarySchema,
  cycleSummarySchema,
  marketMigrationDetailSchema,
  marketMigrationSummarySchema,
  type ActivateMarketMigrationRequest,
  type AdvanceMarketMigrationStageRequest,
  type CancelMarketMigrationRequest,
  type CreateMarketMigrationRequest,
  type ListAuditsResponse,
  type ListConsumerUnitsResponse,
  type ListContestationsResponse,
  type ListCyclesResponse,
  type ListMarketMigrationsResponse,
  type MarketMigrationDetail,
} from "@plugga/shared";

import type { AuthPrincipal } from "../core/auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { EnergyRepository } from "./energy.repository";
import {
  assertMarketMigrationHasOwnerAndNextAction,
  assertMarketMigrationOpen,
  assertMarketMigrationStageTransitionAllowed,
} from "./energy.rules";

type ConsumerUnitRow = {
  id: string;
  clientId: string;
  code: string;
  distributor: string;
  address: string | null;
};

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

  async createMarketMigration(
    input: CreateMarketMigrationRequest,
    principal: AuthPrincipal,
  ): Promise<MarketMigrationDetail> {
    const consumerUnit = await this.prisma.consumerUnit.findUnique({ where: { id: input.consumerUnitId } });
    if (!consumerUnit) throw new NotFoundException("consumer unit not found");
    if (!(await this.ownerExists(input.ownerId))) throw new NotFoundException("owner not found");

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.marketMigration.create({
        data: {
          consumerUnitId: input.consumerUnitId,
          ownerId: input.ownerId,
          nextActionAt: new Date(input.nextActionAt),
          nextActionNote: input.nextActionNote,
        },
      });
      await tx.eventLog.create({
        data: {
          eventName: "energy.market_migration_created",
          entityType: "market_migration",
          entityId: row.id,
          actorType: this.actorType(principal),
          actorId: principal.id,
          payload: { ...input },
          occurredAt: row.createdAt,
        },
      });
      return row;
    });

    return this.marketMigrationDetail(created.id);
  }

  async advanceMarketMigrationStage(
    id: string,
    input: AdvanceMarketMigrationStageRequest,
    principal: AuthPrincipal,
  ): Promise<MarketMigrationDetail> {
    const current = await this.prisma.marketMigration.findUnique({ where: { id } });
    if (!current) throw new NotFoundException("market migration not found");
    assertMarketMigrationOpen(current.status);
    assertMarketMigrationStageTransitionAllowed(current.stage, input.stage);
    if (input.ownerId && !(await this.ownerExists(input.ownerId))) {
      throw new NotFoundException("owner not found");
    }

    const nextOwnerId = input.ownerId ?? current.ownerId;
    const nextActionAt = input.nextActionAt ? new Date(input.nextActionAt) : current.nextActionAt;
    assertMarketMigrationHasOwnerAndNextAction(nextOwnerId, nextActionAt);

    await this.prisma.$transaction(async (tx) => {
      await tx.marketMigration.update({
        where: { id },
        data: {
          stage: input.stage,
          ownerId: nextOwnerId,
          nextActionAt,
          nextActionNote: input.nextActionNote ?? current.nextActionNote,
        },
      });
      await tx.eventLog.create({
        data: {
          eventName: "energy.market_migration_stage_advanced",
          entityType: "market_migration",
          entityId: id,
          actorType: this.actorType(principal),
          actorId: principal.id,
          payload: { from: current.stage, to: input.stage },
          occurredAt: new Date(),
        },
      });
    });

    return this.marketMigrationDetail(id);
  }

  async cancelMarketMigration(
    id: string,
    input: CancelMarketMigrationRequest,
    principal: AuthPrincipal,
  ): Promise<MarketMigrationDetail> {
    const current = await this.prisma.marketMigration.findUnique({ where: { id } });
    if (!current) throw new NotFoundException("market migration not found");
    assertMarketMigrationOpen(current.status);

    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      await tx.marketMigration.update({
        where: { id },
        data: { status: "cancelada", cancelReason: input.cancelReason },
      });
      await tx.eventLog.create({
        data: {
          eventName: "energy.market_migration_cancelled",
          entityType: "market_migration",
          entityId: id,
          actorType: this.actorType(principal),
          actorId: principal.id,
          payload: { cancelReason: input.cancelReason },
          occurredAt: now,
        },
      });
    });

    return this.marketMigrationDetail(id);
  }

  async activateMarketMigration(
    id: string,
    input: ActivateMarketMigrationRequest,
    principal: AuthPrincipal,
  ): Promise<MarketMigrationDetail> {
    const current = await this.prisma.marketMigration.findUnique({ where: { id }, include: { consumerUnit: true } });
    if (!current) throw new NotFoundException("market migration not found");
    assertMarketMigrationOpen(current.status);
    assertMarketMigrationHasOwnerAndNextAction(current.ownerId, current.nextActionAt);

    const clientId = await this.resolveClientForActivation(input, principal);
    const consumerUnitId = await this.ensureConsumerUnitForClient(current.consumerUnit, clientId, principal);

    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      await tx.marketMigration.update({
        where: { id },
        data: { status: "ativa", stage: "ativacao", clientId, consumerUnitId, activatedAt: now },
      });
      await tx.eventLog.create({
        data: {
          eventName: "energy.market_migration_activated",
          entityType: "market_migration",
          entityId: id,
          actorType: this.actorType(principal),
          actorId: principal.id,
          payload: { clientId, consumerUnitId },
          occurredAt: now,
        },
      });
    });

    return this.marketMigrationDetail(id);
  }

  /**
   * Dedupe by exact phone/email, same pattern as
   * PrismaCommercialRepository.resolveClientForWin — kept as a separate copy
   * rather than a shared helper: the two modules intentionally have no
   * cross-dependency (see energy.module.ts).
   */
  private async resolveClientForActivation(
    input: ActivateMarketMigrationRequest,
    principal: AuthPrincipal,
  ): Promise<string> {
    if (input.clientId) {
      if (!(await this.clientExists(input.clientId))) throw new NotFoundException("linked client not found");
      return input.clientId;
    }

    const newClient = input.newClient!;
    const existing = await this.prisma.client.findFirst({
      where: {
        OR: [
          newClient.email ? { email: newClient.email } : undefined,
          newClient.phone ? { phone: newClient.phone } : undefined,
        ].filter((clause): clause is NonNullable<typeof clause> => clause !== undefined),
      },
    });
    if (existing) return existing.id;

    const created = await this.prisma.$transaction(async (tx) => {
      const client = await tx.client.create({
        data: {
          name: newClient.name,
          company: newClient.company,
          phone: newClient.phone,
          email: newClient.email,
        },
      });
      await tx.eventLog.create({
        data: {
          eventName: "energy.client_created_from_market_migration",
          entityType: "client",
          entityId: client.id,
          actorType: this.actorType(principal),
          actorId: principal.id,
          payload: { name: client.name },
          occurredAt: client.createdAt,
        },
      });
      return client;
    });

    return created.id;
  }

  /**
   * A consumer unit belongs to exactly one client. If the migration's UC
   * already belongs to the resolved client, reuse it as-is. Otherwise, reuse
   * a UC already registered for that client with the same code, or create
   * one for the client — covers a migration originally captured against a
   * placeholder/lead UC that activation resolves to a different (deduped)
   * client.
   */
  private async ensureConsumerUnitForClient(
    consumerUnit: ConsumerUnitRow,
    clientId: string,
    principal: AuthPrincipal,
  ): Promise<string> {
    if (consumerUnit.clientId === clientId) return consumerUnit.id;

    const existing = await this.prisma.consumerUnit.findFirst({ where: { clientId, code: consumerUnit.code } });
    if (existing) return existing.id;

    const created = await this.prisma.$transaction(async (tx) => {
      const unit = await tx.consumerUnit.create({
        data: {
          clientId,
          code: consumerUnit.code,
          distributor: consumerUnit.distributor,
          address: consumerUnit.address,
        },
      });
      await tx.eventLog.create({
        data: {
          eventName: "energy.consumer_unit_created_from_market_migration",
          entityType: "consumer_unit",
          entityId: unit.id,
          actorType: this.actorType(principal),
          actorId: principal.id,
          payload: { clientId, code: unit.code },
          occurredAt: unit.createdAt,
        },
      });
      return unit;
    });

    return created.id;
  }

  private async marketMigrationDetail(id: string): Promise<MarketMigrationDetail> {
    const row = await this.prisma.marketMigration.findUnique({
      where: { id },
      include: { client: true, consumerUnit: true, owner: true },
    });
    if (!row) throw new NotFoundException("market migration not found");
    return marketMigrationDetailSchema.parse({
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
    });
  }

  private async clientExists(id: string): Promise<boolean> {
    const client = await this.prisma.client.findUnique({ where: { id }, select: { id: true } });
    return client !== null;
  }

  private async ownerExists(id: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });
    return user !== null;
  }

  private actorType(principal: AuthPrincipal): ActorType {
    return principal.kind === "user" ? "user" : "system";
  }
}
