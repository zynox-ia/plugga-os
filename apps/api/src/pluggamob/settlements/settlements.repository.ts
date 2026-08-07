import type { SettlementStatus } from "@plugga/shared";

export interface StoredCoupon {
  id: string;
  code: string;
  status: string;
  createdAt: Date;
}

export interface StoredSettlementLine {
  id: string;
  sessionId: string | null;
  tokenRfid: string | null;
  classification: string;
  amount: string | null;
  blockedReason: string | null;
  blockerAssignee: string | null;
  blockerEvidenceMissing: string | null;
  blockerNextAction: string | null;
}

export interface StoredSettlement {
  id: string;
  partner: { id: string; key: string; name: string };
  weekStart: Date;
  weekEnd: Date;
  status: SettlementStatus;
  lines: StoredSettlementLine[];
}

export interface StoredD14Credit {
  id: string;
  settlementId: string;
  partnerName: string;
  amount: string;
  status: string;
  availableAt: Date;
}

export interface MutationContext {
  actorId: string;
  occurredAt: Date;
}

export type SettlementMutationResult =
  | { kind: "ok"; settlement: StoredSettlement }
  | { kind: "not_found" }
  | { kind: "line_not_found" }
  | { kind: "blocked" }
  | { kind: "invalid_status" };

export abstract class SettlementsRepository {
  abstract findCoupons(): Promise<StoredCoupon[]>;
  abstract findSettlements(): Promise<StoredSettlement[]>;
  abstract findSettlement(id: string): Promise<StoredSettlement | null>;
  abstract findD14Credits(): Promise<StoredD14Credit[]>;
  abstract resolveBlocker(
    settlementId: string,
    lineId: string,
    resolution: string,
    context: MutationContext,
  ): Promise<SettlementMutationResult>;
  abstract requestApproval(
    settlementId: string,
    note: string | undefined,
    context: MutationContext,
  ): Promise<SettlementMutationResult>;
  abstract approve(
    settlementId: string,
    note: string | undefined,
    context: MutationContext,
  ): Promise<SettlementMutationResult>;
}
