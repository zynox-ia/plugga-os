import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseTestsEnabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "true";
const describeDatabase = databaseTestsEnabled ? describe : describe.skip;

describeDatabase("energy foundation constraints", () => {
  const prisma = new PrismaClient();

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("rejects a second cycle for the same consumer unit + competence", async () => {
    const consumerUnit = await prisma.consumerUnit.findFirst();
    if (!consumerUnit) throw new Error("seed did not create a consumer unit");

    await prisma.cycle.create({
      data: {
        clientId: consumerUnit.clientId,
        consumerUnitId: consumerUnit.id,
        competenceMonth: 1,
        competenceYear: 2099,
      },
    });

    await expect(
      prisma.cycle.create({
        data: {
          clientId: consumerUnit.clientId,
          consumerUnitId: consumerUnit.id,
          competenceMonth: 1,
          competenceYear: 2099,
        },
      }),
    ).rejects.toThrow();

    await prisma.cycle.deleteMany({ where: { consumerUnitId: consumerUnit.id, competenceYear: 2099 } });
  });

  it("rejects an audit whose origin is incoherent with its FKs", async () => {
    await expect(
      prisma.audit.create({
        data: {
          origin: "ciclo_mensal",
          type: "conferencia_fatura",
          // origin = ciclo_mensal requires cycleId set; leaving both null
          // must be rejected by the CHECK constraint, not just app code.
        },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.audit.create({
        data: {
          origin: "avulsa",
          type: "oportunidade",
          cycleId: (await prisma.cycle.findFirst())?.id,
        },
      }),
    ).rejects.toThrow();
  });
});
