import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { ActorType } from "@prisma/client";
import {
  auditDetailSchema,
  auditSummarySchema,
  consumerUnitSummarySchema,
  contestationDetailSchema,
  contestationSummarySchema,
  cycleDetailSchema,
  cycleSummarySchema,
  marketMigrationDetailSchema,
  marketMigrationSummarySchema,
  type ActivateMarketMigrationRequest,
  type AdvanceMarketMigrationStageRequest,
  type ApproveCycleReportRequest,
  type AuditDetail,
  type AuditStatus,
  type CancelMarketMigrationRequest,
  type CloseCycleRequest,
  type ContestationDetail,
  type CreateAuditRequest,
  type CreateContestationRequest,
  type CreateCycleRequest,
  type CreateMarketMigrationRequest,
  type CycleDetail,
  type CycleListQuery,
  type CycleReportStatus,
  type CycleReportsQuery,
  type CycleReportsResponse,
  type CycleStatus,
  type GenerateCycleReportRequest,
  type ListAuditsResponse,
  type ListConsumerUnitsResponse,
  type ListContestationsResponse,
  type ListCyclesResponse,
  type ListMarketMigrationsResponse,
  type MarketMigrationDetail,
  type MarkCycleDocumentsReceivedRequest,
  type ResolveAuditRequest,
  type SendCycleReportRequest,
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
  assertCycleCanClose,
  assertCycleHasOwnerAndNextAction,
  assertMarketMigrationHasOwnerAndNextAction,
  assertMarketMigrationOpen,
  assertMarketMigrationStageTransitionAllowed,
  computeCycleCloseBlockers,
} from "./energy.rules";

const cycleInclude = {
  client: { select: { id: true, name: true } },
  consumerUnit: { select: { id: true, code: true } },
  owner: { select: { id: true, name: true } },
  audits: {
    select: { id: true, type: true, status: true, divergenceBlocksClosing: true, summary: true },
    orderBy: { createdAt: "desc" as const },
  },
};

type CycleRow = {
  id: string;
  clientId: string;
  client: { id: string; name: string };
  consumerUnitId: string;
  consumerUnit: { id: string; code: string };
  marketMigrationId: string | null;
  competenceMonth: number;
  competenceYear: number;
  status: string;
  ownerId: string | null;
  owner: { id: string; name: string } | null;
  nextActionAt: Date | null;
  nextActionNote: string | null;
  reportStatus: string;
  reportVersion: number;
  reportGeneratedAt: Date | null;
  reportApprovedAt: Date | null;
  reportApprovedById: string | null;
  reportSentAt: Date | null;
  reportFileId: string | null;
  estimatedSavings: { toString: () => string } | null;
  realizedSavings: { toString: () => string } | null;
  createdAt: Date;
  updatedAt: Date;
  audits: { id: string; type: string; status: string; divergenceBlocksClosing: boolean; summary: string | null }[];
};

type ConsumerUnitRow = {
  id: string;
  clientId: string;
  code: string;
  distributor: string;
  address: string | null;
};

/**
 * 🔒 SEGURANÇA [VULN-2, auditoria zero-trust]: teto para toda listagem sem
 * paginação de página deste módulo. Nenhuma delas expõe `page`/`pageSize` na
 * API pública hoje, então um limite fixo é a defesa contra um `findMany` que
 * cresce com a tabela inteira (CWE-770, negação de serviço por esgotamento
 * de memória/CPU) — qualquer usuário com READ_ENERGY (que inclui `viewer`)
 * podia repetir a chamada e degradar a API.
 */
const LIMITE_LISTAGEM = 500;

@Injectable()
export class PrismaEnergyRepository extends EnergyRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listConsumerUnits(): Promise<ListConsumerUnitsResponse> {
    const rows = await this.prisma.consumerUnit.findMany({
      include: { client: true },
      orderBy: { createdAt: "desc" },
      take: LIMITE_LISTAGEM,
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
      take: LIMITE_LISTAGEM,
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

  async listCycles(query?: CycleListQuery): Promise<ListCyclesResponse> {
    const rows = await this.prisma.cycle.findMany({
      where: {
        clientId: query?.clientId,
        consumerUnitId: query?.consumerUnitId,
        status: query?.status,
        competenceMonth: query?.competenceMonth,
        competenceYear: query?.competenceYear,
      },
      include: { client: true, consumerUnit: true, owner: true },
      orderBy: [{ competenceYear: "desc" }, { competenceMonth: "desc" }],
      take: LIMITE_LISTAGEM,
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

  async cycle(id: string): Promise<CycleDetail> {
    const row = await this.prisma.cycle.findUnique({ where: { id }, include: cycleInclude });
    if (!row) throw new NotFoundException("cycle not found");
    return this.cycleDetail(row);
  }

  async createCycle(input: CreateCycleRequest, principal: AuthPrincipal): Promise<CycleDetail> {
    if (!(await this.clientExists(input.clientId))) {
      throw new NotFoundException("client not found");
    }
    const consumerUnit = await this.prisma.consumerUnit.findUnique({ where: { id: input.consumerUnitId } });
    if (!consumerUnit) throw new NotFoundException("consumer unit not found");
    if (consumerUnit.clientId !== input.clientId) {
      throw new BadRequestException("unidade consumidora não pertence ao cliente informado");
    }
    if (!(await this.ownerExists(input.ownerId))) {
      throw new NotFoundException("owner not found");
    }

    const existing = await this.prisma.cycle.findUnique({
      where: {
        consumerUnitId_competenceMonth_competenceYear: {
          consumerUnitId: input.consumerUnitId,
          competenceMonth: input.competenceMonth,
          competenceYear: input.competenceYear,
        },
      },
    });
    if (existing) {
      throw new BadRequestException(
        `já existe um ciclo para esta UC em ${input.competenceMonth}/${input.competenceYear}`,
      );
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.cycle.create({
        data: {
          clientId: input.clientId,
          consumerUnitId: input.consumerUnitId,
          competenceMonth: input.competenceMonth,
          competenceYear: input.competenceYear,
          ownerId: input.ownerId,
          nextActionAt: new Date(input.nextActionAt),
          nextActionNote: input.nextActionNote,
        },
      });
      await tx.eventLog.create({
        data: {
          eventName: "energy.cycle_opened",
          entityType: "cycle",
          entityId: row.id,
          actorType: this.actorType(principal),
          actorId: principal.id,
          payload: { ...input },
          occurredAt: row.createdAt,
        },
      });
      return row;
    });

    return this.cycle(created.id);
  }

  async markCycleDocumentsReceived(
    id: string,
    input: MarkCycleDocumentsReceivedRequest,
    principal: AuthPrincipal,
  ): Promise<CycleDetail> {
    const current = await this.prisma.cycle.findUnique({ where: { id } });
    if (!current) throw new NotFoundException("cycle not found");
    if (current.status !== "aguardando_documentos") {
      throw new BadRequestException("ciclo já passou da etapa de recebimento de documentos");
    }

    const nextActionAt = input.nextActionAt ? new Date(input.nextActionAt) : current.nextActionAt;
    assertCycleHasOwnerAndNextAction("documentos_recebidos", current.ownerId, nextActionAt);

    await this.prisma.$transaction(async (tx) => {
      await tx.cycle.update({
        where: { id },
        data: {
          status: "documentos_recebidos",
          nextActionAt,
          nextActionNote: input.nextActionNote ?? current.nextActionNote,
        },
      });
      await tx.eventLog.create({
        data: {
          eventName: "energy.cycle_documents_received",
          entityType: "cycle",
          entityId: id,
          actorType: this.actorType(principal),
          actorId: principal.id,
          payload: {},
          occurredAt: new Date(),
        },
      });
    });

    return this.cycle(id);
  }

  async generateCycleReport(
    id: string,
    input: GenerateCycleReportRequest,
    principal: AuthPrincipal,
  ): Promise<CycleDetail> {
    const current = await this.prisma.cycle.findUnique({ where: { id } });
    if (!current) throw new NotFoundException("cycle not found");
    if (current.status === "aguardando_documentos") {
      throw new BadRequestException("não é possível gerar relatório antes de receber os documentos");
    }

    const advanceStatus = current.status === "documentos_recebidos" || current.status === "em_auditoria";
    const nextStatus = advanceStatus ? "relatorio_pronto" : current.status;
    const nextActionAt = input.nextActionAt ? new Date(input.nextActionAt) : current.nextActionAt;
    assertCycleHasOwnerAndNextAction(nextStatus, current.ownerId, nextActionAt);

    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      await tx.cycle.update({
        where: { id },
        data: {
          status: nextStatus,
          reportVersion: { increment: 1 },
          reportStatus: current.reportSentAt ? "reenviado_apos_correcao" : "gerado",
          reportGeneratedAt: now,
          reportApprovedAt: null,
          reportApprovedById: null,
          estimatedSavings: input.estimatedSavings ?? current.estimatedSavings,
          nextActionAt,
          nextActionNote: input.nextActionNote ?? current.nextActionNote,
        },
      });
      await tx.eventLog.create({
        data: {
          eventName: "energy.cycle_report_generated",
          entityType: "cycle",
          entityId: id,
          actorType: this.actorType(principal),
          actorId: principal.id,
          payload: { reportVersion: current.reportVersion + 1 },
          occurredAt: now,
        },
      });
    });

    return this.cycle(id);
  }

  async approveCycleReport(
    id: string,
    input: ApproveCycleReportRequest,
    principal: AuthPrincipal,
  ): Promise<CycleDetail> {
    const current = await this.prisma.cycle.findUnique({ where: { id } });
    if (!current) throw new NotFoundException("cycle not found");
    if (current.reportVersion === 0) {
      throw new BadRequestException("nenhum relatório foi gerado para este ciclo ainda");
    }
    if (current.reportStatus === "aprovado") {
      throw new BadRequestException("relatório já foi aprovado");
    }

    const nextStatus = current.status === "relatorio_pronto" ? "validado_internamente" : current.status;
    const nextActionAt = input.nextActionAt ? new Date(input.nextActionAt) : current.nextActionAt;
    assertCycleHasOwnerAndNextAction(nextStatus, current.ownerId, nextActionAt);

    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      await tx.cycle.update({
        where: { id },
        data: {
          status: nextStatus,
          reportStatus: "aprovado",
          reportApprovedAt: now,
          reportApprovedById: principal.id,
          nextActionAt,
          nextActionNote: input.nextActionNote ?? current.nextActionNote,
        },
      });
      await tx.eventLog.create({
        data: {
          eventName: "energy.cycle_report_approved",
          entityType: "cycle",
          entityId: id,
          actorType: this.actorType(principal),
          actorId: principal.id,
          payload: {},
          occurredAt: now,
        },
      });
    });

    return this.cycle(id);
  }

  async sendCycleReport(id: string, input: SendCycleReportRequest, principal: AuthPrincipal): Promise<CycleDetail> {
    const current = await this.prisma.cycle.findUnique({ where: { id } });
    if (!current) throw new NotFoundException("cycle not found");
    if (current.reportStatus !== "aprovado") {
      throw new BadRequestException("relatório precisa estar aprovado internamente antes do envio");
    }

    const nextStatus = current.status === "validado_internamente" ? "enviado" : current.status;

    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      await tx.cycle.update({
        where: { id },
        data: {
          status: nextStatus,
          reportSentAt: current.reportSentAt ?? now,
          realizedSavings: input.realizedSavings ?? current.realizedSavings,
        },
      });
      await tx.eventLog.create({
        data: {
          eventName: "energy.cycle_report_sent",
          entityType: "cycle",
          entityId: id,
          actorType: this.actorType(principal),
          actorId: principal.id,
          payload: {},
          occurredAt: now,
        },
      });
    });

    return this.cycle(id);
  }

  async closeCycle(id: string, _input: CloseCycleRequest, principal: AuthPrincipal): Promise<CycleDetail> {
    const current = await this.prisma.cycle.findUnique({ where: { id } });
    if (!current) throw new NotFoundException("cycle not found");
    const audits = await this.prisma.audit.findMany({
      where: { cycleId: id },
      select: { status: true, divergenceBlocksClosing: true },
      // 🔒 SEGURANÇA [VULN-2]: já é naturalmente limitado por pertencer a um
      // único ciclo, mas o teto é adicionado por consistência defensiva —
      // nunca deveria ter havido milhares de auditorias por ciclo, e este
      // limite garante que um dado corrompido não vire um `findMany` sem fim.
      take: LIMITE_LISTAGEM,
    });

    assertCycleCanClose({
      status: current.status,
      reportStatus: current.reportStatus,
      reportSentAt: current.reportSentAt,
      audits,
    });

    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      await tx.cycle.update({ where: { id }, data: { status: "fechado" } });
      await tx.eventLog.create({
        data: {
          eventName: "energy.cycle_closed",
          entityType: "cycle",
          entityId: id,
          actorType: this.actorType(principal),
          actorId: principal.id,
          payload: {},
          occurredAt: now,
        },
      });
    });

    return this.cycle(id);
  }

  async cycleReports(query: CycleReportsQuery): Promise<CycleReportsResponse> {
    const rows = await this.prisma.cycle.findMany({
      where: {
        clientId: query.clientId,
        consumerUnitId: query.consumerUnitId,
        competenceMonth: query.competenceMonth,
        competenceYear: query.competenceYear,
      },
      include: { client: true, consumerUnit: true, owner: true },
      orderBy: [{ competenceYear: "desc" }, { competenceMonth: "desc" }],
      take: LIMITE_LISTAGEM,
    });

    const items = rows.map((row) =>
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
    );

    const estimatedSavings = rows.reduce((sum, row) => sum + Number(row.estimatedSavings ?? 0), 0);
    const realizedSavings = rows.reduce((sum, row) => sum + Number(row.realizedSavings ?? 0), 0);

    return {
      items,
      totals: {
        count: items.length,
        estimatedSavings: estimatedSavings.toFixed(2),
        realizedSavings: realizedSavings.toFixed(2),
      },
    };
  }

  async listAudits(): Promise<ListAuditsResponse> {
    // 🔒 SEGURANÇA [VULN-2]
    const rows = await this.prisma.audit.findMany({
      orderBy: { createdAt: "desc" },
      take: LIMITE_LISTAGEM,
    });
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
    // 🔒 SEGURANÇA [VULN-2]
    const rows = await this.prisma.contestation.findMany({
      orderBy: { createdAt: "desc" },
      take: LIMITE_LISTAGEM,
    });
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

  private cycleDetail(row: CycleRow): CycleDetail {
    return cycleDetailSchema.parse({
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
      reportApprovedById: row.reportApprovedById,
      reportSentAt: row.reportSentAt?.toISOString() ?? null,
      reportFileId: row.reportFileId,
      estimatedSavings: row.estimatedSavings?.toString() ?? null,
      realizedSavings: row.realizedSavings?.toString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      audits: row.audits.map((audit) => ({
        id: audit.id,
        type: audit.type,
        status: audit.status,
        divergenceBlocksClosing: audit.divergenceBlocksClosing,
        summary: audit.summary,
      })),
      closeBlockers: computeCycleCloseBlockers({
        status: row.status as CycleStatus,
        reportStatus: row.reportStatus as CycleReportStatus,
        reportSentAt: row.reportSentAt,
        audits: row.audits.map((audit) => ({
          status: audit.status as AuditStatus,
          divergenceBlocksClosing: audit.divergenceBlocksClosing,
        })),
      }),
    });
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
    const row = await this.prisma.client.findUnique({ where: { id }, select: { id: true } });
    return row !== null;
  }

  private actorType(principal: AuthPrincipal): ActorType {
    return principal.kind === "user" ? "user" : "system";
  }
}
