import { Injectable, NotFoundException } from "@nestjs/common";
import type { ActorType } from "@prisma/client";
import {
  auditDetailSchema,
  auditSummarySchema,
  consumerUnitSummarySchema,
  contestationDetailSchema,
  contestationSummarySchema,
  cycleSummarySchema,
  marketMigrationSummarySchema,
  type AuditDetail,
  type ContestationDetail,
  type CreateAuditRequest,
  type CreateContestationRequest,
  type ListAuditsResponse,
  type ListConsumerUnitsResponse,
  type ListContestationsResponse,
  type ListCyclesResponse,
  type ListMarketMigrationsResponse,
  type ResolveAuditRequest,
  type UpdateContestationStatusRequest,
} from "@plugga/shared";

import type { AuthPrincipal } from "../core/auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { EnergyRepository } from "./energy.repository";
import {
  assertAuditCanBeResolved,
  assertAuditCanOpenContestation,
  assertAuditHasNoContestation,
  assertAuditIsContestationType,
  assertAuditOriginMatchesLinks,
  assertContestationCanClose,
  assertContestationTransitionAllowed,
} from "./energy.rules";

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
    return { items: rows.map((row) => auditSummarySchema.parse(this.auditSummary(row))) };
  }

  async audit(id: string): Promise<AuditDetail> {
    const row = await this.prisma.audit.findUnique({ where: { id }, include: { contestation: true } });
    if (!row) throw new NotFoundException("audit not found");
    return auditDetailSchema.parse({ ...this.auditSummary(row), contestationId: row.contestation?.id ?? null });
  }

  async createAudit(input: CreateAuditRequest, principal: AuthPrincipal): Promise<AuditDetail> {
    assertAuditOriginMatchesLinks(input.origin, input.cycleId, input.marketMigrationId);

    if (input.cycleId && !(await this.cycleExists(input.cycleId))) {
      throw new NotFoundException("cycle not found");
    }
    if (input.marketMigrationId && !(await this.marketMigrationExists(input.marketMigrationId))) {
      throw new NotFoundException("market migration not found");
    }

    const createdById = principal.kind === "user" ? principal.id : null;

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.audit.create({
        data: {
          origin: input.origin,
          type: input.type,
          cycleId: input.cycleId,
          marketMigrationId: input.marketMigrationId,
          summary: input.summary,
          divergenceBlocksClosing: input.divergenceBlocksClosing ?? false,
          createdById,
        },
      });
      await tx.eventLog.create({
        data: {
          eventName: "energy.audit_created",
          entityType: "audit",
          entityId: row.id,
          actorType: this.actorType(principal),
          actorId: principal.id,
          payload: { ...input },
          occurredAt: row.createdAt,
        },
      });
      return row;
    });

    return this.audit(created.id);
  }

  async resolveAudit(id: string, input: ResolveAuditRequest, principal: AuthPrincipal): Promise<AuditDetail> {
    const current = await this.prisma.audit.findUnique({ where: { id } });
    if (!current) throw new NotFoundException("audit not found");
    assertAuditCanBeResolved(current.status);

    await this.prisma.$transaction(async (tx) => {
      await tx.audit.update({
        where: { id },
        data: { status: input.status, summary: input.summary ?? current.summary },
      });
      await tx.eventLog.create({
        data: {
          eventName: "energy.audit_resolved",
          entityType: "audit",
          entityId: id,
          actorType: this.actorType(principal),
          actorId: principal.id,
          payload: { from: current.status, to: input.status },
          occurredAt: new Date(),
        },
      });
    });

    return this.audit(id);
  }

  async listContestations(): Promise<ListContestationsResponse> {
    const rows = await this.prisma.contestation.findMany({ orderBy: { createdAt: "desc" } });
    return { items: rows.map((row) => contestationSummarySchema.parse(this.contestationView(row))) };
  }

  async contestation(id: string): Promise<ContestationDetail> {
    const row = await this.prisma.contestation.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("contestation not found");
    return contestationDetailSchema.parse(this.contestationView(row));
  }

  async createContestation(input: CreateContestationRequest, principal: AuthPrincipal): Promise<ContestationDetail> {
    const audit = await this.prisma.audit.findUnique({ where: { id: input.auditId }, include: { contestation: true } });
    if (!audit) throw new NotFoundException("audit not found");
    assertAuditIsContestationType(audit.type);
    assertAuditCanOpenContestation(audit.status);
    assertAuditHasNoContestation(audit.contestation !== null);
    if (!(await this.ownerExists(input.ownerId))) {
      throw new NotFoundException("owner not found");
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.contestation.create({
        data: {
          auditId: input.auditId,
          distributor: input.distributor,
          reason: input.reason,
          estimatedAmount: input.estimatedAmount,
          protocol: input.protocol,
          openedAt: new Date(input.openedAt),
          expectedResponseAt: new Date(input.expectedResponseAt),
          ownerId: input.ownerId,
        },
      });
      await tx.audit.update({ where: { id: input.auditId }, data: { status: "contestacao_aberta" } });
      await tx.eventLog.create({
        data: {
          eventName: "energy.contestation_created",
          entityType: "contestation",
          entityId: row.id,
          actorType: this.actorType(principal),
          actorId: principal.id,
          payload: { ...input },
          occurredAt: row.createdAt,
        },
      });
      return row;
    });

    return this.contestation(created.id);
  }

  async updateContestationStatus(
    id: string,
    input: UpdateContestationStatusRequest,
    principal: AuthPrincipal,
  ): Promise<ContestationDetail> {
    const current = await this.prisma.contestation.findUnique({ where: { id } });
    if (!current) throw new NotFoundException("contestation not found");

    assertContestationTransitionAllowed(current.status, input.status);
    const financialResult = input.financialResult ?? current.financialResult?.toString() ?? null;
    assertContestationCanClose(input.status, financialResult);

    await this.prisma.$transaction(async (tx) => {
      await tx.contestation.update({
        where: { id },
        data: { status: input.status, financialResult },
      });
      await tx.eventLog.create({
        data: {
          eventName: "energy.contestation_status_updated",
          entityType: "contestation",
          entityId: id,
          actorType: this.actorType(principal),
          actorId: principal.id,
          payload: { from: current.status, to: input.status, financialResult },
          occurredAt: new Date(),
        },
      });
    });

    return this.contestation(id);
  }

  private async cycleExists(id: string): Promise<boolean> {
    const cycle = await this.prisma.cycle.findUnique({ where: { id }, select: { id: true } });
    return cycle !== null;
  }

  private async marketMigrationExists(id: string): Promise<boolean> {
    const migration = await this.prisma.marketMigration.findUnique({ where: { id }, select: { id: true } });
    return migration !== null;
  }

  private async ownerExists(id: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });
    return user !== null;
  }

  private auditSummary(row: {
    id: string;
    origin: string;
    type: string;
    status: string;
    cycleId: string | null;
    marketMigrationId: string | null;
    summary: string | null;
    divergenceBlocksClosing: boolean;
    createdById: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
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
    };
  }

  private contestationView(row: {
    id: string;
    auditId: string;
    distributor: string;
    reason: string;
    estimatedAmount: { toString: () => string } | null;
    protocol: string | null;
    openedAt: Date | null;
    expectedResponseAt: Date | null;
    status: string;
    ownerId: string | null;
    financialResult: { toString: () => string } | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
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
    };
  }

  private actorType(principal: AuthPrincipal): ActorType {
    return principal.kind === "user" ? "user" : "system";
  }
}
