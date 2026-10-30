import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";

import type { Acesso } from "@plugga/shared";
import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditAppender } from "../src/audit/audit-appender.js";
import { PrismaAuthRepository } from "../src/auth/prisma-auth.repository.js";
import { NullSessionCache } from "../src/core/auth/null-session-cache.js";
import { PrismaSessionLookupRepository } from "../src/core/auth/prisma-session-lookup.repository.js";
import { PrismaService } from "../src/prisma/prisma.service.js";

/**
 * Acesso de 4 papéis contra o Postgres de verdade:
 *
 *     pnpm --filter @plugga/api test:acesso
 *
 * Confere a gravação do acesso (convite e substituição) e a sessão resolvida.
 * Como `ultimo-admin`, usa um banco próprio e descartável no mesmo servidor,
 * para não depender nem mexer no que o seed deixou no compartilhado.
 */
const HABILITADO = process.env.RUN_ACESSO_INTEGRATION_TESTS === "true";

const PRAZO_MS = 120_000;

/** Acessos que a sessão resolvida precisa devolver como foram gravados. */
const CASOS: Record<string, Acesso> = {
  admin: { plataforma: "admin", departamentos: [] },
  gestor: {
    plataforma: null,
    departamentos: [
      { departamento: "energia-opm", nivel: "gerente" },
      { departamento: "financeiro", nivel: "membro" },
    ],
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
    execFileSync(process.execPath, [createRequire(import.meta.url).resolve("prisma/build/index.js"), "migrate", "deploy"], {
      env: { ...process.env, DATABASE_URL: urlDoBanco },
      stdio: "pipe",
    });
    prisma = new PrismaService({ datasourceUrl: urlDoBanco });
    await prisma.$connect();
    repositorio = new PrismaAuthRepository(prisma, new AuditAppender());
    await prisma.role.createMany({
      data: ["admin", "desenvolvedor"].map((key) => ({ key, name: key })),
      skipDuplicates: true,
    });
    ator = (await prisma.user.create({ data: { email: "ator@teste.local", name: "ator", status: "active" } })).id;
    for (const caso of Object.keys(CASOS)) {
      const user = await prisma.user.create({
        data: { email: `${caso.toLowerCase()}@teste.local`, name: caso, status: "active" },
      });
      idPorCaso.set(caso, user.id);
      await repositorio.replaceAcesso(user.id, CASOS[caso] as Acesso, ator);
    }
  }, PRAZO_MS);

  afterAll(async () => {
    await prisma?.$disconnect();
    await manutencao.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${nomeDoBanco}" WITH (FORCE)`);
    await manutencao.$disconnect();
  }, PRAZO_MS);

  it("persiste seleção, omissão preserva e vazio revoga telas", async () => {
    const criado = await repositorio.createInvitedMember({ email: "telas@teste.local", name: "Telas", acesso: {
      plataforma: null, departamentos: [{ departamento: "crm", nivel: "membro", telas: ["crm.pipelines"] }],
    } });
    expect((await repositorio.findUserById(criado.id))?.acesso.departamentos[0]?.telas).toEqual(["crm.pipelines"]);
    await repositorio.replaceAcesso(criado.id, { plataforma: null, departamentos: [{ departamento: "crm", nivel: "membro" }] }, ator);
    expect((await repositorio.findUserById(criado.id))?.acesso.departamentos[0]?.telas).toEqual(["crm.pipelines"]);
    await repositorio.replaceAcesso(criado.id, { plataforma: null, departamentos: [{ departamento: "crm", nivel: "membro", telas: [] }] }, ator);
    expect((await repositorio.findUserById(criado.id))?.acesso.departamentos[0]?.telas).toEqual([]);
  });

  it("remoção conserva a identidade, revoga credenciais e readmissão concede apenas acesso novo", async () => {
    const antigo = await repositorio.createInvitedMember({ email: "remocao@teste.local", name: "Removido", acesso: {
      plataforma: null, departamentos: [{ departamento: "crm", nivel: "membro", telas: ["crm.clientes"] }],
    } });
    await prisma.user.update({ where: { id: antigo.id }, data: { status: "active", credential: { create: { passwordHash: "hash-sintetico" } } } });
    await prisma.session.create({ data: { userId: antigo.id, tokenHash: "sessao-sintetica", expiresAt: new Date(Date.now()+60000), absoluteExpiresAt: new Date(Date.now()+120000) } });
    await repositorio.removeUser(antigo.id, ator);
    expect((await repositorio.findUserById(antigo.id))?.status).toBe("removed");
    expect(await prisma.session.count({ where: { userId: antigo.id } })).toBe(0);
    expect((await repositorio.listMembers({})).some((m) => m.id === antigo.id)).toBe(false);
    const novo = await repositorio.createInvitedMember({ email: antigo.email, name: "Readmitido", acesso: { plataforma: null, departamentos: [{ departamento: "financeiro", nivel: "membro", telas: [] }] } });
    expect(novo.id).toBe(antigo.id);
    expect(novo.status).toBe("invited");
    expect(novo.acesso.departamentos).toEqual([{ departamento: "financeiro", nivel: "membro", telas: [] }]);
    expect(await repositorio.findPasswordHash(novo.id)).toBeNull();
  });

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
          { departamento: "energia-opm", nivel: "gerente", telas: [] },
          { departamento: "financeiro", nivel: "membro", telas: [] },
        ]),
      });
      expect(gestor?.acesso?.departamentos).toHaveLength(2);

      const admin = await abrirSessao(idPorCaso.get("admin") ?? "");
      expect(admin?.acesso).toEqual({ plataforma: "admin", departamentos: [] });
    },
    PRAZO_MS,
  );

  it(
    "a equipe grava o convite e a substituição do acesso",
    async () => {
      const convidado = await repositorio.createInvitedMember({
        email: "convite-novo@teste.local",
        name: "Convite novo",
        acesso: { plataforma: null, departamentos: [{ departamento: "crm", nivel: "gerente" }] },
      });
      expect(convidado.acesso).toEqual({ plataforma: null, departamentos: [{ departamento: "crm", nivel: "gerente", telas: [] }] });

      // Substituir é gravar do zero: o que a pessoa tinha antes não sobra.
      const gestor = idPorCaso.get("gestor") ?? "";
      const membro = await repositorio.replaceAcesso(
        gestor,
        { plataforma: null, departamentos: [{ departamento: "marketing", nivel: "membro" }] },
        ator,
      );
      expect(membro?.acesso.departamentos).toEqual([{ departamento: "marketing", nivel: "membro", telas: [] }]);

      // Desenvolvedor leva também a linha admin; voltar a admin tira só o desenvolvedor.
      const dev = await repositorio.replaceAcesso(convidado.id, { plataforma: "desenvolvedor", departamentos: [] }, ator);
      expect(dev?.acesso).toEqual({ plataforma: "desenvolvedor", departamentos: [] });
      const chaves = async () =>
        (await prisma.userPlatformRole.findMany({ where: { userId: convidado.id }, select: { role: { select: { key: true } } } }))
          .map((linha) => linha.role.key)
          .sort();
      expect(await chaves()).toEqual(["admin", "desenvolvedor"]);
      expect(await prisma.userDepartamento.count({ where: { userId: convidado.id } })).toBe(0);
      await repositorio.replaceAcesso(convidado.id, { plataforma: "admin", departamentos: [] }, ator);
      expect(await chaves()).toEqual(["admin"]);
    },
    PRAZO_MS,
  );
});
