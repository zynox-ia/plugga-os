import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import {
  assertContractCanActivate,
  assertContractHasOwnerAndNextAction,
  assertContractTransitionAllowed,
  assertOpportunityHasOwnerAndNextAction,
  assertOpportunityOpen,
} from "./commercial.rules";

describe("assertOpportunityOpen", () => {
  it("allows an open opportunity", () => {
    expect(() => assertOpportunityOpen("aberta")).not.toThrow();
  });

  it.each(["ganha", "perdida", "revisitar"] as const)("rejects a decided opportunity (%s)", (status) => {
    expect(() => assertOpportunityOpen(status)).toThrow(BadRequestException);
  });
});

describe("assertOpportunityHasOwnerAndNextAction", () => {
  it("passes when both are set", () => {
    expect(() => assertOpportunityHasOwnerAndNextAction("owner-1", new Date())).not.toThrow();
  });

  it("blocks when the owner is missing", () => {
    expect(() => assertOpportunityHasOwnerAndNextAction(null, new Date())).toThrow(BadRequestException);
  });

  it("blocks when the next action is missing", () => {
    expect(() => assertOpportunityHasOwnerAndNextAction("owner-1", null)).toThrow(BadRequestException);
  });

  it("blocks when both are missing", () => {
    expect(() => assertOpportunityHasOwnerAndNextAction(null, null)).toThrow(BadRequestException);
  });
});

describe("assertContractTransitionAllowed", () => {
  it("allows advancing exactly one step in the sequence", () => {
    expect(() => assertContractTransitionAllowed("rascunho", "revisao_interna")).not.toThrow();
    expect(() => assertContractTransitionAllowed("revisao_interna", "aguardando_assinatura")).not.toThrow();
    expect(() => assertContractTransitionAllowed("aguardando_assinatura", "ativo")).not.toThrow();
    expect(() => assertContractTransitionAllowed("ativo", "vencendo")).not.toThrow();
    expect(() => assertContractTransitionAllowed("vencendo", "encerrado")).not.toThrow();
  });

  it("allows re-submitting the same status (e.g. to only update owner/next action)", () => {
    expect(() => assertContractTransitionAllowed("revisao_interna", "revisao_interna")).not.toThrow();
  });

  it("blocks skipping a state", () => {
    expect(() => assertContractTransitionAllowed("rascunho", "ativo")).toThrow(BadRequestException);
  });

  it("blocks moving backward", () => {
    expect(() => assertContractTransitionAllowed("ativo", "rascunho")).toThrow(BadRequestException);
  });

  it("blocks any transition once encerrado", () => {
    expect(() => assertContractTransitionAllowed("encerrado", "vencendo")).toThrow(BadRequestException);
  });
});

describe("assertContractCanActivate", () => {
  it("allows activation when signed", () => {
    expect(() => assertContractCanActivate(new Date())).not.toThrow();
  });

  it("blocks activation without a signature — never assume signed", () => {
    expect(() => assertContractCanActivate(null)).toThrow(BadRequestException);
  });
});

describe("assertContractHasOwnerAndNextAction", () => {
  it("does not require owner/next action for a draft", () => {
    expect(() => assertContractHasOwnerAndNextAction("rascunho", null, null)).not.toThrow();
  });

  it("does not require owner/next action once encerrado", () => {
    expect(() => assertContractHasOwnerAndNextAction("encerrado", null, null)).not.toThrow();
  });

  it.each(["revisao_interna", "aguardando_assinatura", "ativo", "vencendo"] as const)(
    "requires owner and next action while %s",
    (status) => {
      expect(() => assertContractHasOwnerAndNextAction(status, null, new Date())).toThrow(BadRequestException);
      expect(() => assertContractHasOwnerAndNextAction(status, "owner-1", null)).toThrow(BadRequestException);
      expect(() => assertContractHasOwnerAndNextAction(status, "owner-1", new Date())).not.toThrow();
    },
  );
});
