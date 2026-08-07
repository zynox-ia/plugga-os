import { ConflictException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { AuthPrincipal } from "../../core/auth/auth.types";
import {
  type MutationContext,
  type SettlementMutationResult,
  SettlementsRepository,
  type StoredSettlement,
} from "./settlements.repository";
import { SettlementsService } from "./settlements.service";

const blockedSettlement: StoredSettlement = {
  id: "00000000-0000-4000-8000-000000000401",
  partner: {
    id: "00000000-0000-4000-8000-000000000501",
    key: "ev-point",
    name: "EV Point",
  },
  weekStart: new Date("2026-08-03T04:00:00.000Z"),
  weekEnd: new Date("2026-08-10T03:59:59.999Z"),
  status: "blocked",
  lines: [
    {
      id: "00000000-0000-4000-8000-000000000411",
      sessionId: null,
      tokenRfid: "MOCK-RFID-SEM-VALOR",
      classification: "rfid_physical",
      amount: null,
      blockedReason: "RFID físico sem valoração",
      blockerAssignee: "Financeiro PluggaMob",
      blockerEvidenceMissing: "Comprovante da tarifa",
      blockerNextAction: "Validar tarifa",
    },
  ],
};

class StubSettlementsRepository extends SettlementsRepository {
  readonly approveMock = vi.fn<
    (id: string, note: string | undefined, context: MutationContext) => Promise<SettlementMutationResult>
  >();
  readonly requestApprovalMock = vi.fn<
    (id: string, note: string | undefined, context: MutationContext) => Promise<SettlementMutationResult>
  >();

  async findCoupons() {
    return [];
  }
  async findSettlements() {
    return [blockedSettlement];
  }
  async findSettlement() {
    return blockedSettlement;
  }
  async findD14Credits() {
    return [];
  }
  async resolveBlocker() {
    return { kind: "ok", settlement: blockedSettlement } as const;
  }
  requestApproval(id: string, note: string | undefined, context: MutationContext) {
    return this.requestApprovalMock(id, note, context);
  }
  approve(id: string, note: string | undefined, context: MutationContext) {
    return this.approveMock(id, note, context);
  }
}

const principal = (roles: AuthPrincipal["roles"]): AuthPrincipal => ({
  id: "00000000-0000-4000-8000-000000000601",
  kind: "user",
  roles,
});

describe("SettlementsService", () => {
  it("builds the Pode fechar? panel with attributed blockers and TOKEN/RFID lines", async () => {
    const service = new SettlementsService(new StubSettlementsRepository());

    const detail = await service.settlement(blockedSettlement.id);

    expect(detail.canClosePanel).toEqual({
      canClose: false,
      blockerCount: 1,
      blockers: [
        {
          lineId: blockedSettlement.lines[0]?.id,
          reason: "RFID físico sem valoração",
          assignee: "Financeiro PluggaMob",
          evidenceMissing: "Comprovante da tarifa",
          nextAction: "Validar tarifa",
        },
      ],
    });
    expect(detail.lines[0]?.tokenRfid).toBe("MOCK-RFID-SEM-VALOR");
  });

  it("reports an open blocker as a conflict when approval is requested", async () => {
    const repository = new StubSettlementsRepository();
    repository.requestApprovalMock.mockResolvedValue({ kind: "blocked" });
    const service = new SettlementsService(repository);

    await expect(
      service.requestApproval(blockedSettlement.id, {}, principal(["financeiro"])),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("allows only financeiro or diretoria to approve, even if a repository is callable", async () => {
    const repository = new StubSettlementsRepository();
    const service = new SettlementsService(repository);

    await expect(
      service.approve(blockedSettlement.id, {}, principal(["pluggamob"])),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.approve(blockedSettlement.id, {}, principal(["admin"])),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.approve(blockedSettlement.id, {}, {
        id: "service:settlements-agent",
        kind: "service",
        roles: ["financeiro"],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.approveMock).not.toHaveBeenCalled();
  });

  it("returns the validated settlement after a clean financial approval", async () => {
    const repository = new StubSettlementsRepository();
    const approved = { ...blockedSettlement, status: "approved" as const, lines: [] };
    repository.approveMock.mockResolvedValue({ kind: "ok", settlement: approved });
    const service = new SettlementsService(repository);

    const result = await service.approve(
      blockedSettlement.id,
      { note: "Auditoria concluída" },
      principal(["financeiro"]),
    );

    expect(result.status).toBe("approved");
    expect(result.canClosePanel.canClose).toBe(true);
    expect(repository.approveMock).toHaveBeenCalledOnce();
  });
});
