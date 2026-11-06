import { randomBytes, randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { telasPorDepartamento } from "@plugga/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assertSafeTestDatabaseUrl } from "./safe-test-environment";

const HABILITADO = process.env.RUN_VINCULOS_INTEGRATION_TESTS === "true";

describe.skipIf(!HABILITADO)("coerência persistida da equipe e das identidades de IA", () => {
  const db = new PrismaClient();
  const marca = `vinculos_${randomUUID()}`;
  const usuarios: string[] = [];
  let agenteId: string;
  let adminRoleId: string;
  let devRoleId: string;
  let estudoId: string | undefined;
  let clienteId: string | undefined;
  let premissaId: string | undefined;
  let ambienteValidado = false;

  async function usuario() {
    const user = await db.user.create({ data: { name: marca, email: `${randomUUID()}@sintetico.invalid` } });
    usuarios.push(user.id);
    return user.id;
  }

  beforeAll(async () => {
    assertSafeTestDatabaseUrl(process.env.DATABASE_URL!, process.env.CI === "true", process.env.PLUGGA_TEST_DB_PORT);
    ambienteValidado = true;
    const admin = await db.role.upsert({ where: { key: "admin" }, create: { key: "admin", name: "Admin" }, update: {} });
    const dev = await db.role.upsert({ where: { key: "desenvolvedor" }, create: { key: "desenvolvedor", name: "Desenvolvedor" }, update: {} });
    adminRoleId = admin.id;
    devRoleId = dev.id;
    agenteId = await usuario();
    await db.$transaction(async (tx) => {
      await tx.userDepartamento.create({ data: { userId: agenteId, departamento: "crm", nivel: "membro", telas: ["crm.pipelines"] } });
      await tx.agentIdentity.create({ data: { userId: agenteId, departamento: "crm" } });
    });
  });

  afterAll(async () => {
    if (ambienteValidado) {
      if (estudoId) await db.energyEfficiencyStudy.delete({ where: { id: estudoId } });
      if (clienteId) await db.client.delete({ where: { id: clienteId } });
      if (premissaId) await db.energyPremiseVersion.delete({ where: { id: premissaId } });
      await db.user.deleteMany({ where: { id: { in: usuarios } } });
    }
    await db.$disconnect();
  });

  it("o banco aceita o catálogo shared e recusa telas alheias, repetidas e desconhecidas", async () => {
    const userId = await usuario();
    for (const [departamento, telas] of Object.entries(telasPorDepartamento)) {
      await db.userDepartamento.create({ data: { userId, departamento, nivel: "membro", telas: [...telas] } });
    }
    for (const telas of [["financeiro.receber"], ["crm.pipelines", "crm.pipelines"], ["crm.inventada"]]) {
      await expect(db.userDepartamento.update({ where: { userId_departamento: { userId, departamento: "crm" } }, data: { telas } })).rejects.toThrow();
    }
  });

  it("plataforma não coexiste com departamento e desenvolvedor requer admin na mesma transação", async () => {
    const userId = await usuario();
    await db.userDepartamento.create({ data: { userId, departamento: "crm", nivel: "membro", telas: [] } });
    await expect(db.userPlatformRole.create({ data: { userId, roleId: adminRoleId } })).rejects.toThrow();
    await db.userDepartamento.deleteMany({ where: { userId } });
    await expect(db.userPlatformRole.create({ data: { userId, roleId: devRoleId } })).rejects.toThrow();
    await db.$transaction(async (tx) => {
      await tx.userPlatformRole.createMany({ data: [{ userId, roleId: devRoleId }, { userId, roleId: adminRoleId }] });
    });
    expect(await db.userPlatformRole.count({ where: { userId } })).toBe(2);
    await db.$transaction(async (tx) => {
      await tx.userPlatformRole.deleteMany({ where: { userId } });
      await tx.userDepartamento.create({ data: { userId, departamento: "crm", nivel: "membro", telas: [] } });
    });
    expect(await db.userDepartamento.count({ where: { userId } })).toBe(1);
  });

  it("concessões concorrentes não criam plataforma e departamento contraditórios", async () => {
    const userId = await usuario();
    const resultados = await Promise.allSettled([
      db.$transaction((tx) => tx.userPlatformRole.create({ data: { userId, roleId: adminRoleId } })),
      db.$transaction((tx) => tx.userDepartamento.create({ data: { userId, departamento: "crm", nivel: "membro", telas: [] } })),
    ]);
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await db.userPlatformRole.count({ where: { userId } })) + (await db.userDepartamento.count({ where: { userId } }))).toBe(1);
  });

  it("agente conserva vínculo único de membro inclusive após substituir concessões", async () => {
    await expect(db.agentIdentity.create({ data: { userId: randomUUID(), departamento: "crm" } })).rejects.toThrow();
    await expect(db.agentIdentity.update({ where: { userId: agenteId }, data: { departamento: "financeiro" } })).rejects.toThrow();
    await expect(db.userDepartamento.update({ where: { userId_departamento: { userId: agenteId, departamento: "crm" } }, data: { nivel: "gerente" } })).rejects.toThrow();
    await expect(db.userPlatformRole.create({ data: { userId: agenteId, roleId: adminRoleId } })).rejects.toThrow();
    await db.$transaction(async (tx) => {
      await tx.userDepartamento.deleteMany({ where: { userId: agenteId } });
      await tx.userDepartamento.create({ data: { userId: agenteId, departamento: "crm", nivel: "membro", telas: ["crm.clientes"] } });
    });
    expect((await db.userDepartamento.findUniqueOrThrow({ where: { userId_departamento: { userId: agenteId, departamento: "crm" } } })).telas).toEqual(["crm.clientes"]);
  });

  it("identidade de IA não recebe senha, sessão, convite nem identidade federada de pessoa", async () => {
    const hash = randomBytes(32).toString("hex");
    const prazo = new Date(Date.now() + 60_000);
    await expect(db.userCredential.create({ data: { userId: agenteId, passwordHash: hash } })).rejects.toThrow();
    await expect(db.session.create({ data: { userId: agenteId, tokenHash: hash, expiresAt: prazo, absoluteExpiresAt: prazo } })).rejects.toThrow();
    await expect(db.authToken.create({ data: { userId: agenteId, tokenHash: hash, type: "invite", expiresAt: prazo } })).rejects.toThrow();
    await expect(db.userIdentity.create({ data: { userId: agenteId, provider: "google", subject: randomUUID(), emailAtLink: "sintetico@invalid.test", lastObservedEmail: "sintetico@invalid.test" } })).rejects.toThrow();
  });

  it("autoria de estudo tem FK real, recusa órfãos e preserva referência histórica", async () => {
    const ownerId = await usuario();
    const cliente = await db.client.create({ data: { name: marca } });
    clienteId = cliente.id;
    const unidade = await db.consumerUnit.create({ data: { clientId: cliente.id, code: marca, distributor: "Sintético" } });
    const premissa = await db.energyPremiseVersion.create({ data: {
      versao: marca, vigenteDe: new Date(), bessModelo: "Sintético", bessCapacidadeNominalKwh: 100, bessCapacidadeUtilKwh: 90,
      bessPotenciaKw: 50, bessEficienciaCiclo: 0.9, bessCapexPorUnidade: 1, fvCapexPorKwp: 1, fvProdutividadeKwhPorKwpMes: 100,
      fvPercentualAtendimento: 0.5, horizonteAnos: 10, tmaAnual: 0.1, reajusteTarifarioAnual: 0.01,
      toleranciaUltrapassagem: 0.05, alteracaoDemandaMinima: 0.1, alteracaoDemandaMaxima: 0.5,
    } });
    premissaId = premissa.id;
    const estudo = await db.energyEfficiencyStudy.create({ data: { clientId: cliente.id, consumerUnitId: unidade.id, competenceMonth: 1, competenceYear: 2026, premiseVersionId: premissa.id, invoiceData: {}, ownerId, createdById: ownerId, approvedById: ownerId } });
    estudoId = estudo.id;
    for (const campo of ["ownerId", "createdById", "approvedById"] as const) {
      await expect(db.energyEfficiencyStudy.update({ where: { id: estudo.id }, data: { [campo]: randomUUID() } })).rejects.toThrow();
    }
    await expect(db.user.delete({ where: { id: ownerId } })).rejects.toThrow();
    expect((await db.energyEfficiencyStudy.findUniqueOrThrow({ where: { id: estudo.id } })).ownerId).toBe(ownerId);
    await expect(db.energyInvoiceTypeApproval.create({ data: { key: marca, distributor: "Sintético", regime: "Sintético", modality: "Sintético", groupCode: "Sintético", approvedById: randomUUID(), approvedByText: "Sintético", approvedAt: new Date() } })).rejects.toThrow();
  });
});
