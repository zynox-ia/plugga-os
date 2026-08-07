import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  couponsResponseSchema,
  d14CreditsResponseSchema,
  settlementDetailSchema,
  settlementsResponseSchema,
  type CouponsResponse,
  type D14CreditsResponse,
  type ResolveSettlementBlockerRequest,
  type SettlementDecisionRequest,
  type SettlementDetail,
  type SettlementSummary,
  type SettlementsResponse,
} from "@plugga/shared";

import type { AuthPrincipal } from "../../core/auth/auth.types";
import {
  type SettlementMutationResult,
  SettlementsRepository,
  type StoredSettlement,
} from "./settlements.repository";

@Injectable()
export class SettlementsService {
  constructor(@Inject(SettlementsRepository) private readonly repository: SettlementsRepository) {}

  async coupons(): Promise<CouponsResponse> {
    const items = await this.repository.findCoupons();
    return couponsResponseSchema.parse({
      mode: "mock",
      items: items.map((coupon) => ({ ...coupon, createdAt: coupon.createdAt.toISOString() })),
    });
  }

  async settlements(): Promise<SettlementsResponse> {
    const settlements = await this.repository.findSettlements();
    return settlementsResponseSchema.parse({
      mode: "mock",
      items: settlements.map((settlement) => this.summary(settlement)),
    });
  }

  async settlement(id: string): Promise<SettlementDetail> {
    const settlement = await this.repository.findSettlement(id);
    if (!settlement) throw new NotFoundException("settlement not found");
    return this.detail(settlement);
  }

  async d14Credits(): Promise<D14CreditsResponse> {
    const items = await this.repository.findD14Credits();
    return d14CreditsResponseSchema.parse({
      mode: "mock",
      items: items.map((credit) => ({ ...credit, availableAt: credit.availableAt.toISOString() })),
    });
  }

  async resolveBlocker(
    id: string,
    input: ResolveSettlementBlockerRequest,
    principal: AuthPrincipal,
  ): Promise<SettlementDetail> {
    this.requireRole(principal, ["financeiro", "admin"]);
    const result = await this.repository.resolveBlocker(id, input.lineId, input.resolution, {
      actorId: principal.id,
      occurredAt: new Date(),
    });
    return this.unwrap(result);
  }

  async requestApproval(
    id: string,
    input: SettlementDecisionRequest,
    principal: AuthPrincipal,
  ): Promise<SettlementDetail> {
    this.requireRole(principal, ["pluggamob", "financeiro", "admin"]);
    const result = await this.repository.requestApproval(id, input.note, {
      actorId: principal.id,
      occurredAt: new Date(),
    });
    return this.unwrap(result);
  }

  async approve(
    id: string,
    input: SettlementDecisionRequest,
    principal: AuthPrincipal,
  ): Promise<SettlementDetail> {
    this.requireRole(principal, ["financeiro", "diretoria"]);
    const result = await this.repository.approve(id, input.note, {
      actorId: principal.id,
      occurredAt: new Date(),
    });
    return this.unwrap(result);
  }

  private unwrap(result: SettlementMutationResult): SettlementDetail {
    switch (result.kind) {
      case "ok":
        return this.detail(result.settlement);
      case "not_found":
        throw new NotFoundException("settlement not found");
      case "line_not_found":
        throw new NotFoundException("open settlement blocker not found");
      case "blocked":
        throw new ConflictException("settlement has open blockers");
      case "invalid_status":
        throw new ConflictException("settlement status does not allow this transition");
    }
  }

  private detail(settlement: StoredSettlement): SettlementDetail {
    const blockers = settlement.lines.flatMap((line) =>
      line.blockedReason
        ? [
            {
              lineId: line.id,
              reason: line.blockedReason,
              assignee: line.blockerAssignee ?? "Financeiro PluggaMob",
              evidenceMissing: line.blockerEvidenceMissing ?? "Evidência não informada",
              nextAction: line.blockerNextAction ?? "Revisar divergência",
            },
          ]
        : [],
    );
    return settlementDetailSchema.parse({
      ...this.summary(settlement),
      lines: settlement.lines.map((line) => ({
        id: line.id,
        sessionId: line.sessionId,
        tokenRfid: line.tokenRfid,
        classification: line.classification,
        amount: line.amount,
        blockedReason: line.blockedReason,
      })),
      canClosePanel: {
        canClose: blockers.length === 0,
        blockerCount: blockers.length,
        blockers,
      },
    });
  }

  private summary(settlement: StoredSettlement): SettlementSummary {
    const blockerCount = settlement.lines.filter((line) => line.blockedReason !== null).length;
    return {
      id: settlement.id,
      partner: settlement.partner,
      weekStart: settlement.weekStart.toISOString(),
      weekEnd: settlement.weekEnd.toISOString(),
      status: settlement.status,
      lineCount: settlement.lines.length,
      amount: this.sumMoney(settlement.lines.map((line) => line.amount)),
      canClose: blockerCount === 0,
      blockerCount,
    };
  }

  private sumMoney(amounts: Array<string | null>): string {
    const cents = amounts.reduce((total, amount) => {
      if (!amount) return total;
      const [whole = "0", fraction] = amount.split(".");
      return total + BigInt(whole) * 100n + BigInt((fraction ?? "").padEnd(2, "0").slice(0, 2));
    }, 0n);
    return `${cents / 100n}.${(cents % 100n).toString().padStart(2, "0")}`;
  }

  private requireRole(principal: AuthPrincipal | undefined, allowed: AuthPrincipal["roles"]): void {
    if (
      !principal ||
      principal.kind !== "user" ||
      !allowed.some((role) => principal.roles.includes(role))
    ) {
      throw new ForbiddenException("principal does not have a required role");
    }
  }
}
