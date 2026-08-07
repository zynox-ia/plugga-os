import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import {
  assertMarketMigrationHasOwnerAndNextAction,
  assertMarketMigrationOpen,
  assertMarketMigrationStageTransitionAllowed,
} from "./energy.rules";

describe("assertMarketMigrationOpen", () => {
  it("allows an in-progress migration", () => {
    expect(() => assertMarketMigrationOpen("em_andamento")).not.toThrow();
  });

  it.each(["ativa", "cancelada"] as const)("rejects a decided migration (%s)", (status) => {
    expect(() => assertMarketMigrationOpen(status)).toThrow(BadRequestException);
  });
});

describe("assertMarketMigrationHasOwnerAndNextAction", () => {
  it("passes when both are set", () => {
    expect(() => assertMarketMigrationHasOwnerAndNextAction("owner-1", new Date())).not.toThrow();
  });

  it("blocks when the owner is missing", () => {
    expect(() => assertMarketMigrationHasOwnerAndNextAction(null, new Date())).toThrow(BadRequestException);
  });

  it("blocks when the next action is missing", () => {
    expect(() => assertMarketMigrationHasOwnerAndNextAction("owner-1", null)).toThrow(BadRequestException);
  });

  it("blocks when both are missing", () => {
    expect(() => assertMarketMigrationHasOwnerAndNextAction(null, null)).toThrow(BadRequestException);
  });
});

describe("assertMarketMigrationStageTransitionAllowed", () => {
  it("allows advancing exactly one step in the sequence", () => {
    expect(() => assertMarketMigrationStageTransitionAllowed("analise", "contratacao")).not.toThrow();
    expect(() => assertMarketMigrationStageTransitionAllowed("contratacao", "documentacao")).not.toThrow();
    expect(() => assertMarketMigrationStageTransitionAllowed("documentacao", "denuncia")).not.toThrow();
    expect(() => assertMarketMigrationStageTransitionAllowed("denuncia", "ativacao")).not.toThrow();
  });

  it("allows re-submitting the same stage (e.g. to only update owner/next action)", () => {
    expect(() => assertMarketMigrationStageTransitionAllowed("contratacao", "contratacao")).not.toThrow();
  });

  it("blocks skipping a stage", () => {
    expect(() => assertMarketMigrationStageTransitionAllowed("analise", "documentacao")).toThrow(BadRequestException);
  });

  it("blocks moving backward", () => {
    expect(() => assertMarketMigrationStageTransitionAllowed("ativacao", "analise")).toThrow(BadRequestException);
  });

  it("blocks any transition once at ativacao", () => {
    expect(() => assertMarketMigrationStageTransitionAllowed("ativacao", "denuncia")).toThrow(BadRequestException);
  });
});
