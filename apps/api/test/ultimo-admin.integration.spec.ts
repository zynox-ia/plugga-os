import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import type { UserAccess } from "@plugga/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditAppender } from "../src/audit/audit-appender.js";
import { PrismaAuthRepository } from "../src/auth/prisma-auth.repository.js";
import { EstadoInvalido } from "../src/common/errors/dominio.js";
import { PrismaService } from "../src/prisma/prisma.service.js";

/**
 * "Última pessoa administradora" sob concorrência (FR-029), contra o Postgres
 * de verdade. Exige banco no ar:
 *
 *     RUN_ATOMICIDADE_INTEGRATION_TESTS=true pnpm --filter @plugga/api test
 *
 * A regra conta TODOS os admins ativos da plataforma, e o banco compartilhado
 * já tem os admins do seed: com eles ali, "exatamente dois" nunca se
 * reproduziria. Por isso o teste cria um banco PRÓPRIO e descartável no mesmo
 * servidor (migrations aplicadas nele, só os papéis necessários inseridos) e o
 * remove no fim. O banco compartilhado e os admins do seed não são tocados.
 */
const HABILITADO = process.env.RUN_ATOMICIDADE_INTEGRATION_TESTS === "true";

const PRAZO_MS = 120_000;
const RODADAS = 8;

const SEM_ADMIN: UserAccess = {
  platformRoles: [],
  companies: [{ companyId: "plugga", roles: ["viewer"], departments: [] }],
};
const COM_ADMIN: UserAccess = { platformRoles: ["admin"], companies: [] };

describe.skipIf(!HABILITADO)("último administrador sob concorrência", () => {
  const urlBase = process.env.DATABASE_URL ?? "";
  const nomeDoBanco = `ultimo_admin_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const urlDoBanco = urlBase.replace(/\/[^/?]+(\?|$)/, `/${nomeDoBanco}$1`);

  const manutencao = new PrismaService({ datasourceUrl: urlBase });
  let prisma: PrismaService;
  let repositorio: PrismaAuthRepository;
  let ator: string;
  let a: string;
  let b: string;

  beforeAll(async () => {
    await manutencao.$connect();
    await manutencao.$executeRawUnsafe(`CREATE DATABASE "${nomeDoBanco}"`);
    execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
      env: { ...process.env, DATABASE_URL: urlDoBanco },
      stdio: "pipe",
    });
    prisma = new PrismaService({ datasourceUrl: urlDoBanco });
    await prisma.$connect();
    repositorio = new PrismaAuthRepository(prisma, new AuditAppender());
    await prisma.role.createMany({
      data: [
        { key: "admin", name: "Administrador" },
        { key: "viewer", name: "Leitor" },
      ],
      skipDuplicates: true,
    });
    await prisma.company.upsert({
      where: { id: "plugga" },
      create: { id: "plugga", name: "Plugga" },
      update: {},
    });
    const criar = async (nome: string) =>
      (await prisma.user.create({ data: { email: `${nome}@teste.local`, name: nome, status: "active" } })).id;
    ator = await criar("ator");
    a = await criar("a");
    b = await criar("b");
  }, PRAZO_MS);

  afterAll(async () => {
    await prisma?.$disconnect();
    await manutencao.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${nomeDoBanco}" WITH (FORCE)`);
    await manutencao.$disconnect();
  }, PRAZO_MS);

  /** Estado de partida de cada rodada: A e B admins ativos, e mais ninguém. */
  async function prepararDoisAdmins(): Promise<void> {
    await prisma.userPlatformRole.deleteMany({});
    await prisma.userCompanyMembership.deleteMany({});
    await prisma.user.updateMany({ data: { status: "active" } });
    const admin = await prisma.role.findUniqueOrThrow({ where: { key: "admin" } });
    await prisma.userPlatformRole.createMany({
      data: [
        { userId: a, roleId: admin.id },
        { userId: b, roleId: admin.id },
      ],
    });
  }

  async function adminsAtivos(): Promise<number> {
    return prisma.userPlatformRole.count({
      where: { role: { key: "admin" }, user: { status: "active" } },
    });
  }

  function umaPassaEUmaFalha(resultados: PromiseSettledResult<unknown>[]): void {
    const falhas = resultados.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(falhas).toHaveLength(1);
    expect(falhas[0]?.reason).toBeInstanceOf(EstadoInvalido);
  }

  it(
    "dois rebaixamentos simultâneos dos dois únicos admins deixam um",
    async () => {
      for (let i = 0; i < RODADAS; i += 1) {
        await prepararDoisAdmins();
        const resultados = await Promise.allSettled([
          repositorio.replaceAccess(a, SEM_ADMIN, ator),
          repositorio.replaceAccess(b, SEM_ADMIN, ator),
        ]);
        umaPassaEUmaFalha(resultados);
        expect(await adminsAtivos()).toBe(1);
      }
    },
    PRAZO_MS,
  );

  it(
    "duas desativações simultâneas dos dois únicos admins deixam um",
    async () => {
      for (let i = 0; i < RODADAS; i += 1) {
        await prepararDoisAdmins();
        const resultados = await Promise.allSettled([
          repositorio.deactivateUser(a, ator),
          repositorio.deactivateUser(b, ator),
        ]);
        umaPassaEUmaFalha(resultados);
        expect(await adminsAtivos()).toBe(1);
      }
    },
    PRAZO_MS,
  );

  it(
    "rebaixar um e desativar o outro ao mesmo tempo deixa um",
    async () => {
      for (let i = 0; i < RODADAS; i += 1) {
        await prepararDoisAdmins();
        const resultados = await Promise.allSettled([
          repositorio.replaceAccess(a, SEM_ADMIN, ator),
          repositorio.deactivateUser(b, ator),
        ]);
        umaPassaEUmaFalha(resultados);
        expect(await adminsAtivos()).toBe(1);
      }
    },
    PRAZO_MS,
  );

  it(
    "o evento sai com a escrita, e a recusa não grava nada",
    async () => {
      await prepararDoisAdmins();
      const nomes = ["auth.access.changed", "auth.user.deactivated"];
      const antes = await prisma.eventLog.count({ where: { eventName: { in: nomes } } });
      const ultimo = await prisma.eventLog.findFirst({
        where: { eventName: { in: nomes } },
        orderBy: { occurredAt: "desc" },
      });

      await repositorio.replaceAccess(a, SEM_ADMIN, ator);
      await expect(repositorio.deactivateUser(b, ator)).rejects.toBeInstanceOf(EstadoInvalido);
      await expect(repositorio.replaceAccess(b, SEM_ADMIN, ator)).rejects.toBeInstanceOf(EstadoInvalido);

      const eventos = await prisma.eventLog.findMany({ where: { eventName: { in: nomes } } });
      expect(eventos).toHaveLength(antes + 1);
      expect(eventos.filter((e) => e.id !== ultimo?.id && e.occurredAt >= (ultimo?.occurredAt ?? new Date(0)) && e.entityId === a && e.eventName === "auth.access.changed")).toHaveLength(1);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: b } })).status).toBe("active");

      // Promover continua livre, e com dois admins o rebaixamento volta a ser possível.
      await expect(repositorio.replaceAccess(a, COM_ADMIN, ator)).resolves.not.toBeNull();
      await expect(repositorio.deactivateUser(b, ator)).resolves.not.toBeNull();
    },
    PRAZO_MS,
  );
});
