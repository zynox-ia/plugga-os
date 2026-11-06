import { randomBytes, randomUUID } from "node:crypto";

import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assertSafeTestDatabaseUrl } from "./safe-test-environment";

const HABILITADO = process.env.RUN_RLS_INTEGRATION_TESTS === "true";
const PRAZO = 60_000;

// A conexão administrativa prepara fixtures; as asserções usam OUTRO login,
// sem ser dono e sem SET ROLE. Nunca executar em banco compartilhado/produção.
describe.skipIf(!HABILITADO)("RLS: permissões no login real da aplicação", () => {
  const root = new PrismaClient();
  const marca = `rls_${randomBytes(8).toString("hex")}`;
  const logins = { app: `${marca}_app`, auth: `${marca}_auth`, jobs: `${marca}_jobs` };
  const clientes: Partial<Record<keyof typeof logins, PrismaClient>> = {};
  const pessoas = new Map<string, { id: string; hash: string }>();
  const registros = new Map<string, string>();
  const contatos = new Map<string, string>();
  const unidades = new Map<string, string>();
  const idsUsuarios: string[] = [];
  const clientesExtras: string[] = [];
  let ambienteValidado = false;
  let pipelineId: string;
  let empresaId: string;

  const app = () => clientes.app!;
  const contexto = <T>(pessoa: string, operacao: (tx: Prisma.TransactionClient) => Promise<T>) =>
    app().$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('plugga.session_hash', ${pessoas.get(pessoa)!.hash}, true)`;
      return operacao(tx);
    });
  const meusClientes = (tx: Prisma.TransactionClient) => tx.client.findMany({
    where: { id: { in: [...registros.values()] } }, orderBy: { name: "asc" }, select: { id: true },
  });
  const idsVisiveis = async (pessoa: string) => (await contexto(pessoa, meusClientes)).map((c) => c.id);

  beforeAll(async () => {
    assertSafeTestDatabaseUrl(process.env.DATABASE_URL!, process.env.CI === "true", process.env.PLUGGA_TEST_DB_PORT);
    ambienteValidado = true;
    await root.$connect();
    const [executor] = await root.$queryRaw<{ superuser: boolean }[]>`SELECT rolsuper AS superuser FROM pg_roles WHERE rolname = current_user`;
    expect(executor?.superuser, "Fixtures exigem root do banco local isolado").toBe(true);
    for (const [pool, nome] of Object.entries(logins)) {
      // O identificador tem apenas prefixo fixo + hex gerado; senha só em memória.
      if (!/^rls_[a-f0-9]+_(app|auth|jobs)$/.test(nome)) throw new Error("Login de fixture inválido");
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
    empresaId = marca;
    await root.company.create({ data: { id: empresaId, name: marca } });
    for (const nome of ["a", "b", "gerente", "misto", "admin", "dev", "sem-tela", "financeiro"]) {
      const pessoa = await root.user.create({ data: { name: marca, email: `${marca}-${nome}@teste.local` } });
      idsUsuarios.push(pessoa.id);
      const hash = randomBytes(32).toString("hex");
      pessoas.set(nome, { id: pessoa.id, hash });
      await root.session.create({ data: { userId: pessoa.id, tokenHash: hash, expiresAt: new Date(Date.now() + 3_600_000), absoluteExpiresAt: new Date(Date.now() + 7_200_000) } });
      if (["admin", "dev"].includes(nome)) {
        const key = nome === "dev" ? "desenvolvedor" : "admin";
        const papel = await root.role.upsert({ where: { key }, create: { key, name: key }, update: {} });
        await root.userPlatformRole.createMany({ data: [
          { userId: pessoa.id, roleId: papel.id },
          ...(nome === "dev" ? [{ userId: pessoa.id, roleId: (await root.role.findUniqueOrThrow({ where: { key: "admin" } })).id }] : []),
        ] });
      } else {
        await root.userDepartamento.create({ data: {
          userId: pessoa.id, departamento: nome === "financeiro" ? "financeiro" : "crm",
          nivel: ["gerente", "misto", "financeiro"].includes(nome) ? "gerente" : "membro",
          telas: ["misto", "sem-tela"].includes(nome) ? [] : nome === "financeiro" ? ["financeiro.receber"] : ["crm.clientes", "crm.pipelines", "crm.contratos"],
        } });
      }
    }
    await root.userDepartamento.create({ data: { userId: pessoas.get("misto")!.id, departamento: "energia-opm", nivel: "membro", telas: ["energia-opm.ciclos"] } });
    for (const nome of ["a", "b", "misto"]) {
      const cliente = await root.client.create({ data: { name: `${marca}-${nome}`, ownerId: pessoas.get(nome)!.id } });
      registros.set(nome, cliente.id);
      const contato = await root.clientContact.create({ data: { name: marca, clientId: cliente.id } });
      contatos.set(nome, contato.id);
      const unidade = await root.consumerUnit.create({ data: { clientId: cliente.id, code: `${marca}-${nome}`, distributor: marca } });
      unidades.set(nome, unidade.id);
    }
    const pipeline = await root.pipeline.create({ data: { companyId: empresaId, name: marca, valueLabel: "Valor", color: "blue", wonLabel: "Ganho", lostLabel: "Perdido", stages: { create: { name: marca, color: "blue", position: 0 } } }, include: { stages: true } });
    pipelineId = pipeline.id;
    for (const nome of ["a", "b"]) {
      await root.pipelineMember.create({ data: { pipelineId, userId: pessoas.get(nome)!.id, role: "vendedor" } });
      await root.deal.create({ data: { title: marca, ownerId: pessoas.get(nome)!.id, pipelineId, stageId: pipeline.stages[0]!.id, clientId: registros.get(nome)!, profile: { create: { name: marca, personType: "pj" } } } });
    }
  }, PRAZO);

  afterAll(async () => {
    for (const cliente of Object.values(clientes)) await cliente.$disconnect();
    if (!ambienteValidado) {
      await root.$disconnect();
      return;
    }
    if (pipelineId) {
      await root.deal.deleteMany({ where: { pipelineId } });
      await root.pipeline.delete({ where: { id: pipelineId } });
    }
    await root.client.deleteMany({ where: { id: { in: [...registros.values(), ...clientesExtras] } } });
    await root.user.deleteMany({ where: { id: { in: idsUsuarios } } });
    if (empresaId) await root.company.delete({ where: { id: empresaId } });
    // Não apagar papéis/catálogos preexistentes nem o event_log append-only.
    for (const nome of Object.values(logins)) await root.$executeRawUnsafe(`DROP ROLE IF EXISTS "${nome}"`);
    await root.$disconnect();
  }, PRAZO);

  it("habilita e força RLS em todos os modelos e mantém os grupos sem bypass", async () => {
    const tabelas = Prisma.dmmf.datamodel.models.map((m) => m.dbName ?? m.name);
    expect(tabelas).toHaveLength(73);
    const flags = await root.$queryRaw<{ nome: string; ativo: boolean; forcado: boolean }[]>`
      SELECT c.relname AS nome, c.relrowsecurity AS ativo, c.relforcerowsecurity AS forcado
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = ANY(${tabelas}::text[])`;
    expect(flags).toHaveLength(tabelas.length);
    expect(flags.every((f) => f.ativo && f.forcado)).toBe(true);
    const grupos = await root.$queryRaw<{ seguro: boolean }[]>`SELECT NOT rolsuper AND NOT rolbypassrls AND NOT rolcanlogin AS seguro FROM pg_roles WHERE rolname IN ('plugga_runtime', 'plugga_auth_runtime', 'plugga_jobs_runtime')`;
    expect(grupos).toHaveLength(3);
    expect(grupos.every((g) => g.seguro)).toBe(true);
    const [login] = await app().$queryRaw<{ seguro: boolean; semDono: boolean; semDdl: boolean }[]>`
      SELECT NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolcreaterole AND NOT r.rolcreatedb AS seguro,
        NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' AND pg_has_role(current_user, c.relowner, 'MEMBER')) AS "semDono",
        NOT has_schema_privilege(current_user, 'public', 'CREATE') AND NOT has_database_privilege(current_user, current_database(), 'CREATE') AND NOT has_table_privilege(current_user, 'clients', 'TRUNCATE') AS "semDdl"
      FROM pg_roles r WHERE r.rolname = current_user`;
    expect(login).toEqual({ seguro: true, semDono: true, semDdl: true });
  });

  it("sem contexto e GUCs forjadas não concedem leitura nem escrita", async () => {
    expect(await app().client.findMany()).toEqual([]);
    await expect(app().client.create({ data: { name: marca } })).rejects.toThrow();
    const linhas = await app().$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.user_id', ${pessoas.get("admin")!.id}, true), set_config('plugga.user_id', ${pessoas.get("admin")!.id}, true), set_config('plugga.session_hash', ${randomUUID()}, true), set_config('app.system', 'true', true), set_config('plugga.system', 'true', true)`;
      return tx.client.findMany();
    });
    expect(linhas).toEqual([]);
  });

  it("membro A não lê nem altera B, inclusive raw SQL, joins e filhos", async () => {
    expect(await idsVisiveis("a")).toEqual([registros.get("a")]);
    await contexto("a", async (tx) => {
      expect(await tx.client.updateMany({ where: { id: registros.get("b")! }, data: { notes: marca } })).toMatchObject({ count: 0 });
      const contatos = await tx.$queryRaw<{ id: string }[]>`SELECT c.id FROM public.clients c JOIN public.client_contacts cc ON cc.client_id = c.id WHERE c.id = ${registros.get("b")!}::uuid`;
      expect(contatos).toEqual([]);
      const negocios = await tx.deal.findMany({ where: { pipelineId }, include: { profile: true } });
      expect(negocios).toHaveLength(1);
      expect(negocios[0]!.ownerId).toBe(pessoas.get("a")!.id);
    });
    await expect(contexto("a", (tx) => tx.client.create({ data: { name: marca, ownerId: pessoas.get("b")!.id } }))).rejects.toThrow();
    await expect(contexto("a", (tx) => tx.client.update({ where: { id: registros.get("a")! }, data: { ownerId: pessoas.get("b")!.id } }))).rejects.toThrow();
    await expect(contexto("a", (tx) => tx.clientContact.create({ data: { name: marca, clientId: registros.get("b")! } }))).rejects.toThrow();
  });

  it("permite CRUD próprio e escrita de gestão", async () => {
    await contexto("a", async (tx) => {
      const novo = await tx.client.create({ data: { name: marca, ownerId: pessoas.get("a")!.id } });
      clientesExtras.push(novo.id);
      await tx.client.update({ where: { id: novo.id }, data: { notes: "sintético" } });
      await tx.client.delete({ where: { id: novo.id } });
    });
    expect(await contexto("gerente", (tx) => tx.client.updateMany({ where: { id: registros.get("b")! }, data: { notes: "gestão sintética" } }))).toMatchObject({ count: 1 });
  });

  it("pipeline permite conversão com contatos e SELECT de UCs sem abrir escrita de cliente", async () => {
    const id = pessoas.get("a")!.id;
    await root.userDepartamento.update({ where: { userId_departamento: { userId: id, departamento: "crm" } }, data: { telas: ["crm.pipelines"] } });
    try {
      await contexto("a", async (tx) => {
        const cliente = await tx.client.create({ data: { name: marca, ownerId: id, contacts: { create: { name: marca } } }, include: { contacts: true } });
        clientesExtras.push(cliente.id);
        expect(cliente.contacts).toHaveLength(1);
        const ucs = await tx.consumerUnit.findMany({ where: { id: { in: [...unidades.values()] } } });
        expect(ucs.map((u) => u.id)).toEqual([unidades.get("a")]);
        const membros = await tx.pipelineMember.findMany({ where: { pipelineId }, include: { user: true } });
        expect(membros).toHaveLength(1);
        expect(membros[0]!.userId).toBe(id);
      });
      await expect(contexto("a", (tx) => tx.client.update({ where: { id: registros.get("a")! }, data: { notes: marca } }))).rejects.toThrow();
      await expect(contexto("a", (tx) => tx.clientContact.update({ where: { id: contatos.get("a")! }, data: { name: marca } }))).rejects.toThrow();
      await expect(contexto("a", (tx) => tx.consumerUnit.update({ where: { id: unidades.get("a")! }, data: { code: marca } }))).rejects.toThrow();
    } finally {
      await root.userDepartamento.update({ where: { userId_departamento: { userId: id, departamento: "crm" } }, data: { telas: ["crm.clientes", "crm.pipelines", "crm.contratos"] } });
    }
  });

  it("executa a fatura sem abrir catálogo técnico, outras chaves ou configuração", async () => {
    const integracaoAnterior = await root.integration.findUnique({ where: { key: "openrouter" } });
    const chaveAnterior = await root.segredoDoSistema.findUnique({ where: { chave: "openrouter.api_key" } });
    try {
      await root.integration.upsert({ where: { key: "openrouter" }, create: { key: "openrouter", name: marca, owner: marca, mode: "read_only" }, update: { mode: "read_only" } });
      await root.segredoDoSistema.upsert({ where: { chave: "openrouter.api_key" }, create: { chave: "openrouter.api_key", valorCifrado: "cifra-sintetica", iv: "iv-sintetico", tag: "tag-sintetica", ultimosQuatro: "fake" }, update: { valorCifrado: "cifra-sintetica", iv: "iv-sintetico", tag: "tag-sintetica" } });
      await contexto("a", async (tx) => {
        expect(await tx.integration.findMany()).toEqual([]);
        expect(await tx.segredoDoSistema.findMany()).toEqual([]);
        expect(await tx.$queryRaw`SELECT plugga_security.modo_integracao('openrouter') AS mode`).toEqual([{ mode: "read_only" }]);
        expect(await tx.$queryRaw`SELECT plugga_security.modo_integracao('outra-integracao') AS mode`).toEqual([{ mode: null }]);
        expect(await tx.$queryRaw`SELECT * FROM plugga_security.chave_fatura()`).toEqual([{ valorCifrado: "cifra-sintetica", iv: "iv-sintetico", tag: "tag-sintetica" }]);
        expect(await tx.integration.updateMany({ where: { key: "openrouter" }, data: { mode: "write" } })).toMatchObject({ count: 0 });
      });
      expect(await contexto("sem-tela", (tx) => tx.$queryRaw`SELECT * FROM plugga_security.chave_fatura()`)).toEqual([]);
      expect(await contexto("financeiro", (tx) => tx.$queryRaw`SELECT plugga_security.modo_integracao('openrouter') AS mode`)).toEqual([{ mode: null }]);
    } finally {
      if (integracaoAnterior) await root.integration.update({ where: { id: integracaoAnterior.id }, data: { mode: integracaoAnterior.mode } });
      else await root.integration.deleteMany({ where: { key: "openrouter" } });
      if (chaveAnterior) await root.segredoDoSistema.update({ where: { id: chaveAnterior.id }, data: chaveAnterior });
      else await root.segredoDoSistema.deleteMany({ where: { chave: "openrouter.api_key" } });
    }
  });

  it("WITH CHECK impede vincular negócio próprio a cliente, contato ou UC alheios", async () => {
    const negocio = await root.deal.findFirstOrThrow({ where: { pipelineId, ownerId: pessoas.get("a")!.id } });
    await expect(contexto("a", (tx) => tx.deal.update({ where: { id: negocio.id }, data: { clientId: registros.get("b")! } }))).rejects.toThrow();
    await expect(contexto("a", (tx) => tx.deal.update({ where: { id: negocio.id }, data: { contactId: contatos.get("b")! } }))).rejects.toThrow();
    await expect(contexto("a", (tx) => tx.dealConsumerUnit.create({ data: { dealId: negocio.id, consumerUnitId: unidades.get("b")! } }))).rejects.toThrow();
    await contexto("a", async (tx) => {
      await tx.deal.update({ where: { id: negocio.id }, data: { contactId: contatos.get("a")! } });
      await tx.dealConsumerUnit.create({ data: { dealId: negocio.id, consumerUnitId: unidades.get("a")! } });
    });
    const pipeline = await contexto("gerente", (tx) => tx.pipeline.findUnique({ where: { id: pipelineId }, include: { members: { include: { user: true } } } }));
    expect(pipeline?.members).toHaveLength(2);
  });

  it("gerente da tela enxerga todos; não combina nível e tela de departamentos distintos", async () => {
    expect(await idsVisiveis("gerente")).toHaveLength(3);
    expect(await idsVisiveis("misto")).toEqual([registros.get("misto")]);
    expect(await idsVisiveis("sem-tela")).toEqual([]);
    expect(await idsVisiveis("admin")).toHaveLength(3);
    expect(await idsVisiveis("dev")).toHaveLength(3);
    expect(await idsVisiveis("financeiro")).toEqual([]);
  });

  it("revoga tela, sessão expirada e usuário inativo na próxima consulta", async () => {
    const id = pessoas.get("a")!.id;
    await root.userDepartamento.update({ where: { userId_departamento: { userId: id, departamento: "crm" } }, data: { telas: [] } });
    expect(await idsVisiveis("a")).toEqual([]);
    await root.userDepartamento.update({ where: { userId_departamento: { userId: id, departamento: "crm" } }, data: { telas: ["crm.clientes", "crm.pipelines"] } });
    await root.user.update({ where: { id }, data: { status: "inactive" } });
    expect(await idsVisiveis("a")).toEqual([]);
    await root.user.update({ where: { id }, data: { status: "active" } });
    await root.session.update({ where: { tokenHash: pessoas.get("a")!.hash }, data: { absoluteExpiresAt: new Date(0) } });
    expect(await idsVisiveis("a")).toEqual([]);
    await root.session.update({ where: { tokenHash: pessoas.get("a")!.hash }, data: { absoluteExpiresAt: new Date(Date.now() + 7_200_000) } });
  });

  it("contextos concorrentes não vazam e SET LOCAL termina junto da transação", async () => {
    const resultado = await Promise.all(Array.from({ length: 12 }, (_, i) => idsVisiveis(i % 2 ? "a" : "b")));
    resultado.forEach((ids, i) => expect(ids).toEqual([registros.get(i % 2 ? "a" : "b")]));
    expect(await app().client.count()).toBe(0);
    await expect(contexto("a", async () => { throw new Error("rollback sintético"); })).rejects.toThrow("rollback sintético");
    expect(await app().client.count()).toBe(0);
  });

  it("auth, jobs e runtime têm superfícies distintas e não escalam ACL", async () => {
    await expect(app().session.findMany()).rejects.toThrow();
    await expect(app().userCredential.findMany()).rejects.toThrow();
    await expect(app().authToken.findMany()).rejects.toThrow();
    await expect(app().userIdentity.findMany()).rejects.toThrow();
    await expect(contexto("admin", (tx) => tx.user.update({ where: { id: pessoas.get("b")!.id }, data: { status: "inactive" } }))).rejects.toThrow();
    await expect(contexto("admin", (tx) => tx.userDepartamento.deleteMany({ where: { userId: pessoas.get("b")!.id } }))).rejects.toThrow();
    await expect(clientes.auth!.client.findMany()).rejects.toThrow();
    await expect(clientes.jobs!.user.findMany()).rejects.toThrow();
    await expect(clientes.jobs!.client.findMany()).rejects.toThrow();
    expect(await clientes.auth!.session.count({ where: { userId: { in: idsUsuarios } } })).toBe(8);
    expect(await clientes.jobs!.jobRun.findMany({ where: { jobKey: marca } })).toEqual([]);
    expect(await contexto("a", (tx) => tx.user.findMany({ where: { id: { in: idsUsuarios } } }))).toHaveLength(1);
    expect(await contexto("gerente", (tx) => tx.user.findMany({ where: { id: pessoas.get("b")!.id } }))).toHaveLength(1);
  });

  it("separa leitura técnica, catálogos ativos e domínios ainda fechados", async () => {
    expect(await contexto("a", (tx) => tx.eventLog.findMany())).toEqual([]);
    expect(await contexto("admin", (tx) => tx.eventLog.findMany())).toEqual([]);
    expect(await contexto("a", (tx) => tx.company.findMany({ where: { id: empresaId } }))).toHaveLength(1);
    expect(await app().company.count()).toBe(0);
    expect(await contexto("gerente", (tx) => tx.obra.findMany())).toEqual([]);
    expect(await contexto("gerente", (tx) => tx.segredoDoSistema.findMany())).toEqual([]);
    expect(await contexto("admin", (tx) => tx.jobRun.findMany())).toEqual([]);
    await expect(contexto("admin", (tx) => tx.jobRun.create({ data: { jobKey: marca, status: "queued", triggeredBy: marca } }))).rejects.toThrow();
    const criado = await clientes.jobs!.jobRun.create({ data: { jobKey: marca, status: "queued", triggeredBy: marca } });
    try {
      expect(await contexto("dev", (tx) => tx.jobRun.findUnique({ where: { id: criado.id } }))).toMatchObject({ id: criado.id });
      expect(await contexto("admin", (tx) => tx.jobRun.findUnique({ where: { id: criado.id } }))).toBeNull();
    } finally {
      await root.jobRun.delete({ where: { id: criado.id } });
    }
  });
});
