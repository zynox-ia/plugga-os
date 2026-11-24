import { randomBytes, randomUUID } from "node:crypto";

import type { Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLeadSolarProjectRequestSchema, updateLeadSolarProjectRequestSchema } from "@plugga/shared";

import { NaoEncontrado, RequisicaoInvalida } from "../src/common/errors/dominio";
import type { AuthPrincipal } from "../src/core/auth/auth.types";
import { contextoBanco } from "../src/prisma/contexto-banco";
import { PrismaService } from "../src/prisma/prisma.service";
import { PrismaLeadProjetosSolaresRepository } from "../src/lead-projetos-solares/prisma-lead-projetos-solares.repository";
import { assertSafeTestDatabaseUrl } from "./safe-test-environment";

class RuntimePrisma extends PrismaService {
  override comContexto<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return super.comContexto(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL ROLE plugga_runtime");
      return fn(tx);
    });
  }
}

describe.skipIf(process.env.RUN_NEGOCIOS_INTEGRATION_TESTS !== "true")("projetos solares do lead", { timeout: 30_000 }, () => {
  const db = new PrismaService();
  const runtime = new RuntimePrisma();
  const repo = new PrismaLeadProjetosSolaresRepository(runtime);
  const prefix = `solar-proj-${randomUUID().slice(0, 8)}`;
  const users: { principal: AuthPrincipal; sessionHash: string }[] = [];
  let member: AuthPrincipal;
  let dealSolarId: string;
  let dealComumId: string;
  let pipelineSolarId: string;
  let pipelineComumId: string;
  const as = <T>(actor: AuthPrincipal, fn: () => Promise<T>) => contextoBanco.run({ sessionHash: users.find((u) => u.principal.id === actor.id)!.sessionHash }, fn);

  async function person() {
    const user = await db.user.create({
      data: {
        name: `${prefix} pessoa`,
        email: `${prefix}-${users.length}@teste.local`,
        departamentos: { create: { departamento: "crm", nivel: "membro", telas: ["crm.pipelines"] } },
      },
    });
    const principal: AuthPrincipal = { id: user.id, kind: "user", acesso: { plataforma: null, departamentos: [] } };
    const sessionHash = randomBytes(32).toString("hex");
    await db.session.create({
      data: {
        userId: user.id,
        tokenHash: sessionHash,
        expiresAt: new Date(Date.now() + 3_600_000),
        absoluteExpiresAt: new Date(Date.now() + 7_200_000),
      },
    });
    users.push({ principal, sessionHash });
    return principal;
  }

  beforeAll(async () => {
    assertSafeTestDatabaseUrl(process.env.DATABASE_URL!, process.env.CI === "true", process.env.PLUGGA_TEST_DB_PORT);
    await db.$connect();
    await runtime.$connect();
    await db.company.upsert({ where: { id: "plugga" }, create: { id: "plugga", name: "Plugga" }, update: {} });
    member = await person();
    const solar = await db.pipeline.create({
      data: {
        name: `${prefix}-solar`,
        companyId: "plugga",
        valueLabel: "Valor",
        color: "#0077FF",
        wonLabel: "Ganho",
        lostLabel: "Perdido",
        processProfile: { key: "solar_commercial", version: 1, bindings: {
          installationType: { fieldId: randomUUID(), options: { residential: randomUUID(), commercial: randomUUID(), rural: randomUUID() } },
          averageConsumptionKwh: { fieldId: randomUUID() },
          roofType: { fieldId: randomUUID() },
          availableAreaM2: { fieldId: randomUUID() },
          estimatedPowerKwp: { fieldId: randomUUID() },
        } },
        stages: { create: [{ name: "Contato", color: "#0077FF", position: 0 }] },
      },
      include: { stages: true },
    });
    pipelineSolarId = solar.id;
    const comum = await db.pipeline.create({
      data: {
        name: `${prefix}-comum`,
        companyId: "plugga",
        valueLabel: "Valor",
        color: "#0077FF",
        wonLabel: "Ganho",
        lostLabel: "Perdido",
        stages: { create: [{ name: "Contato", color: "#0077FF", position: 0 }] },
      },
      include: { stages: true },
    });
    pipelineComumId = comum.id;
    dealSolarId = (await db.deal.create({ data: { title: `${prefix}-solar`, pipelineId: solar.id, stageId: solar.stages[0]!.id, ownerId: member.id } })).id;
    dealComumId = (await db.deal.create({ data: { title: `${prefix}-comum`, pipelineId: comum.id, stageId: comum.stages[0]!.id, ownerId: member.id } })).id;
  });

  afterAll(async () => {
    await db.leadDocument.deleteMany({ where: { deal: { title: { startsWith: prefix } } } });
    await db.deal.deleteMany({ where: { title: { startsWith: prefix } } });
    if (pipelineSolarId) await db.pipeline.delete({ where: { id: pipelineSolarId } });
    if (pipelineComumId) await db.pipeline.delete({ where: { id: pipelineComumId } });
    await db.user.deleteMany({ where: { email: { startsWith: prefix } } });
    await runtime.$disconnect();
    await db.$disconnect();
  });

  it("lista vazio, cria projeto e rejeita pipeline sem Solar", async () => {
    await expect(as(member, () => repo.list(dealSolarId, member))).resolves.toEqual({ projects: [] });
    const versao = (await db.deal.findUniqueOrThrow({ where: { id: dealSolarId } })).version;
    const criado = await as(member, () => repo.create(dealSolarId, createLeadSolarProjectRequestSchema.parse({
      installationType: "rural",
      averageConsumptionKwh: "1840.5",
      consumerUnit: "004578912",
      energyBillDocumentIds: [],
      roofType: "metalico",
      availableAreaM2: "190",
      estimatedPowerKwp: "15.2",
      estimatedInvestment: "117500.00",
      version: versao,
    }), member)).then((resposta) => resposta.project);
    expect(criado.consumerUnit).toBe("004578912");
    const lista = await as(member, () => repo.list(dealSolarId, member));
    expect(lista.projects).toHaveLength(1);
    expect(lista.projects[0]?.id).toBe(criado.id);
    await expect(as(member, () => repo.list(dealComumId, member))).rejects.toBeInstanceOf(RequisicaoInvalida);
    await expect(as(member, () => repo.list(randomUUID(), member))).rejects.toBeInstanceOf(NaoEncontrado);
  });

  it("conta arquivada é preservada com aviso ao salvar outra alteração, mas uma conta nova indisponível é recusada", async () => {
    const conta = await db.leadDocument.create({ data: {
      dealId: dealSolarId, category: "conta_de_energia", originalName: "conta.pdf", safeName: "conta.pdf",
      detectedMime: "application/pdf", sizeBytes: 10, storageBucket: "plugga-arquivos",
      storageKey: `crm/leads/${dealSolarId}/${randomUUID()}-conta.pdf`, sha256: randomUUID().replace(/-/g, "").padEnd(64, "0"), uploadState: "ready",
    } });
    const versaoInicial = (await db.deal.findUniqueOrThrow({ where: { id: dealSolarId } })).version;
    const criado = await as(member, () => repo.create(dealSolarId, createLeadSolarProjectRequestSchema.parse({
      installationType: "residential", averageConsumptionKwh: "500", consumerUnit: "000111-0",
      energyBillDocumentIds: [conta.id], roofType: "laje", availableAreaM2: "", estimatedPowerKwp: "", estimatedInvestment: "",
      version: versaoInicial,
    }), member)).then((resposta) => resposta.project);

    // A conta referenciada fica indisponível depois de persistida no projeto (arquivada, ou
    // reclassificada — qualquer saída de category: conta_de_energia/uploadState: ready/archivedAt: null).
    await db.leadDocument.update({ where: { id: conta.id }, data: { archivedAt: new Date() } });

    const versaoAposCriar = (await db.deal.findUniqueOrThrow({ where: { id: dealSolarId } })).version;
    const preservado = await as(member, () => repo.update(dealSolarId, criado.id, updateLeadSolarProjectRequestSchema.parse({
      installationType: "residential", averageConsumptionKwh: "500", consumerUnit: "000111-0",
      energyBillDocumentIds: [conta.id], roofType: "laje", availableAreaM2: "", estimatedPowerKwp: "20", estimatedInvestment: "",
      version: versaoAposCriar,
    }), member)).then((resposta) => resposta.project);
    expect(preservado.estimatedPowerKwp).toBe("20");
    expect(preservado.energyBillDocumentIds).toEqual([conta.id]);

    const versaoAposPreservar = (await db.deal.findUniqueOrThrow({ where: { id: dealSolarId } })).version;
    await expect(as(member, () => repo.update(dealSolarId, criado.id, updateLeadSolarProjectRequestSchema.parse({
      installationType: "residential", averageConsumptionKwh: "500", consumerUnit: "000111-0",
      energyBillDocumentIds: [conta.id, randomUUID()], roofType: "laje", availableAreaM2: "", estimatedPowerKwp: "20", estimatedInvestment: "",
      version: versaoAposPreservar,
    }), member))).rejects.toBeInstanceOf(RequisicaoInvalida);
  });
});
