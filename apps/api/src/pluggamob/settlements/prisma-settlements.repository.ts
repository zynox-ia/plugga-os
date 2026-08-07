import { Inject, Injectable } from "@nestjs/common";
import { Prisma, type ActorType } from "@prisma/client";

import { PrismaService } from "../../prisma/prisma.service";
import {
  type MutationContext,
  type SettlementMutationResult,
  SettlementsRepository,
  type StoredCoupon,
  type StoredD14Credit,
  type StoredSettlement,
} from "./settlements.repository";

const settlementInclude = {
  partner: { select: { id: true, key: true, name: true } },
  lines: { orderBy: { id: "asc" as const } },
} satisfies Prisma.SettlementInclude;

type SettlementRow = Prisma.SettlementGetPayload<{ include: typeof settlementInclude }>;
type Transaction = Prisma.TransactionClient;

@Injectable()
export class PrismaSettlementsRepository extends SettlementsRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  findCoupons(): Promise<StoredCoupon[]> {
    return this.prisma.coupon.findMany({ orderBy: [{ createdAt: "desc" }, { code: "asc" }] });
  }

  async findSettlements(): Promise<StoredSettlement[]> {
    const rows = await this.prisma.settlement.findMany({
      include: settlementInclude,
      orderBy: [{ weekStart: "desc" }, { partner: { name: "asc" } }],
    });
    return rows.map((row) => this.mapSettlement(row));
  }

  async findSettlement(id: string): Promise<StoredSettlement | null> {
    const row = await this.prisma.settlement.findUnique({ where: { id }, include: settlementInclude });
    return row ? this.mapSettlement(row) : null;
  }

  async findD14Credits(): Promise<StoredD14Credit[]> {
    const credits = await this.prisma.d14Credit.findMany({
      include: { settlement: { include: { partner: { select: { name: true } } } } },
      orderBy: [{ availableAt: "asc" }, { id: "asc" }],
    });
    return credits.map((credit) => ({
      id: credit.id,
      settlementId: credit.settlementId,
      partnerName: credit.settlement.partner.name,
      amount: credit.amount.toFixed(2),
      status: credit.status,
      availableAt: credit.availableAt,
    }));
  }

  resolveBlocker(
    settlementId: string,
    lineId: string,
    resolution: string,
    context: MutationContext,
  ): Promise<SettlementMutationResult> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.settlement.findUnique({ where: { id: settlementId }, include: settlementInclude });
      if (!current) return { kind: "not_found" };

      const blocker = current.lines.find((line) => line.id === lineId && line.blockedReason !== null);
      if (!blocker) return { kind: "line_not_found" };

      await tx.settlementLine.update({
        where: { id: lineId },
        data: {
          blockedReason: null,
          blockerAssignee: null,
          blockerEvidenceMissing: null,
          blockerNextAction: null,
        },
      });

      const remainingBlockers = await tx.settlementLine.count({
        where: { settlementId, blockedReason: { not: null } },
      });
      const nextStatus = current.status === "blocked" && remainingBlockers === 0 ? "auditing" : current.status;
      if (nextStatus !== current.status) {
        await tx.settlement.update({ where: { id: settlementId }, data: { status: nextStatus } });
      }

      await this.recordEvent(tx, {
        eventName: "pluggamob.settlement_blocker_resolved",
        entityType: "settlement",
        entityId: settlementId,
        context,
        payload: {
          lineId,
          reason: blocker.blockedReason,
          assignee: blocker.blockerAssignee,
          resolution,
          previousStatus: current.status,
          status: nextStatus,
        },
      });
      return this.reload(tx, settlementId);
    });
  }

  requestApproval(
    settlementId: string,
    note: string | undefined,
    context: MutationContext,
  ): Promise<SettlementMutationResult> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.settlement.findUnique({ where: { id: settlementId }, include: settlementInclude });
      if (!current) return { kind: "not_found" };
      if (current.status !== "auditing") return { kind: "invalid_status" };
      if (current.lines.some((line) => line.blockedReason !== null)) return { kind: "blocked" };

      const changed = await tx.settlement.updateMany({
        where: { id: settlementId, status: current.status },
        data: { status: "ready_for_review" },
      });
      if (changed.count !== 1) return { kind: "invalid_status" };

      await this.recordEvent(tx, {
        eventName: "pluggamob.settlement_approval_requested",
        entityType: "settlement",
        entityId: settlementId,
        context,
        payload: { previousStatus: current.status, status: "ready_for_review", note: note ?? null },
      });
      return this.reload(tx, settlementId);
    });
  }

  approve(
    settlementId: string,
    note: string | undefined,
    context: MutationContext,
  ): Promise<SettlementMutationResult> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.settlement.findUnique({ where: { id: settlementId }, include: settlementInclude });
      if (!current) return { kind: "not_found" };
      if (current.status !== "ready_for_review") return { kind: "invalid_status" };
      if (current.lines.some((line) => line.blockedReason !== null)) return { kind: "blocked" };

      const changed = await tx.settlement.updateMany({
        where: { id: settlementId, status: "ready_for_review" },
        data: { status: "approved" },
      });
      if (changed.count !== 1) return { kind: "invalid_status" };

      const amount = current.lines.reduce(
        (total, line) => total.add(line.amount ?? new Prisma.Decimal(0)),
        new Prisma.Decimal(0),
      );
      const availableAt = new Date(current.weekEnd);
      availableAt.setUTCDate(availableAt.getUTCDate() + 14);
      const credit = await tx.d14Credit.create({
        data: { settlementId, amount, status: "scheduled", availableAt },
      });

      await this.recordEvent(tx, {
        eventName: "pluggamob.settlement_approved",
        entityType: "settlement",
        entityId: settlementId,
        context,
        payload: {
          previousStatus: current.status,
          status: "approved",
          note: note ?? null,
          d14CreditId: credit.id,
          d14AvailableAt: availableAt.toISOString(),
          amount: amount.toFixed(2),
          externalTransferExecuted: false,
        },
      });
      return this.reload(tx, settlementId);
    });
  }

  private async reload(tx: Transaction, id: string): Promise<SettlementMutationResult> {
    const row = await tx.settlement.findUnique({ where: { id }, include: settlementInclude });
    return row ? { kind: "ok", settlement: this.mapSettlement(row) } : { kind: "not_found" };
  }

  private mapSettlement(row: SettlementRow): StoredSettlement {
    return {
      id: row.id,
      partner: row.partner,
      weekStart: row.weekStart,
      weekEnd: row.weekEnd,
      status: row.status,
      lines: row.lines.map((line) => ({
        id: line.id,
        sessionId: line.sessionId,
        tokenRfid: line.tokenRfid,
        classification: line.classification,
        amount: line.amount?.toFixed(2) ?? null,
        blockedReason: line.blockedReason,
        blockerAssignee: line.blockerAssignee,
        blockerEvidenceMissing: line.blockerEvidenceMissing,
        blockerNextAction: line.blockerNextAction,
      })),
    };
  }

  private recordEvent(
    tx: Transaction,
    event: {
      eventName: string;
      entityType: string;
      entityId: string;
      context: MutationContext;
      payload: Prisma.InputJsonValue;
    },
  ): Promise<unknown> {
    return tx.eventLog.create({
      data: {
        eventName: event.eventName,
        entityType: event.entityType,
        entityId: event.entityId,
        actorType: "user" satisfies ActorType,
        actorId: event.context.actorId,
        payload: event.payload,
        occurredAt: event.context.occurredAt,
      },
    });
  }
}
