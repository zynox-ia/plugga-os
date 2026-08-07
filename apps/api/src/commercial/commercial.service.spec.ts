import { BadRequestException } from "@nestjs/common";
import type { OpportunityDetail } from "@plugga/shared";
import { describe, expect, it } from "vitest";

import type { AuthPrincipal } from "../core/auth/auth.types";
import { CommercialRepository } from "./commercial.repository";
import { CommercialService } from "./commercial.service";

const principal: AuthPrincipal = { id: "00000000-0000-4000-8000-000000000001", kind: "user", roles: ["comercial"] };

const baseOpportunity: OpportunityDetail = {
  id: "00000000-0000-4000-8000-000000000010",
  title: "Hotel Rio Negro",
  product: "OPM",
  stage: "decisao",
  status: "aberta",
  ownerId: "00000000-0000-4000-8000-000000000002",
  ownerName: "Thiago",
  clientId: null,
  clientName: null,
  estimatedValue: null,
  nextActionAt: "2026-08-10T12:00:00.000Z",
  nextActionNote: "Confirmar escopo",
  lossReason: null,
  decidedAt: null,
  createdAt: "2026-08-01T12:00:00.000Z",
  updatedAt: "2026-08-01T12:00:00.000Z",
  contacts: [],
  contracts: [],
};

function fakeRepository(overrides: Partial<CommercialRepository> = {}): CommercialRepository {
  const notUsed = async () => {
    throw new Error("not used");
  };
  return {
    listOpportunities: notUsed,
    opportunity: notUsed,
    createOpportunity: notUsed,
    updateOpportunityStage: notUsed,
    registerOpportunityContact: notUsed,
    winOpportunity: notUsed,
    loseOpportunity: notUsed,
    revisitOpportunity: notUsed,
    listContracts: notUsed,
    contract: notUsed,
    createContract: notUsed,
    updateContractStatus: notUsed,
    ...overrides,
  };
}

describe("CommercialService", () => {
  it("is a thin passthrough to the repository for reads", async () => {
    const repository = fakeRepository({
      opportunity: async (id) => {
        expect(id).toBe(baseOpportunity.id);
        return baseOpportunity;
      },
    });

    const result = await new CommercialService(repository).opportunity(baseOpportunity.id);
    expect(result).toEqual(baseOpportunity);
  });

  it("forwards the win request and principal to the repository unchanged", async () => {
    const repository = fakeRepository({
      winOpportunity: async (id, input, actor) => {
        expect(id).toBe(baseOpportunity.id);
        expect(input).toEqual({ clientId: "00000000-0000-4000-8000-000000000099" });
        expect(actor).toBe(principal);
        return { ...baseOpportunity, status: "ganha", clientId: input.clientId ?? null };
      },
    });

    const result = await new CommercialService(repository).winOpportunity(
      baseOpportunity.id,
      { clientId: "00000000-0000-4000-8000-000000000099" },
      principal,
    );
    expect(result.status).toBe("ganha");
  });

  it("propagates a blocking rejection from the repository instead of swallowing it", async () => {
    const repository = fakeRepository({
      loseOpportunity: async () => {
        throw new BadRequestException("oportunidade já foi decidida");
      },
    });

    await expect(
      new CommercialService(repository).loseOpportunity(baseOpportunity.id, { lossReason: "orçamento" }, principal),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
