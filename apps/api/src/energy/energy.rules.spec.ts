import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

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
  computeCycleCloseBlockers,
} from "./energy.rules";

const CYCLE_ID = "00000000-0000-4000-8000-000000000001";
const MIGRATION_ID = "00000000-0000-4000-8000-000000000002";

describe("assertAuditOriginMatchesLinks", () => {
  it("allows ciclo_mensal with only cycleId set", () => {
    expect(() => assertAuditOriginMatchesLinks("ciclo_mensal", CYCLE_ID, null)).not.toThrow();
  });

  it("rejects ciclo_mensal without cycleId", () => {
    expect(() => assertAuditOriginMatchesLinks("ciclo_mensal", null, null)).toThrow(BadRequestException);
  });

  it("rejects ciclo_mensal with both FKs set", () => {
    expect(() => assertAuditOriginMatchesLinks("ciclo_mensal", CYCLE_ID, MIGRATION_ID)).toThrow(BadRequestException);
  });

  it("allows migracao_ml with only marketMigrationId set", () => {
    expect(() => assertAuditOriginMatchesLinks("migracao_ml", null, MIGRATION_ID)).not.toThrow();
  });

  it("rejects migracao_ml without marketMigrationId", () => {
    expect(() => assertAuditOriginMatchesLinks("migracao_ml", null, null)).toThrow(BadRequestException);
  });

  it("rejects migracao_ml with cycleId set", () => {
    expect(() => assertAuditOriginMatchesLinks("migracao_ml", CYCLE_ID, null)).toThrow(BadRequestException);
  });

  it("allows avulsa with no FKs set", () => {
    expect(() => assertAuditOriginMatchesLinks("avulsa", null, null)).not.toThrow();
  });

  it("rejects avulsa with a cycleId set", () => {
    expect(() => assertAuditOriginMatchesLinks("avulsa", CYCLE_ID, null)).toThrow(BadRequestException);
  });

  it("rejects avulsa with a marketMigrationId set", () => {
    expect(() => assertAuditOriginMatchesLinks("avulsa", null, MIGRATION_ID)).toThrow(BadRequestException);
  });
});

describe("assertAuditCanBeResolved", () => {
  it.each(["em_analise", "divergencia_encontrada", "contestacao_aberta"] as const)(
    "allows resolving from %s",
    (status) => {
      expect(() => assertAuditCanBeResolved(status)).not.toThrow();
    },
  );

  it.each(["resolvida", "inconclusiva", "sem_divergencia"] as const)("blocks resolving an already-resolved audit (%s)", (status) => {
    expect(() => assertAuditCanBeResolved(status)).toThrow(BadRequestException);
  });
});

describe("assertAuditIsContestationType", () => {
  it("allows type contestacao", () => {
    expect(() => assertAuditIsContestationType("contestacao")).not.toThrow();
  });

  it.each(["conferencia_fatura", "validacao_migracao", "oportunidade"] as const)(
    "blocks opening a contestation from a %s audit",
    (type) => {
      expect(() => assertAuditIsContestationType(type)).toThrow(BadRequestException);
    },
  );
});

describe("assertAuditCanOpenContestation", () => {
  it.each(["em_analise", "divergencia_encontrada", "contestacao_aberta"] as const)("allows from %s", (status) => {
    expect(() => assertAuditCanOpenContestation(status)).not.toThrow();
  });

  it.each(["resolvida", "inconclusiva", "sem_divergencia"] as const)("blocks once audit is resolved (%s)", (status) => {
    expect(() => assertAuditCanOpenContestation(status)).toThrow(BadRequestException);
  });
});

describe("assertAuditHasNoContestation", () => {
  it("allows when there is none yet", () => {
    expect(() => assertAuditHasNoContestation(false)).not.toThrow();
  });

  it("blocks a second contestation on the same audit", () => {
    expect(() => assertAuditHasNoContestation(true)).toThrow(BadRequestException);
  });
});

describe("assertContestationTransitionAllowed", () => {
  it("walks the full happy path one step at a time", () => {
    expect(() => assertContestationTransitionAllowed("rascunho", "aberta")).not.toThrow();
    expect(() => assertContestationTransitionAllowed("aberta", "aguardando_distribuidora")).not.toThrow();
    expect(() => assertContestationTransitionAllowed("aguardando_distribuidora", "deferida")).not.toThrow();
    expect(() => assertContestationTransitionAllowed("aguardando_distribuidora", "indeferida")).not.toThrow();
    expect(() => assertContestationTransitionAllowed("aguardando_distribuidora", "parcialmente_deferida")).not.toThrow();
    expect(() => assertContestationTransitionAllowed("deferida", "encerrada")).not.toThrow();
    expect(() => assertContestationTransitionAllowed("indeferida", "encerrada")).not.toThrow();
    expect(() => assertContestationTransitionAllowed("parcialmente_deferida", "encerrada")).not.toThrow();
  });

  it("blocks skipping a state", () => {
    expect(() => assertContestationTransitionAllowed("rascunho", "aguardando_distribuidora")).toThrow(BadRequestException);
    expect(() => assertContestationTransitionAllowed("rascunho", "encerrada")).toThrow(BadRequestException);
  });

  it("blocks moving backward", () => {
    expect(() => assertContestationTransitionAllowed("aberta", "rascunho")).toThrow(BadRequestException);
  });

  it("blocks re-submitting the same status", () => {
    expect(() => assertContestationTransitionAllowed("aberta", "aberta")).toThrow(BadRequestException);
  });

  it("blocks any transition once encerrada", () => {
    expect(() => assertContestationTransitionAllowed("encerrada", "deferida")).toThrow(BadRequestException);
  });
});

describe("assertContestationCanClose", () => {
  it("allows closing when a financial result is present", () => {
    expect(() => assertContestationCanClose("encerrada", "1500.00")).not.toThrow();
  });

  it("blocks closing without a financial result", () => {
    expect(() => assertContestationCanClose("encerrada", null)).toThrow(BadRequestException);
    expect(() => assertContestationCanClose("encerrada", undefined)).toThrow(BadRequestException);
  });

  it("does not require a financial result for non-closing transitions", () => {
    expect(() => assertContestationCanClose("aberta", null)).not.toThrow();
  });
});

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
