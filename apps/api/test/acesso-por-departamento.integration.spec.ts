import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { converterAcessoAntigo, type Acesso, type UserAccess } from "@plugga/shared";
import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditAppender } from "../src/audit/audit-appender.js";
import { PrismaAuthRepository } from "../src/auth/prisma-auth.repository.js";
import { NullSessionCache } from "../src/core/auth/null-session-cache.js";
import { PrismaSessionLookupRepository } from "../src/core/auth/prisma-session-lookup.repository.js";
import { PrismaService } from "../src/prisma/prisma.service.js";

/**
 * Acesso de 4 papéis espelhando o acesso antigo, contra o Postgres de verdade:
 *
 *     pnpm --filter @plugga/api test:acesso
 *
 * Confere que a migração de conversão (SQL) e `converterAcessoAntigo` (TS)
 * chegam ao mesmo resultado, e que gravar o acesso antigo pela API regrava o
 * novo. Como `ultimo-admin`, usa um banco próprio e descartável no mesmo
 * servidor, para não depender nem mexer no que o seed deixou no compartilhado.
 */
const HABILITADO = process.env.RUN_ACESSO_INTEGRATION_TESTS === "true";

const PRAZO_MS = 120_000;

const CONVERSAO = readFileSync(
  path.resolve(
    __dirname,
    "../prisma/migrations/20261026010000_acesso_por_departamento_conversao/migration.sql",
  ),
  "utf8",
);

/** Acessos antigos que cobrem cada regra da conversão. */
const CASOS: Record<string, UserAccess> = {
  admin: {
    platformRoles: ["admin"],
    companies: [
      { companyId: "plugga", roles: ["viewer"], departments: [{ departmentId: "financeiro", isManager: false }] },
    ],
  },
  gestor: {
    platformRoles: [],
    companies: [
      {
        companyId: "plugga",
        roles: ["opm"],
        departments: [
          { departmentId: "energia-opm", isManager: true },
          { departmentId: "financeiro", isManager: false },
        ],
      },
    ],
  },
  diretoria: {
    platformRoles: [],
    companies: [
      { companyId: "plugga", roles: ["diretoria"], departments: [{ departmentId: "suprimentos", isManager: false }] },
      { companyId: "waze", roles: ["viewer"], departments: [{ departmentId: "engenharia-obras", isManager: false }] },
    ],
  },
  comercialNasDuas: {
    platformRoles: [],
    companies: [
      { companyId: "plugga", roles: ["comercial"], departments: [{ departmentId: "comercial-clientes", isManager: false }] },
      { companyId: "waze", roles: ["comercial"], departments: [{ departmentId: "comercial-obras", isManager: true }] },
    ],
  },
  tech: {
    platformRoles: [],
    companies: [
      { companyId: "plugga", roles: ["tech"], departments: [{ departmentId: "produto-tecnologia", isManager: false }] },
    ],
  },
  semDepartamento: {
    platformRoles: [],
    companies: [{ companyId: "waze", roles: ["viewer"], departments: [] }],
  },
};

describe.skipIf(!HABILITADO)("acesso por departamento (modelo de 4 papéis)", () => {
  const urlBase = process.env.DATABASE_URL ?? "";
  const nomeDoBanco = `acesso_dep_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const urlDoBanco = urlBase.replace(/\/[^/?]+(\?|$)/, `/${nomeDoBanco}$1`);

  const manutencao = new PrismaService({ datasourceUrl: urlBase });
  let prisma: PrismaService;
  let repositorio: PrismaAuthRepository;
  let ator: string;
  const idPorCaso = new Map<string, string>();

  beforeAll(async () => {
    await manutencao.$connect();
    await manutencao.$executeRawUnsafe(`CREATE DATABASE "${nomeDoBanco}"`);
    execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
      env: { ...process.env, DATABASE_URL: urlDoBanco },
      stdio: "pipe",
      // No Windows o pnpm é um .cmd e só abre por shell.
      shell: process.platform === "win32",
    });
    prisma = new PrismaService({ datasourceUrl: urlDoBanco });
    await prisma.$connect();
    repositorio = new PrismaAuthRepository(prisma, new AuditAppender());
    await prisma.role.createMany({
      data: ["admin", "diretoria", "opm", "viewer", "comercial", "tech"].map((key) => ({ key, name: key })),
      skipDuplicates: true,
    });
    await prisma.company.createMany({
      data: [
        { id: "plugga", name: "Plugga" },
        { id: "waze", name: "Waze Energia" },
      ],
      skipDuplicates: true,
    });
    ator = (await prisma.user.create({ data: { email: "ator@teste.local", name: "ator", status: "active" } })).id;
    for (const caso of Object.keys(CASOS)) {
      const user = await prisma.user.create({
        data: { email: `${caso.toLowerCase()}@teste.local`, name: caso, status: "active" },
      });
      idPorCaso.set(caso, user.id);
    }
  }, PRAZO_MS);

  afterAll(async () => {
    await prisma?.$disconnect();
    await manutencao.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${nomeDoBanco}" WITH (FORCE)`);
    await manutencao.$disconnect();
  }, PRAZO_MS);

  async function gravado(userId: string): Promise<Acesso["departamentos"]> {
    const linhas = await prisma.userDepartamento.findMany({ where: { userId } });
    return linhas
      .map(({ departamento, nivel }) => ({ departamento, nivel }) as Acesso["departamentos"][number])
      .sort((a, b) => a.departamento.localeCompare(b.departamento));
  }

  function esperado(access: UserAccess): Acesso["departamentos"] {
    return [...converterAcessoAntigo(access).departamentos].sort((a, b) =>
      a.departamento.localeCompare(b.departamento),
    );
  }

  it(
    "gravar o acesso antigo pela API regrava o acesso novo com a mesma regra",
    async () => {
      for (const [caso, access] of Object.entries(CASOS)) {
        const userId = idPorCaso.get(caso) ?? "";
        await repositorio.replaceAccess(userId, access, ator);
        expect(await gravado(userId), caso).toEqual(esperado(access));
      }
    },
    PRAZO_MS,
  );

  it(
    "a migração de conversão chega ao mesmo resultado que converterAcessoAntigo, e pode rodar de novo",
    async () => {
      // Parte do acesso antigo já gravado no teste anterior, sem o espelho.
      await prisma.userDepartamento.deleteMany({});
      await prisma.$executeRawUnsafe(CONVERSAO);
      await prisma.$executeRawUnsafe(CONVERSAO);
      for (const [caso, access] of Object.entries(CASOS)) {
        expect(await gravado(idPorCaso.get(caso) ?? ""), caso).toEqual(esperado(access));
      }
    },
    PRAZO_MS,
  );

  it(
    "a sessão resolve o principal com o acesso novo (departamentos e plataforma)",
    async () => {
      const sessoes = new PrismaSessionLookupRepository(prisma, new ConfigService({}), new NullSessionCache());
      const agora = new Date();
      const abrirSessao = async (userId: string) => {
        const tokenHash = `hash-${randomUUID()}`;
        await prisma.session.create({
          data: {
            userId,
            tokenHash,
            expiresAt: new Date(agora.getTime() + 3_600_000),
            absoluteExpiresAt: new Date(agora.getTime() + 7_200_000),
          },
        });
        return sessoes.resolvePrincipal(tokenHash, { now: agora });
      };

      const gestor = await abrirSessao(idPorCaso.get("gestor") ?? "");
      expect(gestor?.acesso).toEqual({
        plataforma: null,
        departamentos: expect.arrayContaining([
          { departamento: "energia-opm", nivel: "gerente" },
          { departamento: "financeiro", nivel: "membro" },
        ]),
      });
      expect(gestor?.acesso?.departamentos).toHaveLength(2);

      const admin = await abrirSessao(idPorCaso.get("admin") ?? "");
      expect(admin?.acesso).toEqual({ plataforma: "admin", departamentos: [] });
    },
    PRAZO_MS,
  );

  it(
    "editar pela tela atual não apaga o papel de desenvolvedor",
    async () => {
      const userId = idPorCaso.get("admin") ?? "";
      const desenvolvedor = await prisma.role.upsert({
        where: { key: "desenvolvedor" },
        update: {},
        create: { key: "desenvolvedor", name: "Desenvolvimento" },
      });
      await prisma.userPlatformRole.create({ data: { userId, roleId: desenvolvedor.id } });

      await repositorio.replaceAccess(userId, CASOS.admin as UserAccess, ator);

      const papeis = await prisma.userPlatformRole.findMany({
        where: { userId },
        select: { role: { select: { key: true } } },
      });
      expect(papeis.map((papel) => papel.role.key).sort()).toEqual(["admin", "desenvolvedor"]);
    },
    PRAZO_MS,
  );
});
