import { randomBytes } from "node:crypto";

import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assertSafeTestDatabaseUrl } from "./safe-test-environment";

const HABILITADO = process.env.RUN_RLS_INTEGRATION_TESTS === "true";
const PRAZO = 60_000;

/**
 * A conexão da agenda do Google no banco, no login real da aplicação (sem ser
 * dono e sem SET ROLE; a conexão administrativa só prepara fixtures):
 *
 * - FORCE RLS: cada pessoa lê e escreve só a PRÓPRIA linha, e nenhum papel de
 *   plataforma abre exceção;
 * - os pools de autenticação e de jobs não alcançam a tabela;
 * - a função que entrega as credenciais do app OAuth (só texto cifrado) exige
 *   sessão ativa e é do pool da aplicação.
 *
 * Roda com `RUN_RLS_INTEGRATION_TESTS=true`, só contra o banco de teste isolado.
 */
describe.skipIf(!HABILITADO)("RLS: conexão da agenda do Google", { timeout: PRAZO }, () => {
  const root = new PrismaClient();
  const marca = `gcal_${randomBytes(8).toString("hex")}`;
  const logins = { app: `${marca}_app`, auth: `${marca}_auth`, jobs: `${marca}_jobs` };
  const clientes: Partial<Record<keyof typeof logins, PrismaClient>> = {};
  const pessoas = new Map<string, { id: string; hash: string }>();
  const material = { iv: "iv-sintetico", tag: "tag-sintetica", refreshTokenCifrado: "cifra-sintetica", escopos: "openid calendar.events" };
  let ambienteValidado = false;

  const app = () => clientes.app!;
  /** Roda como a pessoa: o hash da sessão vai para a transação, como faz a API. */
  const como = <T>(pessoa: string | null, operacao: (tx: Prisma.TransactionClient) => Promise<T>) =>
    app().$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('plugga.session_hash', ${pessoa ? pessoas.get(pessoa)!.hash : ""}, true)`;
      return operacao(tx);
    });
  const idDe = (pessoa: string) => pessoas.get(pessoa)!.id;

  beforeAll(async () => {
    assertSafeTestDatabaseUrl(process.env.DATABASE_URL!, process.env.CI === "true", process.env.PLUGGA_TEST_DB_PORT);
    ambienteValidado = true;
    await root.$connect();
    const [executor] = await root.$queryRaw<{ superuser: boolean }[]>`SELECT rolsuper AS superuser FROM pg_roles WHERE rolname = current_user`;
    expect(executor?.superuser, "Fixtures exigem root do banco local isolado").toBe(true);

    for (const [pool, nome] of Object.entries(logins)) {
      if (!/^gcal_[a-f0-9]+_(app|auth|jobs)$/.test(nome)) throw new Error("Login de fixture inválido");
      const senha = randomBytes(32).toString("hex");
      await root.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('plugga.test_role', ${nome}, true)`;
        await tx.$executeRaw`SELECT set_config('plugga.test_password', ${senha}, true)`;
        await tx.$executeRawUnsafe(`DO $fixture$ BEGIN EXECUTE format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L', current_setting('plugga.test_role'), current_setting('plugga.test_password')); END $fixture$`);
      });
      const grupo = { app: "plugga_runtime", auth: "plugga_auth_runtime", jobs: "plugga_jobs_runtime" }[pool]!;
      await root.$executeRawUnsafe(`GRANT ${grupo} TO "${nome}"`);
      const url = new URL(process.env.DATABASE_URL!);
      url.username = nome;
      url.password = senha;
      url.searchParams.set("connection_limit", "2");
      clientes[pool as keyof typeof logins] = new PrismaClient({ datasources: { db: { url: url.toString() } } });
    }

    for (const nome of ["ana", "bruno", "admin", "dev"]) {
      const pessoa = await root.user.create({ data: { name: marca, email: `${marca}-${nome}@teste.local` } });
      const hash = randomBytes(32).toString("hex");
      pessoas.set(nome, { id: pessoa.id, hash });
      await root.session.create({ data: { userId: pessoa.id, tokenHash: hash, expiresAt: new Date(Date.now() + 3_600_000), absoluteExpiresAt: new Date(Date.now() + 7_200_000) } });
      if (nome === "admin" || nome === "dev") {
        // O banco exige que o desenvolvedor tenha também o papel admin.
        for (const key of nome === "dev" ? ["admin", "desenvolvedor"] : ["admin"]) {
          const papel = await root.role.upsert({ where: { key }, create: { key, name: key }, update: {} });
          await root.userPlatformRole.create({ data: { userId: pessoa.id, roleId: papel.id } });
        }
      }
    }
    await root.conexaoGoogleCalendar.createMany({ data: [
      { userId: idDe("ana"), googleEmail: "ana@exemplo.test", ...material },
      { userId: idDe("bruno"), googleEmail: "bruno@exemplo.test", ...material },
    ] });
  }, PRAZO);

  afterAll(async () => {
    for (const cliente of Object.values(clientes)) await cliente.$disconnect();
    if (!ambienteValidado) {
      await root.$disconnect();
      return;
    }
    // O usuário apaga a conexão em cascata. Papéis e catálogos preexistentes ficam; o event_log é append-only.
    await root.user.deleteMany({ where: { id: { in: [...pessoas.values()].map((p) => p.id) } } });
    for (const nome of Object.values(logins)) await root.$executeRawUnsafe(`DROP ROLE IF EXISTS "${nome}"`);
    await root.$disconnect();
  }, PRAZO);

  it("a tabela tem RLS habilitada e forçada", async () => {
    const [flags] = await root.$queryRaw<{ ativo: boolean; forcado: boolean }[]>`
      SELECT c.relrowsecurity AS ativo, c.relforcerowsecurity AS forcado
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'conexoes_google_calendar'`;
    expect(flags).toEqual({ ativo: true, forcado: true });
  });

  it("cada pessoa lê só a própria linha", async () => {
    const todas = (pessoa: string) => como(pessoa, (tx) => tx.conexaoGoogleCalendar.findMany({ select: { userId: true, googleEmail: true } }));

    expect(await todas("ana")).toEqual([{ userId: idDe("ana"), googleEmail: "ana@exemplo.test" }]);
    expect(await todas("bruno")).toEqual([{ userId: idDe("bruno"), googleEmail: "bruno@exemplo.test" }]);
  });

  it("ninguém alcança a linha de outra pessoa pelo identificador, nem admin nem desenvolvedor", async () => {
    for (const quem of ["bruno", "admin", "dev"]) {
      expect(await como(quem, (tx) => tx.conexaoGoogleCalendar.findUnique({ where: { userId: idDe("ana") } })), quem).toBeNull();
    }
    // Admin e desenvolvedor, sem conexão própria, não enxergam nenhuma.
    expect(await como("admin", (tx) => tx.conexaoGoogleCalendar.findMany())).toEqual([]);
    expect(await como("dev", (tx) => tx.conexaoGoogleCalendar.findMany())).toEqual([]);
  });

  it("sem sessão ou com sessão desconhecida, nada aparece", async () => {
    expect(await como(null, (tx) => tx.conexaoGoogleCalendar.findMany())).toEqual([]);
    expect(await app().conexaoGoogleCalendar.findMany()).toEqual([]);
  });

  it("não altera nem apaga a linha de outra pessoa, e a própria só por ela", async () => {
    for (const quem of ["bruno", "admin", "dev"]) {
      expect(await como(quem, (tx) => tx.conexaoGoogleCalendar.updateMany({ where: { userId: idDe("ana") }, data: { googleEmail: "invasor@exemplo.test" } })), quem).toMatchObject({ count: 0 });
      expect(await como(quem, (tx) => tx.conexaoGoogleCalendar.deleteMany({ where: { userId: idDe("ana") } })), quem).toMatchObject({ count: 0 });
    }
    expect(await root.conexaoGoogleCalendar.findUnique({ where: { userId: idDe("ana") } })).toMatchObject({ googleEmail: "ana@exemplo.test" });

    expect(await como("ana", (tx) => tx.conexaoGoogleCalendar.updateMany({ where: { userId: idDe("ana") }, data: { googleEmail: "ana.nova@exemplo.test" } }))).toMatchObject({ count: 1 });
    await como("ana", (tx) => tx.conexaoGoogleCalendar.updateMany({ where: { userId: idDe("ana") }, data: { googleEmail: "ana@exemplo.test" } }));
  });

  it("não cria linha em nome de outra pessoa nem passa a linha própria para outra pessoa", async () => {
    await expect(como("bruno", (tx) => tx.conexaoGoogleCalendar.create({ data: { userId: idDe("admin"), googleEmail: "x@exemplo.test", ...material } }))).rejects.toThrow();
    await expect(como("admin", (tx) => tx.conexaoGoogleCalendar.create({ data: { userId: idDe("ana"), googleEmail: "x@exemplo.test", ...material } }))).rejects.toThrow();
    // Mudar o dono da própria linha também é recusado (WITH CHECK).
    await expect(como("bruno", (tx) => tx.conexaoGoogleCalendar.updateMany({ where: { userId: idDe("bruno") }, data: { userId: idDe("admin") } }))).rejects.toThrow();
  });

  it("a pessoa conecta, troca e desconecta a própria agenda", async () => {
    const admin = idDe("admin");
    await como("admin", (tx) => tx.conexaoGoogleCalendar.upsert({ where: { userId: admin }, create: { userId: admin, googleEmail: "admin@exemplo.test", ...material }, update: {} }));
    expect(await como("admin", (tx) => tx.conexaoGoogleCalendar.findUnique({ where: { userId: admin } }))).toMatchObject({ googleEmail: "admin@exemplo.test" });

    await como("admin", (tx) => tx.conexaoGoogleCalendar.upsert({ where: { userId: admin }, create: { userId: admin, googleEmail: "outro@exemplo.test", ...material }, update: { googleEmail: "outro@exemplo.test" } }));
    expect(await como("admin", (tx) => tx.conexaoGoogleCalendar.findUnique({ where: { userId: admin } }))).toMatchObject({ googleEmail: "outro@exemplo.test" });

    expect(await como("admin", (tx) => tx.conexaoGoogleCalendar.deleteMany({ where: { userId: admin } }))).toMatchObject({ count: 1 });
    expect(await root.conexaoGoogleCalendar.findUnique({ where: { userId: admin } })).toBeNull();
  });

  it("os pools de autenticação e de jobs não alcançam a tabela", async () => {
    await expect(clientes.auth!.conexaoGoogleCalendar.findMany()).rejects.toThrow(/permission denied/i);
    await expect(clientes.jobs!.conexaoGoogleCalendar.findMany()).rejects.toThrow(/permission denied/i);
    await expect(clientes.auth!.conexaoGoogleCalendar.deleteMany()).rejects.toThrow(/permission denied/i);
  });

  it("apagar o usuário leva a conexão junto", async () => {
    const efemero = await root.user.create({ data: { name: marca, email: `${marca}-efemero@teste.local` } });
    await root.conexaoGoogleCalendar.create({ data: { userId: efemero.id, googleEmail: "e@exemplo.test", ...material } });

    await root.user.delete({ where: { id: efemero.id } });

    expect(await root.conexaoGoogleCalendar.findUnique({ where: { userId: efemero.id } })).toBeNull();
  });

  describe("credenciais do app OAuth (função de leitura do cofre)", () => {
    const CHAVE = "google.oauth";
    const lerCifrado = (pessoa: string | null) =>
      como(pessoa, (tx) => tx.$queryRaw<{ valorCifrado: string; iv: string; tag: string }[]>`SELECT * FROM plugga_security.credenciais_google_oauth()`);
    let anterior: Awaited<ReturnType<typeof root.segredoDoSistema.findUnique>> = null;

    beforeAll(async () => {
      anterior = await root.segredoDoSistema.findUnique({ where: { chave: CHAVE } });
      await root.segredoDoSistema.upsert({
        where: { chave: CHAVE },
        create: { chave: CHAVE, valorCifrado: "cifra-do-app", iv: "iv-do-app", tag: "tag-do-app", ultimosQuatro: "fake" },
        update: { valorCifrado: "cifra-do-app", iv: "iv-do-app", tag: "tag-do-app" },
      });
    });

    afterAll(async () => {
      if (!ambienteValidado) return;
      if (anterior) await root.segredoDoSistema.update({ where: { id: anterior.id }, data: anterior });
      else await root.segredoDoSistema.deleteMany({ where: { chave: CHAVE } });
    });

    it("qualquer pessoa com sessão ativa recebe só o texto cifrado, mesmo sem acesso à tabela", async () => {
      for (const quem of ["ana", "admin", "dev"]) {
        expect(await lerCifrado(quem), quem).toEqual([{ valorCifrado: "cifra-do-app", iv: "iv-do-app", tag: "tag-do-app" }]);
      }
      // A mesma pessoa não lê a tabela do cofre.
      expect(await como("ana", (tx) => tx.segredoDoSistema.findMany({ where: { chave: CHAVE } }))).toEqual([]);
    });

    it("sem sessão ativa, nada volta", async () => {
      expect(await lerCifrado(null)).toEqual([]);
    });

    it("os pools de autenticação e de jobs não executam a função", async () => {
      await expect(clientes.auth!.$queryRaw`SELECT * FROM plugga_security.credenciais_google_oauth()`).rejects.toThrow(/permission denied/i);
      await expect(clientes.jobs!.$queryRaw`SELECT * FROM plugga_security.credenciais_google_oauth()`).rejects.toThrow(/permission denied/i);
    });
  });
});
