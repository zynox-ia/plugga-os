import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { assertCycleCanClose, assertCycleHasOwnerAndNextAction, computeCycleCloseBlockers } from "./energy.rules";

const READY: Parameters<typeof assertCycleCanClose>[0] = {
  status: "validado_internamente",
  reportStatus: "aprovado",
  reportSentAt: new Date("2026-08-05T12:00:00.000Z"),
  audits: [{ status: "sem_divergencia", divergenceBlocksClosing: false }],
};

describe("computeCycleCloseBlockers", () => {
  it("returns no blockers when every condition is satisfied", () => {
    expect(computeCycleCloseBlockers(READY)).toEqual([]);
  });

  it("blocks when documents were never received", () => {
    const blockers = computeCycleCloseBlockers({ ...READY, status: "aguardando_documentos" });
    expect(blockers).toContain("fatura da distribuidora não recebida");
  });

  it("blocks when an audit is still open", () => {
    const blockers = computeCycleCloseBlockers({
      ...READY,
      audits: [{ status: "em_analise", divergenceBlocksClosing: false }],
    });
    expect(blockers).toContain("auditoria não concluída");
  });

  it("blocks when a divergence that blocks closing is unresolved", () => {
    const blockers = computeCycleCloseBlockers({
      ...READY,
      audits: [{ status: "divergencia_encontrada", divergenceBlocksClosing: true }],
    });
    expect(blockers).toContain("divergência encontrada impede o fechamento sem resolução");
  });

  it("closes even when a divergence exists but does not block closing", () => {
    const blockers = computeCycleCloseBlockers({
      ...READY,
      audits: [{ status: "resolvida", divergenceBlocksClosing: true }],
    });
    expect(blockers).toEqual([]);
  });

  it("blocks when the report is not approved", () => {
    const blockers = computeCycleCloseBlockers({ ...READY, reportStatus: "gerado" });
    expect(blockers).toContain("relatório de economia não aprovado internamente");
  });

  it("blocks when the report was never sent", () => {
    const blockers = computeCycleCloseBlockers({ ...READY, reportSentAt: null });
    expect(blockers).toContain("relatório ainda não foi enviado ao cliente");
  });
});

describe("assertCycleCanClose", () => {
  it("throws with the first blocker's message", () => {
    expect(() => assertCycleCanClose({ ...READY, status: "aguardando_documentos" })).toThrow(BadRequestException);
  });

  it("does not throw when ready", () => {
    expect(() => assertCycleCanClose(READY)).not.toThrow();
  });
});

describe("assertCycleHasOwnerAndNextAction", () => {
  it("throws when an active cycle has no owner", () => {
    expect(() => assertCycleHasOwnerAndNextAction("em_auditoria", null, new Date())).toThrow(BadRequestException);
  });

  it("throws when an active cycle has no next action", () => {
    expect(() => assertCycleHasOwnerAndNextAction("em_auditoria", "owner-1", null)).toThrow(BadRequestException);
  });

  it("allows a closed cycle to have no owner or next action", () => {
    expect(() => assertCycleHasOwnerAndNextAction("fechado", null, null)).not.toThrow();
  });
});
