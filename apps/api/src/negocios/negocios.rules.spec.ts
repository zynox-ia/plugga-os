import { createDealRequestSchema, loseDealRequestSchema } from "@plugga/shared";
import { describe, expect, it } from "vitest";

import { foraDe, hojeNoFuso, problemaDaPerda } from "./negocios.rules";

const ID = "00000000-0000-4000-8000-000000000001";

describe("perda do negócio", () => {
  const hoje = "2026-10-19";

  it("sem motivo, não perde", () => {
    expect(problemaDaPerda(null, null, hoje)?.campo).toBe("lossReasonId");
  });

  it("motivo que pede revisita exige a data, que não pode estar no passado", () => {
    expect(problemaDaPerda({ asksRevisitDate: true }, null, hoje)?.campo).toBe("revisitOn");
    expect(problemaDaPerda({ asksRevisitDate: true }, "2026-10-18", hoje)?.problema).toMatch(/passado/);
    expect(problemaDaPerda({ asksRevisitDate: true }, "2027-01-10", hoje)).toBeNull();
  });

  it("motivo comum perde sem data", () => {
    expect(problemaDaPerda({ asksRevisitDate: false }, null, hoje)).toBeNull();
  });

  it("o contrato exige o motivo", () => {
    expect(loseDealRequestSchema.safeParse({}).success).toBe(false);
    expect(loseDealRequestSchema.parse({ lossReasonId: ID, revisitOn: "" }).revisitOn).toBeNull();
  });
});

describe("hoje no fuso da operação", () => {
  it("conta o dia em Manaus, não em UTC", () => {
    // 02h UTC de 20/10 ainda é 22h de 19/10 em Manaus (UTC-4).
    expect(hojeNoFuso(new Date("2026-10-20T02:00:00Z"))).toBe("2026-10-19");
  });
});

describe("contrato de criação do negócio", () => {
  const valido = { pipelineId: ID, stageId: ID, clientId: ID, ownerId: ID, title: "Galpão logístico — 150 kWp" };

  it("valor e previsão em branco viram nulos; listas começam vazias", () => {
    const negocio = createDealRequestSchema.parse({ ...valido, value: "", expectedCloseDate: "" });
    expect(negocio.value).toBeNull();
    expect(negocio.expectedCloseDate).toBeNull();
    expect(negocio.tagIds).toEqual([]);
  });

  it("recusa data inexistente e valor com mais de duas casas", () => {
    expect(createDealRequestSchema.safeParse({ ...valido, expectedCloseDate: "2026-02-30" }).success).toBe(false);
    expect(createDealRequestSchema.safeParse({ ...valido, value: "10.555" }).success).toBe(false);
    expect(createDealRequestSchema.safeParse({ ...valido, value: "620000.00", expectedCloseDate: "2026-12-15" }).success).toBe(true);
  });

  it("aponta ids fora do permitido", () => {
    expect(foraDe(["a", "b"], ["a"])).toEqual(["b"]);
  });
});
