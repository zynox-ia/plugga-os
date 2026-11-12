import { randomBytes, randomUUID } from "node:crypto";

import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assertSafeTestDatabaseUrl } from "./safe-test-environment";

const HABILITADO = process.env.RUN_RLS_INTEGRATION_TESTS === "true";
const PRAZO = 60_000;

// A conexão administrativa prepara fixtures; as asserções usam OUTRO login,
// sem ser dono e sem SET ROLE. Nunca executar em banco compartilhado/produção.
describe.skipIf(!HABILITADO)("RLS: permissões no login real da aplicação", { timeout: PRAZO }, () => {
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
  let etapaId: string;
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
    for (const nome of ["a", "b", "gerente", "misto", "admin", "dev", "sem-tela", "financeiro", "pipeline", "contratos"]) {
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
          telas: ["misto", "sem-tela"].includes(nome) ? [] : nome === "financeiro" ? ["financeiro.receber"]
            : nome === "pipeline" ? ["crm.pipelines"] : nome === "contratos" ? ["crm.contratos"] : ["crm.clientes", "crm.pipelines", "crm.contratos"],
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
    etapaId = pipeline.stages[0]!.id;
    for (const nome of ["a", "b"]) {
      await root.pipelineMember.create({ data: { pipelineId, userId: pessoas.get(nome)!.id, role: "vendedor" } });
      const negocio = await root.deal.create({ data: {
        title: marca, ownerId: pessoas.get(nome)!.id, createdById: pessoas.get(nome === "a" ? "b" : "a")!.id,
        pipelineId, stageId: etapaId, clientId: registros.get(nome)!, profile: { create: { name: marca, personType: "pj" } },
        history: { create: { kind: "created", actorId: pessoas.get(nome === "a" ? "b" : "a")!.id } },
      } });
      if (nome === "b") await root.dealConsumerUnit.create({ data: { dealId: negocio.id, consumerUnitId: unidades.get(nome)! } });
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
    expect(tabelas).toHaveLength(76);
    expect(tabelas).toContain("conexoes_google_calendar");
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
    expect(await root.$queryRaw`SELECT
      has_function_privilege(${logins.app}, 'plugga_security.converter_lead_snapshot(uuid)', 'EXECUTE') AS app,
      has_function_privilege(${logins.auth}, 'plugga_security.converter_lead_snapshot(uuid)', 'EXECUTE') AS auth,
      has_function_privilege(${logins.jobs}, 'plugga_security.converter_lead_snapshot(uuid)', 'EXECUTE') AS jobs
    `).toEqual([{ app: true, auth: false, jobs: false }]);
    expect(await root.$queryRaw`SELECT to_regprocedure('plugga_security.converter_lead_snapshot(uuid,boolean)') IS NULL AS ausente`).toEqual([{ ausente: true }]);
    expect(await root.$queryRaw`SELECT prosecdef AS definer FROM pg_proc
      WHERE oid = 'plugga_security.validar_escrita_crm()'::regprocedure`).toEqual([{ definer: false }]);
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

  it("a tela permite ler e trabalhar registros de outros responsáveis sem apagar autoria", async () => {
    expect(await idsVisiveis("a")).toEqual([...registros.values()]);
    await contexto("a", async (tx) => {
      expect(await tx.client.updateMany({ where: { id: registros.get("b")! }, data: { notes: marca } })).toMatchObject({ count: 1 });
      const contatos = await tx.$queryRaw<{ id: string }[]>`SELECT c.id FROM public.clients c JOIN public.client_contacts cc ON cc.client_id = c.id WHERE c.id = ${registros.get("b")!}::uuid`;
      expect(contatos).toEqual([{ id: registros.get("b") }]);
      const negocios = await tx.deal.findMany({ where: { pipelineId }, include: { profile: true, history: { include: { actor: { select: { id: true, name: true } } } } } });
      expect(negocios).toHaveLength(2);
      const alheio = negocios.find((negocio) => negocio.ownerId === pessoas.get("b")!.id)!;
      expect(alheio.createdById).toBe(pessoas.get("a")!.id);
      expect(alheio.history[0]!.actor).toMatchObject({ id: pessoas.get("a")!.id });
      await tx.deal.update({ where: { id: alheio.id }, data: { title: `${marca} editado` } });
    });
    await expect(contexto("a", (tx) => tx.client.create({ data: { name: marca, ownerId: pessoas.get("b")!.id } }))).rejects.toThrow();
    await expect(contexto("a", (tx) => tx.client.update({ where: { id: registros.get("a")! }, data: { ownerId: pessoas.get("b")!.id } }))).rejects.toThrow();
    await contexto("a", (tx) => tx.clientContact.update({ where: { id: contatos.get("b")! }, data: { name: marca } }));
    expect(await contexto("sem-tela", (tx) => tx.deal.findMany({ where: { pipelineId } }))).toEqual([]);
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

  it("Pipelines converte o snapshot sem ler Clientes, contatos ou UCs e preserva vínculos já convertidos", async () => {
    const negocio = await root.deal.create({ data: {
      title: marca, ownerId: pessoas.get("b")!.id, pipelineId, stageId: etapaId,
      profile: { create: { name: `Snapshot ${randomUUID()}`, personType: "pj", email: `${randomUUID()}@sintetico.invalid` } },
      leadContacts: { create: { name: "Contato do snapshot", email: `${randomUUID()}@sintetico.invalid` } },
    }, include: { profile: true, leadContacts: true } });
    try {
      await contexto("pipeline", async (tx) => {
        await tx.$executeRaw`SELECT plugga_security.converter_lead_snapshot(${negocio.id}::uuid)`;
        expect(await tx.client.findMany()).toEqual([]);
        expect(await tx.clientContact.findMany()).toEqual([]);
        expect(await tx.consumerUnit.findMany()).toEqual([]);
        expect(await tx.dealConsumerUnit.findMany({ where: { deal: { pipelineId } } })).toEqual([]);
        const membros = await tx.pipelineMember.findMany({ where: { pipelineId }, include: { user: { select: { id: true, name: true, status: true } } } });
        expect(membros).toHaveLength(2);
      });
      const convertido = await root.deal.findUniqueOrThrow({ where: { id: negocio.id } });
      const clienteId = convertido.clientId!;
      clientesExtras.push(clienteId);
      const cliente = await root.client.findUniqueOrThrow({ where: { id: clienteId }, include: { contacts: true } });
      expect(cliente).toMatchObject({ name: negocio.profile!.name, email: negocio.profile!.email, ownerId: pessoas.get("b")!.id });
      expect(cliente.contacts[0]).toMatchObject({ name: negocio.leadContacts[0]!.name, email: negocio.leadContacts[0]!.email });
      await root.client.update({ where: { id: clienteId }, data: { name: "Cadastro alterado depois", email: "novo@sintetico.invalid" } });
      await contexto("pipeline", async (tx) => {
        const visivel = await tx.deal.findUniqueOrThrow({ where: { id: negocio.id }, include: { profile: true, leadContacts: true, client: true } });
        expect(visivel.client).toBeNull();
        expect(visivel.profile).toEqual(negocio.profile);
        expect(visivel.leadContacts).toEqual(negocio.leadContacts);
        await tx.deal.update({ where: { id: negocio.id }, data: { title: "Lead editado depois da conversão" } });
        await tx.$executeRaw`SELECT plugga_security.converter_lead_snapshot(${negocio.id}::uuid)`;
      });
      expect((await root.deal.findUniqueOrThrow({ where: { id: negocio.id } })).clientId).toBe(clienteId);
      expect(await root.dealHistory.count({ where: { dealId: negocio.id, kind: "client_converted" } })).toBe(1);
      expect(await root.eventLog.count({ where: { entityId: negocio.id, eventName: "commercial.deal.client_converted" } })).toBe(1);
      await expect(contexto("pipeline", (tx) => tx.client.create({ data: { name: marca, ownerId: pessoas.get("pipeline")!.id } }))).rejects.toThrow();
      await expect(contexto("pipeline", (tx) => tx.clientContact.create({ data: { clientId: clienteId, name: marca } }))).rejects.toThrow();
      await expect(contexto("pipeline", (tx) => tx.client.update({ where: { id: clienteId }, data: { notes: marca } }))).rejects.toThrow();
      await expect(contexto("pipeline", (tx) => tx.deal.update({ where: { id: negocio.id }, data: { clientId: registros.get("b")! } }))).rejects.toThrow();
      await expect(contexto("pipeline", (tx) => tx.deal.update({ where: { id: negocio.id }, data: { clientId: null } }))).rejects.toThrow();
      await expect(contexto("pipeline", (tx) => tx.deal.update({ where: { id: negocio.id }, data: { contactId: contatos.get("b")! } }))).rejects.toThrow();
      await expect(contexto("pipeline", (tx) => tx.deal.create({ data: { title: marca, ownerId: pessoas.get("pipeline")!.id, pipelineId, stageId: etapaId, clientId: clienteId } }))).rejects.toThrow();
    } finally {
      await root.deal.delete({ where: { id: negocio.id } });
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

  it("segredos técnicos (email.*) são só do desenvolvedor; as demais chaves seguem com o admin", async () => {
    const tecnica = `email.${marca}`;
    const comum = `comum.${marca}`;
    const outrasTecnicas = [`google.${marca}`, `integracao.${marca}`];
    const material = { valorCifrado: "cifra-sintetica", iv: "iv-sintetico", tag: "tag-sintetica", ultimosQuatro: "fake" };
    try {
      await root.segredoDoSistema.createMany({ data: [{ chave: tecnica, ...material }, { chave: comum, ...material }, ...outrasTecnicas.map((chave) => ({ chave, ...material }))] });
      for (const chave of outrasTecnicas) {
        expect(await contexto("admin", (tx) => tx.segredoDoSistema.findMany({ where: { chave } }))).toEqual([]);
        await expect(contexto("admin", (tx) => tx.segredoDoSistema.create({ data: { chave: `${chave}.novo`, ...material } }))).rejects.toThrow();
        expect(await contexto("dev", (tx) => tx.segredoDoSistema.findMany({ where: { chave }, select: { chave: true } }))).toEqual([{ chave }]);
      }

      // Admin não enxerga nem toca o segredo técnico; a chave comum continua dele.
      const doAdmin = await contexto("admin", (tx) => tx.segredoDoSistema.findMany({ where: { chave: { in: [tecnica, comum] } }, select: { chave: true } }));
      expect(doAdmin.map((linha) => linha.chave)).toEqual([comum]);
      await expect(contexto("admin", (tx) => tx.segredoDoSistema.create({ data: { chave: `email.${marca}.novo`, ...material } }))).rejects.toThrow();
      expect(await contexto("admin", (tx) => tx.segredoDoSistema.updateMany({ where: { chave: tecnica }, data: { ultimosQuatro: "troc" } }))).toMatchObject({ count: 0 });
      expect(await contexto("admin", (tx) => tx.segredoDoSistema.deleteMany({ where: { chave: tecnica } }))).toMatchObject({ count: 0 });
      expect(await contexto("admin", (tx) => tx.segredoDoSistema.updateMany({ where: { chave: comum }, data: { ultimosQuatro: "ok01" } }))).toMatchObject({ count: 1 });

      // Desenvolvedor lê e grava os dois.
      const doDev = await contexto("dev", (tx) => tx.segredoDoSistema.findMany({ where: { chave: { in: [tecnica, comum] } }, select: { chave: true } }));
      expect(doDev.map((linha) => linha.chave).sort()).toEqual([comum, tecnica].sort());
      expect(await contexto("dev", (tx) => tx.segredoDoSistema.updateMany({ where: { chave: tecnica }, data: { ultimosQuatro: "dev1" } }))).toMatchObject({ count: 1 });

      // Quem não é da plataforma não vê nenhum dos dois.
      expect(await contexto("gerente", (tx) => tx.segredoDoSistema.findMany({ where: { chave: { in: [tecnica, comum] } } }))).toEqual([]);
    } finally {
      await root.segredoDoSistema.deleteMany({ where: { chave: { in: [tecnica, comum, `email.${marca}.novo`, ...outrasTecnicas, ...outrasTecnicas.map((c) => `${c}.novo`)] } } });
    }
  });

  it("integracao_ativa só diz 'ligada ou não' a quem tem sessão e nunca abre o cofre", async () => {
    const chave = `integracao.${marca}`;
    const consulta = (pessoa: string) => contexto(pessoa, (tx) => tx.$queryRaw<{ ativa: boolean }[]>`SELECT plugga_security.integracao_ativa(${marca}) AS ativa`);
    try {
      expect(await consulta("a")).toEqual([{ ativa: false }]);
      await root.segredoDoSistema.create({ data: { chave, valorCifrado: "cifra-sintetica", iv: "iv-sintetico", tag: "tag-sintetica", ultimosQuatro: "" } });

      // Qualquer pessoa com sessão vê "ligada", mesmo sem alcançar a tabela.
      for (const pessoa of ["a", "gerente", "admin", "dev", "sem-tela"]) expect(await consulta(pessoa)).toEqual([{ ativa: true }]);
      expect(await contexto("a", (tx) => tx.segredoDoSistema.findMany({ where: { chave } }))).toEqual([]);
      expect(await contexto("a", (tx) => tx.$queryRaw<{ ativa: boolean }[]>`SELECT plugga_security.integracao_ativa('outra-coisa') AS ativa`)).toEqual([{ ativa: false }]);

      // Sem sessão válida, nunca.
      const semSessao = await app().$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('plugga.session_hash', ${randomUUID()}, true)`;
        return tx.$queryRaw<{ ativa: boolean }[]>`SELECT plugga_security.integracao_ativa(${marca}) AS ativa`;
      });
      expect(semSessao).toEqual([{ ativa: false }]);
    } finally {
      await root.segredoDoSistema.deleteMany({ where: { chave } });
    }
  });

  it("config_telegram entrega só o texto cifrado à aplicação e às rotinas; o pool de autenticação não executa", async () => {
    const chave = "integracao.telegram";
    const anterior = await root.segredoDoSistema.findUnique({ where: { chave } });
    const material = { valorCifrado: "cifra-sintetica", iv: "iv-sintetico", tag: "tag-sintetica", ultimosQuatro: "fake" };
    const ler = (cliente: PrismaClient) => cliente.$queryRaw<{ valorCifrado: string; iv: string; tag: string }[]>`SELECT * FROM plugga_security.config_telegram()`;
    try {
      await root.segredoDoSistema.upsert({ where: { chave }, create: { chave, ...material }, update: material });

      expect(await ler(clientes.jobs!)).toEqual([{ valorCifrado: "cifra-sintetica", iv: "iv-sintetico", tag: "tag-sintetica" }]);
      expect(await contexto("a", (tx) => tx.$queryRaw`SELECT * FROM plugga_security.config_telegram()`)).toEqual([{ valorCifrado: "cifra-sintetica", iv: "iv-sintetico", tag: "tag-sintetica" }]);
      // A função devolve texto cifrado, não dá acesso à tabela.
      expect(await contexto("a", (tx) => tx.segredoDoSistema.findMany({ where: { chave } }))).toEqual([]);
      await expect(ler(clientes.auth!)).rejects.toThrow();
    } finally {
      if (anterior) await root.segredoDoSistema.update({ where: { id: anterior.id }, data: anterior });
      else await root.segredoDoSistema.deleteMany({ where: { chave } });
    }
  });

  it("config_autentique entrega só a conta da empresa pedida, nada para empresa desconhecida e nada ao pool de autenticação", async () => {
    const chaves = ["integracao.autentique.plugga", "integracao.autentique.waze", "integracao.autentique.outra"];
    const anteriores = await root.segredoDoSistema.findMany({ where: { chave: { in: chaves } } });
    const linha = (chave: string) => ({ chave, valorCifrado: `cifra-${chave}`, iv: "iv-sintetico", tag: "tag-sintetica", ultimosQuatro: "fake" });
    const ler = (cliente: PrismaClient, empresa: string) => cliente.$queryRaw<{ valorCifrado: string }[]>`SELECT * FROM plugga_security.config_autentique(${empresa})`;
    try {
      await root.segredoDoSistema.deleteMany({ where: { chave: { in: chaves } } });
      await root.segredoDoSistema.createMany({ data: chaves.map(linha) });

      // Cada empresa recebe só a própria conta, nunca a da outra.
      expect(await ler(clientes.jobs!, "plugga")).toEqual([{ valorCifrado: "cifra-integracao.autentique.plugga", iv: "iv-sintetico", tag: "tag-sintetica" }]);
      expect(await ler(clientes.jobs!, "waze")).toEqual([{ valorCifrado: "cifra-integracao.autentique.waze", iv: "iv-sintetico", tag: "tag-sintetica" }]);
      expect(await contexto("a", (tx) => tx.$queryRaw<{ valorCifrado: string }[]>`SELECT * FROM plugga_security.config_autentique('waze')`)).toEqual([{ valorCifrado: "cifra-integracao.autentique.waze", iv: "iv-sintetico", tag: "tag-sintetica" }]);
      // Empresa fora da lista não devolve nada, mesmo com a linha existindo no cofre; curinga e injeção também não.
      for (const empresa of ["outra", "%", "plugga' OR '1'='1", ""]) expect(await ler(clientes.jobs!, empresa)).toEqual([]);
      // A função devolve texto cifrado, não dá acesso à tabela; o pool de autenticação não a executa.
      expect(await contexto("a", (tx) => tx.segredoDoSistema.findMany({ where: { chave: { in: chaves } } }))).toEqual([]);
      await expect(ler(clientes.auth!, "plugga")).rejects.toThrow();
    } finally {
      await root.segredoDoSistema.deleteMany({ where: { chave: { in: chaves } } });
      if (anteriores.length > 0) await root.segredoDoSistema.createMany({ data: anteriores });
    }
  });

  it("a conversão restrita é atômica, exige sessão/tela e não deixa cliente após rollback", async () => {
    const email = `${randomUUID()}@sintetico.invalid`;
    const negocio = await root.deal.create({ data: {
      title: marca, ownerId: pessoas.get("b")!.id, pipelineId, stageId: etapaId,
      profile: { create: { name: `Rollback ${randomUUID()}`, personType: "pj", email } },
    } });
    try {
      await expect(app().$executeRaw`SELECT plugga_security.converter_lead_snapshot(${negocio.id}::uuid)`).rejects.toThrow();
      await expect(contexto("sem-tela", (tx) => tx.$executeRaw`SELECT plugga_security.converter_lead_snapshot(${negocio.id}::uuid)`)).rejects.toThrow();
      await expect(contexto("pipeline", async (tx) => {
        await tx.$executeRaw`SELECT plugga_security.converter_lead_snapshot(${negocio.id}::uuid)`;
        throw new Error("rollback sintético da conversão");
      })).rejects.toThrow("rollback sintético da conversão");
      expect((await root.deal.findUniqueOrThrow({ where: { id: negocio.id } })).clientId).toBeNull();
      expect(await root.client.count({ where: { email } })).toBe(0);
      expect(await root.dealHistory.count({ where: { dealId: negocio.id, kind: "client_converted" } })).toBe(0);
      expect(await root.eventLog.count({ where: { entityId: negocio.id } })).toBe(0);
    } finally {
      await root.deal.delete({ where: { id: negocio.id } });
    }
  });

  it("a RPC permite converter o snapshot de outro responsável e só revela criação a quem tem Clientes", async () => {
    const negocios = [];
    try {
      for (const operador of ["a", "pipeline"]) {
        const negocio = await root.deal.create({ data: {
          title: marca, ownerId: pessoas.get("b")!.id, pipelineId, stageId: etapaId,
          profile: { create: { name: `Conversao ${randomUUID()}`, personType: "pj", email: `${randomUUID()}@sintetico.invalid` } },
        } });
        negocios.push(negocio);
        const resultado = await contexto(operador, (tx) => tx.$queryRaw<Array<{ criado: boolean | null }>>`SELECT plugga_security.converter_lead_snapshot(${negocio.id}::uuid) AS criado`);
        expect(resultado).toEqual([{ criado: operador === "a" ? true : null }]);
        const convertido = await root.deal.findUniqueOrThrow({ where: { id: negocio.id } });
        clientesExtras.push(convertido.clientId!);
        expect((await root.client.findUniqueOrThrow({ where: { id: convertido.clientId! } })).ownerId).toBe(pessoas.get("b")!.id);
        expect(await contexto("a", (tx) => tx.$queryRaw`SELECT plugga_security.converter_lead_snapshot(${negocio.id}::uuid) AS criado`)).toEqual([{ criado: false }]);
        expect(await contexto("pipeline", (tx) => tx.$queryRaw`SELECT plugga_security.converter_lead_snapshot(${negocio.id}::uuid) AS criado`)).toEqual([{ criado: null }]);
      }
      // A exceção limitada ao snapshot não concede atribuição explícita a terceiros.
      await expect(contexto("a", (tx) => tx.client.create({ data: { name: marca, ownerId: pessoas.get("b")!.id } }))).rejects.toThrow("ATRIBUICAO_REQUER_GESTAO");
    } finally {
      await root.deal.deleteMany({ where: { id: { in: negocios.map((n) => n.id) } } });
    }
  });

  it("a licença de Clientes permite criar do snapshot sem contornar documento único; Pipelines exige resolução", async () => {
    const nome = `Duplicata ${randomUUID()}`;
    const existente = await root.client.create({ data: { name: nome, ownerId: pessoas.get("b")!.id } });
    clientesExtras.push(existente.id);
    const negocio = await root.deal.create({ data: {
      title: marca, ownerId: pessoas.get("b")!.id, pipelineId, stageId: etapaId,
      profile: { create: { name: nome, personType: "pj", email: `${randomUUID()}@sintetico.invalid` } },
    } });
    let comDocumentoId: string | undefined;
    try {
      await expect(contexto("pipeline", (tx) => tx.$executeRaw`SELECT plugga_security.converter_lead_snapshot(${negocio.id}::uuid)`)).rejects.toThrow("CONVERSAO_REQUER_CLIENTES");
      expect(await contexto("a", (tx) => tx.$queryRaw`SELECT plugga_security.converter_lead_snapshot(${negocio.id}::uuid) AS criado`)).toEqual([{ criado: true }]);
      const clienteId = (await root.deal.findUniqueOrThrow({ where: { id: negocio.id } })).clientId!;
      clientesExtras.push(clienteId);
      expect(clienteId).not.toBe(existente.id);
      expect(await root.client.count({ where: { name: nome } })).toBe(2);
      const documento = randomUUID().replaceAll("-", "");
      await root.client.update({ where: { id: existente.id }, data: { document: documento } });
      const cadastroAntes = await root.client.findUniqueOrThrow({ where: { id: existente.id } });
      const comDocumento = await root.deal.create({ data: {
        title: marca, ownerId: pessoas.get("b")!.id, pipelineId, stageId: etapaId,
        profile: { create: { name: `Outro snapshot ${randomUUID()}`, personType: "pj", document: documento, email: `${randomUUID()}@sintetico.invalid` } },
      } });
      comDocumentoId = comDocumento.id;
      expect(await contexto("a", (tx) => tx.$queryRaw`SELECT plugga_security.converter_lead_snapshot(${comDocumento.id}::uuid) AS criado`)).toEqual([{ criado: false }]);
      expect((await root.deal.findUniqueOrThrow({ where: { id: comDocumento.id } })).clientId).toBe(existente.id);
      expect(await root.client.findUniqueOrThrow({ where: { id: existente.id } })).toEqual(cadastroAntes);
      expect(await root.client.count({ where: { document: documento } })).toBe(1);
    } finally {
      await root.deal.deleteMany({ where: { id: { in: [negocio.id, ...(comDocumentoId ? [comDocumentoId] : [])] } } });
    }
  });

  it("a deduplicação por documento converge entre pipelines sem revelar nem alterar o cadastro encontrado", async () => {
    const documento = randomUUID().replaceAll("-", "");
    const nomeDoCadastro = `Cadastro ${randomUUID()}`;
    const existente = await root.client.create({ data: { name: nomeDoCadastro, document: documento, ownerId: pessoas.get("b")!.id } });
    clientesExtras.push(existente.id);
    const outroPipeline = await root.pipeline.create({ data: {
      companyId: empresaId, name: `${marca} alternativo`, color: "blue", valueLabel: "Valor", wonLabel: "Ganho", lostLabel: "Perdido",
      stages: { create: { name: marca, color: "blue", position: 0 } },
    }, include: { stages: true } });
    const negocios = [];
    try {
      for (const { funil, etapa } of [{ funil: pipelineId, etapa: etapaId }, { funil: outroPipeline.id, etapa: outroPipeline.stages[0]!.id }]) {
        negocios.push(await root.deal.create({ data: {
          title: marca, ownerId: pessoas.get("b")!.id, pipelineId: funil, stageId: etapa,
          profile: { create: { name: `Snapshot ${randomUUID()}`, personType: "pj", document: documento, email: `${randomUUID()}@sintetico.invalid` } },
          leadContacts: { create: { name: "Contato que não deve alterar cadastro existente", email: `${randomUUID()}@sintetico.invalid` } },
        } }));
      }
      await Promise.all(negocios.map((negocio) => contexto("pipeline", (tx) => tx.$executeRaw`SELECT plugga_security.converter_lead_snapshot(${negocio.id}::uuid)`)));
      expect(await root.client.count({ where: { document: documento } })).toBe(1);
      expect(await root.client.findUniqueOrThrow({ where: { id: existente.id } })).toEqual(existente);
      expect(await root.clientContact.count({ where: { clientId: existente.id } })).toBe(0);
      expect((await root.deal.findMany({ where: { id: { in: negocios.map((n) => n.id) } } })).every((n) => n.clientId === existente.id)).toBe(true);
      expect(await idsVisiveis("pipeline")).toEqual([]);
      // Sem cliente anterior: a mesma corrida também precisa convergir pelo índice único.
      const novoDocumento = randomUUID().replaceAll("-", "");
      for (const negocio of negocios) {
        await root.deal.update({ where: { id: negocio.id }, data: { clientId: null } });
        await root.leadProfile.update({ where: { dealId: negocio.id }, data: { document: novoDocumento } });
      }
      await Promise.all(negocios.map((negocio) => contexto("pipeline", (tx) => tx.$executeRaw`SELECT plugga_security.converter_lead_snapshot(${negocio.id}::uuid)`)));
      const novo = await root.client.findUniqueOrThrow({ where: { document: novoDocumento } });
      clientesExtras.push(novo.id);
      expect(await root.client.count({ where: { document: novoDocumento } })).toBe(1);
      expect((await root.deal.findMany({ where: { id: { in: negocios.map((n) => n.id) } } })).every((n) => n.clientId === novo.id)).toBe(true);
    } finally {
      await root.deal.deleteMany({ where: { id: { in: negocios.map((n) => n.id) } } });
      await root.pipeline.delete({ where: { id: outroPipeline.id } });
    }
  });

  it.each(["email", "telefone", "nome"])("duplicata possível por %s exige Clientes sem expor candidatos", async (criterio) => {
    const email = `${randomUUID()}@sintetico.invalid`;
    const telefone = `92${String(BigInt(`0x${randomBytes(5).toString("hex")}`)).padStart(9, "9").slice(-9)}`;
    const nome = `Duplicata ${randomUUID()}`;
    const cliente = await root.client.create({ data: {
      name: criterio === "nome" ? `${nome} matriz` : `Cadastro ${randomUUID()}`,
      phone: criterio === "telefone" ? `+55${telefone}` : null,
      ownerId: pessoas.get("b")!.id,
      contacts: criterio === "email" ? { create: { name: "Contato cadastral", email } } : undefined,
    } });
    clientesExtras.push(cliente.id);
    const negocio = await root.deal.create({ data: {
      title: marca, ownerId: pessoas.get("b")!.id, pipelineId, stageId: etapaId,
      profile: { create: { name: criterio === "nome" ? nome : `Snapshot ${randomUUID()}`, personType: "pj", email, phone: telefone } },
    } });
    try {
      await expect(contexto("pipeline", (tx) => tx.$executeRaw`SELECT plugga_security.converter_lead_snapshot(${negocio.id}::uuid)`)).rejects.toThrow("CONVERSAO_REQUER_CLIENTES");
      expect((await root.deal.findUniqueOrThrow({ where: { id: negocio.id } })).clientId).toBeNull();
      expect(await root.dealHistory.count({ where: { dealId: negocio.id, kind: "client_converted" } })).toBe(0);
      expect(await root.eventLog.count({ where: { entityId: negocio.id } })).toBe(0);
      expect(await contexto("pipeline", (tx) => tx.client.findMany({ where: { id: cliente.id } }))).toEqual([]);
    } finally {
      await root.deal.delete({ where: { id: negocio.id } });
    }
  });

  it("Contratos e Financeiro recebem só id/nome dos clientes de seus contratos, em lote", async () => {
    const contratos = await Promise.all(["a", "b"].map((nome) => root.contract.create({ data: {
      ownerId: pessoas.get(nome)!.id, clientId: registros.get(nome)!,
    } })));
    const ids = contratos.map((c) => c.id);
    try {
      for (const pessoa of ["contratos", "financeiro"]) {
        await contexto(pessoa, async (tx) => {
          expect(await tx.contract.findMany({ where: { id: { in: ids } }, select: { id: true } })).toHaveLength(2);
          expect(await tx.client.findMany()).toEqual([]);
          expect(await tx.clientContact.findMany()).toEqual([]);
          expect(await tx.$queryRaw`SELECT plugga_security.cliente_para_contrato(${registros.get("misto")!}::uuid) AS permitido`).toEqual([{ permitido: false }]);
          const linhas = await tx.$queryRaw<Array<{ contract_id: string; id: string; name: string }>>`SELECT * FROM plugga_security.clientes_dos_contratos(${ids}::uuid[])`;
          expect(linhas).toHaveLength(2);
          for (const linha of linhas) expect(Object.keys(linha).sort()).toEqual(["contract_id", "id", "name"]);
          expect(linhas.map((linha) => linha.id).sort()).toEqual([registros.get("a"), registros.get("b")].sort());
        });
      }
      expect(await contexto("pipeline", (tx) => tx.$queryRaw`SELECT * FROM plugga_security.clientes_dos_contratos(${ids}::uuid[])`)).toEqual([]);
      expect(await contexto("sem-tela", (tx) => tx.$queryRaw`SELECT * FROM plugga_security.clientes_dos_contratos(${ids}::uuid[])`)).toEqual([]);
    } finally {
      await root.contract.deleteMany({ where: { id: { in: ids } } });
    }
  });

  it("Contratos sem Pipelines preserva oportunidade existente, mas não cria nem troca esse vínculo", async () => {
    const oportunidades = [randomUUID(), randomUUID()];
    const contratos = [randomUUID(), randomUUID()];
    const ator = pessoas.get("contratos")!.id;
    try {
      for (const id of oportunidades) await root.opportunity.create({ data: {
        id, title: marca, product: marca, status: "ganha", ownerId: pessoas.get("b")!.id, clientId: registros.get("a")!,
      } });
      await root.contract.create({ data: { id: contratos[0]!, ownerId: ator, clientId: registros.get("a")!, opportunityId: oportunidades[0]! } });
      expect(await contexto("contratos", (tx) => tx.opportunity.findMany({ where: { id: { in: oportunidades } } }))).toEqual([]);
      await expect(contexto("contratos", (tx) => tx.contract.create({ data: {
        id: contratos[1]!, ownerId: ator, clientId: registros.get("a")!, opportunityId: oportunidades[1]!,
      } }))).rejects.toThrow("VINCULO_OPORTUNIDADE_REQUER_PIPELINES");
      await expect(contexto("contratos", (tx) => tx.contract.update({ where: { id: contratos[0]! }, data: { opportunityId: oportunidades[1]! } }))).rejects.toThrow("VINCULO_OPORTUNIDADE_REQUER_PIPELINES");
      await expect(contexto("contratos", (tx) => tx.contract.update({ where: { id: contratos[0]! }, data: { opportunityId: null } }))).rejects.toThrow("VINCULO_OPORTUNIDADE_REQUER_PIPELINES");
      await contexto("contratos", (tx) => tx.contract.update({ where: { id: contratos[0]! }, data: { status: "revisao_interna", opportunityId: oportunidades[0]! } }));
      await root.userDepartamento.update({ where: { userId_departamento: { userId: ator, departamento: "crm" } }, data: { telas: ["crm.contratos", "crm.pipelines"] } });
      await contexto("contratos", (tx) => tx.contract.create({ data: {
        id: contratos[1]!, ownerId: ator, clientId: registros.get("a")!, opportunityId: oportunidades[1]!,
      } }));
      await root.userDepartamento.update({ where: { userId_departamento: { userId: ator, departamento: "crm" } }, data: { telas: ["crm.contratos"] } });
      expect(await contexto("contratos", (tx) => tx.contract.update({ where: { id: contratos[1]! }, data: { status: "revisao_interna", opportunityId: oportunidades[1]! } }))).toMatchObject({ opportunityId: oportunidades[1] });
    } finally {
      await root.userDepartamento.update({ where: { userId_departamento: { userId: ator, departamento: "crm" } }, data: { telas: ["crm.contratos"] } });
      await root.contract.deleteMany({ where: { id: { in: contratos } } });
      await root.opportunity.deleteMany({ where: { id: { in: oportunidades } } });
    }
  });

  it("WITH CHECK preserva a coerência entre cliente, contato e UC sem restringir pelo responsável", async () => {
    const negocio = await root.deal.findFirstOrThrow({ where: { pipelineId, ownerId: pessoas.get("a")!.id } });
    await expect(contexto("a", (tx) => tx.deal.update({ where: { id: negocio.id }, data: { contactId: contatos.get("b")! } }))).rejects.toThrow();
    await expect(contexto("a", (tx) => tx.dealConsumerUnit.create({ data: { dealId: negocio.id, consumerUnitId: unidades.get("b")! } }))).rejects.toThrow();
    await contexto("a", async (tx) => {
      await tx.deal.update({ where: { id: negocio.id }, data: { clientId: registros.get("b")!, contactId: contatos.get("b")! } });
      await tx.dealConsumerUnit.create({ data: { dealId: negocio.id, consumerUnitId: unidades.get("b")! } });
      await tx.deal.update({ where: { id: negocio.id }, data: { clientId: registros.get("a")!, contactId: contatos.get("a")! } });
      await tx.dealConsumerUnit.create({ data: { dealId: negocio.id, consumerUnitId: unidades.get("a")! } });
    });
    const pipeline = await contexto("gerente", (tx) => tx.pipeline.findUnique({ where: { id: pipelineId }, include: { members: { include: { user: { select: { id: true, name: true, status: true } } } } } }));
    expect(pipeline?.members).toHaveLength(2);
  });

  it("WITH CHECK permite vínculos da tela e recusa cliente incoerente com a oportunidade", async () => {
    const oportunidades = [randomUUID(), randomUUID(), randomUUID()];
    const contratos = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    const a = pessoas.get("a")!.id;
    const b = pessoas.get("b")!.id;
    try {
      await contexto("a", (tx) => tx.opportunity.create({ data: {
        id: oportunidades[0]!, title: marca, product: marca, ownerId: a, clientId: registros.get("a")!,
      } }));
      await root.opportunity.create({ data: {
        id: oportunidades[1]!, title: marca, product: marca, ownerId: b, clientId: registros.get("b")!,
      } });
      await contexto("a", (tx) => tx.opportunity.create({ data: {
        id: oportunidades[2]!, title: marca, product: marca, ownerId: a, clientId: registros.get("b")!,
      } }));
      await contexto("a", (tx) => tx.opportunity.update({ where: { id: oportunidades[0]! }, data: { clientId: registros.get("b")! } }));
      expect((await root.opportunity.findUniqueOrThrow({ where: { id: oportunidades[0]! } })).clientId).toBe(registros.get("b"));
      await contexto("a", (tx) => tx.opportunity.update({ where: { id: oportunidades[0]! }, data: { clientId: registros.get("a")! } }));
      expect((await root.opportunity.findUniqueOrThrow({ where: { id: oportunidades[0]! } })).clientId).toBe(registros.get("a"));

      await contexto("a", (tx) => tx.contract.create({ data: {
        id: contratos[0]!, ownerId: a, clientId: registros.get("a")!, opportunityId: oportunidades[0]!,
      } }));
      await expect(contexto("a", (tx) => tx.contract.create({ data: {
        id: contratos[1]!, ownerId: a, clientId: registros.get("a")!, opportunityId: oportunidades[1]!,
      } }))).rejects.toThrow();
      await expect(contexto("a", (tx) => tx.contract.update({ where: { id: contratos[0]! }, data: { opportunityId: oportunidades[1]! } }))).rejects.toThrow();
      expect((await root.contract.findUniqueOrThrow({ where: { id: contratos[0]! } })).opportunityId).toBe(oportunidades[0]);

      await expect(contexto("gerente", (tx) => tx.contract.create({ data: {
        id: contratos[2]!, ownerId: a, clientId: registros.get("a")!, opportunityId: oportunidades[1]!,
      } }))).rejects.toThrow();
      await contexto("gerente", (tx) => tx.contract.create({ data: {
        id: contratos[3]!, ownerId: a, clientId: registros.get("b")!, opportunityId: oportunidades[1]!,
      } }));
      expect(await root.contract.count({ where: { id: { in: contratos } } })).toBe(2);
    } finally {
      await root.contract.deleteMany({ where: { id: { in: contratos } } });
      await root.opportunity.deleteMany({ where: { id: { in: oportunidades } } });
    }
  });

  it("a tela, e não o nível ou o responsável, determina a leitura do cadastro", async () => {
    expect(await idsVisiveis("gerente")).toHaveLength(3);
    expect(await idsVisiveis("a")).toHaveLength(3);
    expect(await idsVisiveis("misto")).toEqual([]);
    expect(await idsVisiveis("sem-tela")).toEqual([]);
    expect(await idsVisiveis("pipeline")).toEqual([]);
    expect(await idsVisiveis("contratos")).toEqual([]);
    expect(await idsVisiveis("admin")).toHaveLength(3);
    expect(await idsVisiveis("dev")).toHaveLength(3);
    expect(await idsVisiveis("financeiro")).toEqual([]);
  });

  it("editar outro responsável não concede atribuição a terceiros nem reabilita destinatário inelegível", async () => {
    const a = pessoas.get("a")!.id;
    const b = pessoas.get("b")!.id;
    const negocio = await root.deal.findFirstOrThrow({ where: { pipelineId, ownerId: a } });
    const oportunidade = await root.opportunity.create({ data: { title: marca, product: marca, ownerId: a } });
    const contrato = await root.contract.create({ data: { ownerId: a, clientId: registros.get("a")! } });
    const atribuir = (ownerId: string) => [
      (tx: Prisma.TransactionClient) => tx.client.updateMany({ where: { id: registros.get("a")! }, data: { ownerId } }),
      (tx: Prisma.TransactionClient) => tx.deal.updateMany({ where: { id: negocio.id }, data: { ownerId } }),
      (tx: Prisma.TransactionClient) => tx.opportunity.updateMany({ where: { id: oportunidade.id }, data: { ownerId } }),
      (tx: Prisma.TransactionClient) => tx.contract.updateMany({ where: { id: contrato.id }, data: { ownerId } }),
    ];
    try {
      for (const operacao of atribuir(b)) await expect(contexto("a", operacao)).rejects.toThrow("ATRIBUICAO_REQUER_GESTAO");
      await root.user.update({ where: { id: b }, data: { status: "disabled" } });
      for (const operacao of atribuir(b)) await expect(contexto("gerente", operacao)).rejects.toThrow("RESPONSAVEL_INELEGIVEL");
      expect(await contexto("pipeline", (tx) => tx.user.findUnique({ where: { id: b }, select: { id: true, name: true, status: true } }))).toMatchObject({ id: b, status: "disabled" });
      await root.user.update({ where: { id: b }, data: { status: "active" } });
      for (const operacao of atribuir(b)) expect(await contexto("gerente", operacao)).toMatchObject({ count: 1 });
      await expect(contexto("gerente", (tx) => tx.contract.updateMany({ where: { id: contrato.id }, data: { ownerId: pessoas.get("pipeline")!.id } }))).rejects.toThrow("RESPONSAVEL_INELEGIVEL");
      await expect(contexto("gerente", (tx) => tx.client.updateMany({ where: { id: registros.get("a")! }, data: { ownerId: pessoas.get("pipeline")!.id } }))).rejects.toThrow("RESPONSAVEL_INELEGIVEL");
    } finally {
      await root.user.update({ where: { id: b }, data: { status: "active" } });
      await root.client.update({ where: { id: registros.get("a")! }, data: { ownerId: a } });
      await root.deal.update({ where: { id: negocio.id }, data: { ownerId: a } });
      await root.contract.delete({ where: { id: contrato.id } });
      await root.opportunity.delete({ where: { id: oportunidade.id } });
    }
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
    const resultado = await Promise.all(Array.from({ length: 12 }, (_, i) => idsVisiveis(i % 2 ? "pipeline" : "a")));
    resultado.forEach((ids, i) => expect(ids).toEqual(i % 2 ? [] : [...registros.values()]));
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
    expect(await clientes.auth!.session.count({ where: { userId: { in: idsUsuarios } } })).toBe(idsUsuarios.length);
    expect(await clientes.jobs!.jobRun.findMany({ where: { jobKey: marca } })).toEqual([]);
    expect(await contexto("pipeline", (tx) => tx.user.findMany({ where: { id: pessoas.get("b")!.id }, select: { id: true, name: true, status: true } }))).toHaveLength(1);
    await expect(contexto("pipeline", (tx) => tx.user.findMany({ select: { email: true } }))).rejects.toThrow();
    await expect(contexto("admin", (tx) => tx.user.findMany({ select: { email: true } }))).rejects.toThrow();
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
