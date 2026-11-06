import { randomBytes, randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import type { Acesso, LeadProposalContent, Tela } from "@plugga/shared";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { AuthRepository } from "../src/auth/auth.repository";
import { PasswordService } from "../src/auth/password.service";
import { PrismaAuthRepository } from "../src/auth/prisma-auth.repository";
import { configureApp } from "../src/configure-app";
import { NullSessionCache } from "../src/core/auth/null-session-cache";
import { PrismaSessionLookupRepository } from "../src/core/auth/prisma-session-lookup.repository";
import { SessionCache } from "../src/core/auth/session-cache";
import { SessionLookupRepository } from "../src/core/auth/session-lookup.repository";
import { hashToken } from "../src/core/auth/token.util";
import { ArmazenamentoDeDocumentos } from "../src/lead-documentos/armazenamento-de-documentos";
import { PrismaAuthService } from "../src/prisma/prisma-auth.service";
import { PrismaJobsService } from "../src/prisma/prisma-jobs.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { validarPapelBanco } from "../src/prisma/validar-papel-banco";
import { assertSafeTestDatabaseUrl } from "./safe-test-environment";

const HABILITADO = process.env.RUN_PERMISSOES_INTEGRATION_TESTS === "true";
const PRAZO_MS = 120_000;
const ORIGIN = "http://localhost:3000";
const TELAS_CRM: Tela[] = ["crm.pipelines", "crm.clientes", "crm.contratos", "crm.propostas"];
type Persona = "membroA" | "membroB" | "gerente" | "gerenteLimitado" | "admin" | "desenvolvedor" | "semTela" | "outroDepartamento";

/** HTTP e RLS com três logins reais restritos; o administrador só prepara/verifica fixtures sintéticas. */
describe.skipIf(!HABILITADO)("isolamento dos membros com sessão real (HTTP + PostgreSQL)", () => {
  const execucao = randomUUID();
  const prefixo = `Sintético permissões ${execucao.slice(0, 8)}`;
  const pipelineId = randomUUID();
  const pipelineDestinoId = randomUUID();
  const etapaDestinoId = randomUUID();
  const pipelineIds = [pipelineId, pipelineDestinoId];
  const etapaId = randomUUID();
  const outraEtapaId = randomUUID();
  const motivoId = randomUUID();
  const modeloId = randomUUID();
  const cookies = new Map<Persona, string>();
  const acessos: Record<Persona, Acesso> = {
    membroA: { plataforma: null, departamentos: [{ departamento: "crm", nivel: "membro", telas: TELAS_CRM }] },
    membroB: { plataforma: null, departamentos: [{ departamento: "crm", nivel: "membro", telas: TELAS_CRM }] },
    gerente: { plataforma: null, departamentos: [{ departamento: "crm", nivel: "gerente", telas: TELAS_CRM }] },
    gerenteLimitado: { plataforma: null, departamentos: [{ departamento: "crm", nivel: "gerente", telas: ["crm.clientes"] }] },
    admin: { plataforma: "admin", departamentos: [] },
    desenvolvedor: { plataforma: "desenvolvedor", departamentos: [] },
    semTela: { plataforma: null, departamentos: [{ departamento: "crm", nivel: "membro", telas: [] }] },
    outroDepartamento: { plataforma: null, departamentos: [{ departamento: "marketing", nivel: "gerente", telas: ["marketing.campanhas"] }] },
  };
  const personas = Object.keys(acessos) as Persona[];
  const pessoas = Object.fromEntries(personas.map((persona) => [persona, {
    id: randomUUID(), email: `${persona.toLowerCase()}-${execucao}@sintetico.example.test`,
  }])) as Record<Persona, { id: string; email: string }>;
  const registros = {
    A: { clientId: randomUUID(), contactId: randomUUID(), dealId: randomUUID(), opportunityId: randomUUID(), contractId: randomUUID(), documentId: randomUUID(), proposalId: randomUUID() },
    B: { clientId: randomUUID(), contactId: randomUUID(), dealId: randomUUID(), opportunityId: randomUUID(), contractId: randomUUID(), documentId: randomUUID(), proposalId: randomUUID() },
  };
  const userIds = personas.map((persona) => pessoas[persona].id);
  const fixtureIds = Object.values(registros).flatMap((registro) => Object.values(registro));
  const conteudo: LeadProposalContent = {
    title: `${prefixo} proposta`, recipient: `${prefixo} destinatário`, company: "", email: "", phone: "", city: "", owner: "", jobTitle: "",
    amount: "100.00", validUntil: new Date(Date.now() + 15 * 86_400_000).toISOString().slice(0, 10),
    introduction: "Dados sintéticos", scope: "Ensaio local", payment: "", notes: "",
  };
  const ambienteOriginal = new Map<string, string | undefined>();
  const papeisCriados: string[] = [];
  const marcaLogin = `rls_http_${randomBytes(8).toString("hex")}`;
  const pools = {
    app: { login: `${marcaLogin}_app`, grupo: "plugga_runtime", variavel: "DATABASE_URL" },
    auth: { login: `${marcaLogin}_auth`, grupo: "plugga_auth_runtime", variavel: "AUTH_DATABASE_URL" },
    jobs: { login: `${marcaLogin}_jobs`, grupo: "plugga_jobs_runtime", variavel: "JOBS_DATABASE_URL" },
  } as const;
  const loginsCriados: string[] = [];
  const agentesCriados: string[] = [];
  const clientesExtras: string[] = [];
  let agenteIA: { id: string; token: string; clientId: string; dealId: string } | undefined;
  const chamadasStorage = {
    enviar: vi.fn(), ler: vi.fn(), excluir: vi.fn(),
  };
  let app: NestExpressApplication | undefined;
  let prisma: PrismaClient | undefined;

  function banco(): PrismaClient {
    if (!prisma) throw new Error("Banco sintético não foi inicializado.");
    return prisma;
  }

  function http(persona: Persona, method: "get" | "post" | "patch" | "delete", path: string): request.Test {
    const cookie = cookies.get(persona);
    if (!app || !cookie) throw new Error("Sessão real não foi inicializada.");
    return request(app.getHttpServer())[method](path).set("Cookie", cookie).set("Origin", ORIGIN);
  }

  function agente() {
    if (!agenteIA) throw new Error("Identidade de IA sintética não foi criada.");
    return agenteIA;
  }

  function httpAgente(method: "get" | "post" | "patch", path: string, token = agente().token): request.Test {
    if (!app) throw new Error("Aplicação não inicializada.");
    return request(app.getHttpServer())[method](path).set("Origin", ORIGIN).set("Authorization", `Bearer ${token}`);
  }

  function idRecebido(valor: unknown): string {
    if (typeof valor !== "string" || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(valor)) {
      throw new Error("A API não retornou um UUID válido.");
    }
    return valor;
  }

  function tokenRecebido(valor: unknown): string {
    if (typeof valor !== "string" || !/^plg_agent_[A-Za-z0-9_-]{43}$/.test(valor)) throw new Error("A API não retornou uma credencial de IA válida.");
    return valor;
  }

  function definirAmbiente(nome: string, valor: string): void {
    ambienteOriginal.set(nome, process.env[nome]);
    process.env[nome] = valor;
  }

  async function comAcessosTemporarios(alteracoes: Partial<Record<Persona, Acesso>>, verificar: () => Promise<void>): Promise<void> {
    if (!app) throw new Error("Aplicação não inicializada.");
    const repository = app.get<AuthRepository>(AuthRepository);
    const anteriores: { id: string; acesso: Acesso }[] = [];
    try {
      for (const persona of personas) {
        const acesso = alteracoes[persona];
        if (!acesso) continue;
        const pessoa = await repository.findUserById(pessoas[persona].id);
        if (!pessoa) throw new Error("Persona sintética não foi encontrada.");
        anteriores.push({ id: pessoa.id, acesso: pessoa.acesso });
        await repository.replaceAcesso(pessoa.id, acesso, pessoas.desenvolvedor.id);
      }
      await verificar();
    } finally {
      for (const anterior of anteriores.reverse()) await repository.replaceAcesso(anterior.id, anterior.acesso, pessoas.desenvolvedor.id);
    }
  }

  async function estado() {
    const db = banco();
    return {
      negocios: await db.deal.findMany({ where: { pipelineId: { in: pipelineIds } }, orderBy: { id: "asc" } }),
      perfis: await db.leadProfile.findMany({ where: { deal: { pipelineId: { in: pipelineIds } } }, orderBy: { dealId: "asc" } }),
      historico: await db.dealHistory.findMany({ where: { deal: { pipelineId: { in: pipelineIds } } }, orderBy: { id: "asc" } }),
      clientes: await db.client.findMany({ where: { ownerId: { in: userIds } }, orderBy: { id: "asc" } }),
      contatos: await db.clientContact.findMany({ where: { client: { ownerId: { in: userIds } } }, orderBy: { id: "asc" } }),
      oportunidades: await db.opportunity.findMany({ where: { ownerId: { in: userIds } }, orderBy: { id: "asc" } }),
      contatosComerciais: await db.opportunityContact.findMany({ where: { opportunity: { ownerId: { in: userIds } } }, orderBy: { id: "asc" } }),
      contratos: await db.contract.findMany({ where: { ownerId: { in: userIds } }, orderBy: { id: "asc" } }),
      documentos: await db.leadDocument.findMany({ where: { deal: { pipelineId } }, orderBy: { id: "asc" } }),
      propostas: await db.leadProposal.findMany({ where: { deal: { pipelineId } }, orderBy: { id: "asc" } }),
      eventos: await db.eventLog.count({ where: { OR: [{ actorId: { in: userIds } }, { entityId: { in: fixtureIds } }] } }),
    };
  }

  beforeAll(async () => {
    const urlAdministrativa = process.env.DATABASE_URL ?? "";
    assertSafeTestDatabaseUrl(urlAdministrativa);
    if (process.env.PLUGGA_TEST_IGNORE_ENV_FILE !== "true") throw new Error("Execute com o runner hermético, sem carregar .env.");
    const db = new PrismaClient({ datasourceUrl: urlAdministrativa });
    prisma = db;
    await db.$connect();
    const [executor] = await db.$queryRaw<{ superuser: boolean }[]>`SELECT rolsuper AS superuser FROM pg_roles WHERE rolname = current_user`;
    expect(executor?.superuser, "Fixtures exigem administrador do banco local isolado").toBe(true);
    for (const { login, grupo, variavel } of Object.values(pools)) {
      if (!/^rls_http_[a-f0-9]+_(app|auth|jobs)$/.test(login)) throw new Error("Login sintético inválido.");
      const senhaBanco = randomBytes(32).toString("hex");
      await db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('plugga.test_role', ${login}, true)`;
        await tx.$executeRaw`SELECT set_config('plugga.test_password', ${senhaBanco}, true)`;
        await tx.$executeRawUnsafe(`DO $fixture$ BEGIN EXECUTE format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L', current_setting('plugga.test_role'), current_setting('plugga.test_password')); END $fixture$`);
      });
      loginsCriados.push(login);
      await db.$executeRawUnsafe(`GRANT ${grupo} TO "${login}"`);
      const url = new URL(urlAdministrativa);
      url.username = login;
      url.password = senhaBanco;
      url.searchParams.set("connection_limit", "2");
      definirAmbiente(variavel, url.toString());
    }
    definirAmbiente("RUN_RLS_INTEGRATION_TESTS", "true");
    definirAmbiente("DEV_AUTH_ENABLED", "false");
    definirAmbiente("SESSION_CACHE_ENABLED", "false");
    definirAmbiente("JOBS_ENABLED", "false");
    definirAmbiente("AUTH_ALLOWED_ORIGINS", ORIGIN);
    const { AppModule } = await import("../src/app.module");
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SessionCache).useValue(new NullSessionCache())
      // Nenhum arquivo existe no storage: qualquer tentativa de I/O falha antes da rede.
      .overrideProvider(ArmazenamentoDeDocumentos).useValue({
        balde: () => "sintetico-permissoes",
        enviar: chamadasStorage.enviar.mockRejectedValue(new Error("Storage proibido neste ensaio.")),
        ler: chamadasStorage.ler.mockRejectedValue(new Error("Storage proibido neste ensaio.")),
        excluir: chamadasStorage.excluir.mockRejectedValue(new Error("Storage proibido neste ensaio.")),
      }).compile();
    app = module.createNestApplication<NestExpressApplication>({ logger: false });
    configureApp(app);
    await app.init();
    await app.listen(0, "127.0.0.1");
    const runtime = app.get<PrismaService>(PrismaService);
    const auth = app.get<PrismaAuthService>(PrismaAuthService);
    const jobs = app.get<PrismaJobsService>(PrismaJobsService);
    expect(process.env.RUN_RLS_INTEGRATION_TESTS).toBe("true");
    for (const [cliente, pool] of [[runtime, pools.app], [auth, pools.auth], [jobs, pools.jobs]] as const) {
      // O mesmo validador executado no boot confere ACL, grupos, propriedade e FORCE RLS.
      await expect(validarPapelBanco(cliente, pool.grupo)).resolves.toBeUndefined();
      const [identidade] = await cliente.$queryRaw<{ login: string; direto: boolean; seguro: boolean }[]>`
        SELECT current_user AS login, current_user = session_user AS direto,
          NOT (rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication) AS seguro
        FROM pg_roles WHERE rolname = current_user`;
      expect(identidade).toEqual({ login: pool.login, direto: true, seguro: true });
    }
    const repository = app.get(AuthRepository);
    expect(repository).toBeInstanceOf(PrismaAuthRepository);
    expect(app.get(SessionLookupRepository)).toBeInstanceOf(PrismaSessionLookupRepository);
    expect(app.get(ConfigService).get("DEV_AUTH_ENABLED")).toBe(false);
    for (const key of ["admin", "desenvolvedor"]) {
      if (!await db.role.findUnique({ where: { key } })) {
        const id = randomUUID();
        await db.role.create({ data: { id, key, name: `Sintético ${key}` } });
        papeisCriados.push(id);
      }
    }
    const senha = randomBytes(32).toString("base64url");
    const passwordHash = await app.get(PasswordService).hash(senha);
    for (const persona of personas) {
      const pessoa = pessoas[persona];
      await db.user.create({ data: {
        ...pessoa, name: `${prefixo} ${persona}`, status: "active", credential: { create: { passwordHash } },
      } });
    }
    for (const persona of personas) await repository.replaceAcesso(pessoas[persona].id, acessos[persona], pessoas.desenvolvedor.id);
    const papeisDev = await db.userPlatformRole.findMany({ where: { userId: pessoas.desenvolvedor.id }, select: { role: { select: { key: true } } } });
    expect(papeisDev.map((linha) => linha.role.key).sort()).toEqual(["admin", "desenvolvedor"]);
    await db.pipeline.create({ data: {
      id: pipelineId, companyId: "plugga", name: `${prefixo} funil`, valueLabel: "Valor sintético", color: "#123456", wonLabel: "Ganho", lostLabel: "Perdido",
      stages: { create: [
        { id: etapaId, name: "Sintético início", color: "#123456", position: 0 },
        { id: outraEtapaId, name: "Sintético próxima", color: "#234567", position: 1 },
      ] },
      lossReasons: { create: { id: motivoId, name: "Sintético sem interesse", position: 0 } },
      // A configuração antiga do funil não transforma um membro em gerente de CRM.
      members: { create: [{ userId: pessoas.membroA.id, role: "gestor" }, { userId: pessoas.membroB.id, role: "vendedor" }] },
    } });
    await db.pipeline.create({ data: {
      id: pipelineDestinoId, companyId: "plugga", name: `${prefixo} destino`, valueLabel: "Valor sintético", color: "#123456", wonLabel: "Ganho", lostLabel: "Perdido",
      stages: { create: { id: etapaDestinoId, name: "Sintético destino", color: "#123456", position: 0 } },
    } });
    await db.leadProposalTemplate.create({ data: { id: modeloId, name: `${prefixo} modelo`, description: "Ensaio local", style: "essencial", position: 100, defaults: conteudo } });
    for (const [letra, registro] of Object.entries(registros)) {
      const ownerId = letra === "A" ? pessoas.membroA.id : pessoas.membroB.id;
      const email = `${letra.toLowerCase()}-${execucao}@sintetico.example.test`;
      await db.client.create({ data: {
        id: registro.clientId, personType: "pj", name: `${prefixo} cliente ${letra}`, email, ownerId,
        contacts: { create: { id: registro.contactId, name: `${prefixo} contato ${letra}`, email, isPrimary: true } },
      } });
      await db.deal.create({ data: {
        id: registro.dealId, pipelineId, stageId: etapaId, ownerId, title: `${prefixo} negócio ${letra}`,
        profile: { create: { personType: "pj", name: `${prefixo} perfil ${letra}`, email, notes: `${prefixo} privado ${letra}` } },
        history: { create: { kind: "created", actorId: ownerId, toStageName: "Sintético início" } },
      } });
      await db.opportunity.create({ data: {
        id: registro.opportunityId, ownerId, clientId: registro.clientId, title: `${prefixo} oportunidade ${letra}`, product: "Sintético",
        nextActionAt: new Date(Date.now() + 86_400_000), contacts: { create: { channel: "email", outcome: "connected", note: `${prefixo} histórico ${letra}` } },
      } });
      await db.contract.create({ data: {
        id: registro.contractId, clientId: registro.clientId, opportunityId: registro.opportunityId, ownerId,
        nextActionAt: new Date(Date.now() + 86_400_000),
      } });
      await db.leadDocument.create({ data: {
        id: registro.documentId, dealId: registro.dealId, category: "outros", originalName: `${prefixo} documento ${letra}.pdf`, safeName: `sintetico-${letra}.pdf`,
        detectedMime: "application/pdf", sizeBytes: 100, storageBucket: "sintetico-permissoes", storageKey: `${execucao}/${registro.documentId}.pdf`,
        sha256: randomBytes(32).toString("hex"), uploadState: "ready", uploadedById: ownerId,
      } });
      await db.leadProposal.create({ data: { id: registro.proposalId, dealId: registro.dealId, templateId: modeloId, content: { ...conteudo, recipient: `${prefixo} destinatário ${letra}` } } });
    }
    for (const persona of personas) {
      const response = await request(app.getHttpServer()).post("/auth/login").set("Origin", ORIGIN)
        .set("X-Forwarded-For", `192.0.2.${personas.indexOf(persona) + 1}`)
        .send({ email: pessoas[persona].email, password: senha }).expect(200);
      const recebidos: unknown = response.headers["set-cookie"];
      if (!Array.isArray(recebidos) || recebidos.length === 0) throw new Error("Login real não emitiu cookie de sessão.");
      const cookie = recebidos.flatMap((valor: unknown) => typeof valor === "string" ? [valor.split(";")[0] ?? ""] : []).join("; ");
      if (!cookie) throw new Error("Login real emitiu cookie inválido.");
      cookies.set(persona, cookie);
    }
    expect(await db.session.count({ where: { userId: { in: userIds } } })).toBe(personas.length);
    // Fixtures existem, mas a conexão runtime fora do contexto HTTP não as alcança.
    expect(await db.client.count({ where: { ownerId: { in: userIds } } })).toBe(2);
    expect(await runtime.client.findMany()).toEqual([]);
    expect(await runtime.deal.count()).toBe(0);
    expect(await runtime.opportunity.count()).toBe(0);
    expect(await runtime.contract.count()).toBe(0);
    await expect(runtime.session.findMany()).rejects.toThrow();
    await expect(auth.client.findMany()).rejects.toThrow();
    await expect(jobs.user.findMany()).rejects.toThrow();
  }, PRAZO_MS);

  afterAll(async () => {
    try {
      if (prisma) {
        const filtroPipeline = { pipelineId: { in: pipelineIds } };
        const negocios = { deal: filtroPipeline };
        await prisma.leadProposalVersion.deleteMany({ where: { proposal: negocios } });
        await prisma.leadProposal.deleteMany({ where: negocios });
        await prisma.leadDocument.deleteMany({ where: negocios });
        await prisma.deal.updateMany({ where: filtroPipeline, data: { leadContactId: null } });
        await prisma.deal.deleteMany({ where: filtroPipeline });
        await prisma.pipeline.deleteMany({ where: { id: { in: pipelineIds } } });
        await prisma.leadProposalTemplate.deleteMany({ where: { id: modeloId } });
        await prisma.contract.deleteMany({ where: { ownerId: { in: userIds } } });
        await prisma.opportunity.deleteMany({ where: { ownerId: { in: userIds } } });
        await prisma.client.deleteMany({ where: { OR: [{ ownerId: { in: userIds } }, { id: { in: clientesExtras } }] } });
        const comTrilha = await prisma.agentAction.findMany({ where: { agentUserId: { in: agentesCriados } }, select: { agentUserId: true } });
        const preservar = agentesCriados.filter((id) => comTrilha.some((linha) => linha.agentUserId === id));
        // A trilha é append-only e referencia sua identidade: conserva a autoria revogada.
        await prisma.agentIdentity.updateMany({ where: { userId: { in: preservar } }, data: { tokenHash: null, credentialExpiresAt: null, revokedAt: new Date() } });
        await prisma.user.updateMany({ where: { id: { in: preservar } }, data: { status: "removed" } });
        await prisma.agentIdentity.deleteMany({ where: { userId: { in: agentesCriados.filter((id) => !preservar.includes(id)) } } });
        await prisma.user.deleteMany({ where: { id: { in: userIds.filter((id) => !preservar.includes(id)) } } });
        await prisma.role.deleteMany({ where: { id: { in: papeisCriados } } });
        // event_log é append-only: os eventos sintéticos ficam no banco descartável.
      }
    } finally {
      cookies.clear();
      if (agenteIA) agenteIA.token = "";
      try {
        await app?.close();
      } finally {
        try {
          for (const login of loginsCriados) await prisma?.$executeRawUnsafe(`DROP ROLE IF EXISTS "${login}"`);
        } finally {
          await prisma?.$disconnect();
          for (const [nome, valor] of ambienteOriginal) {
            if (valor === undefined) delete process.env[nome];
            else process.env[nome] = valor;
          }
        }
      }
    }
  }, PRAZO_MS);

  it("membro lista somente seus registros e filtros do responsável não ampliam acesso", async () => {
    const a = registros.A;
    const b = registros.B;
    const leads = await http("membroA", "get", `/leads?pipelineId=${pipelineId}`).expect(200);
    expect(leads.body.deals.map((item: { id: string }) => item.id)).toEqual([a.dealId]);
    const clientes = await http("membroA", "get", `/clientes?q=${encodeURIComponent(prefixo)}`).expect(200);
    expect(clientes.body.items.map((item: { id: string }) => item.id)).toEqual([a.clientId]);
    for (const [path, id, idAlheio] of [["opportunities", a.opportunityId, b.opportunityId], ["contracts", a.contractId, b.contractId]]) {
      const lista = await http("membroA", "get", `/commercial/${path}`).expect(200);
      expect(lista.body.items.map((item: { id: string }) => item.id)).toEqual([id]);
      expect(JSON.stringify(lista.body)).not.toContain(idAlheio);
      const forjada = await http("membroA", "get", `/commercial/${path}?ownerId=${pessoas.membroB.id}`).expect(200);
      expect(forjada.body.items).toEqual([]);
    }
    await http("membroA", "get", `/leads?pipelineId=${pipelineId}&ownerId=${pessoas.membroB.id}`).expect(400);
    await http("membroA", "get", `/clientes?ownerId=${pessoas.membroB.id}`).expect(400);
    const selecao = await http("membroA", "get", `/clientes/selecao-negocio?q=${encodeURIComponent(prefixo)}`).expect(200);
    expect(selecao.body.items.map((item: { id: string }) => item.id)).toEqual([a.clientId]);
    const duplicatas = await http("membroA", "get", `/clientes/duplicates?email=${encodeURIComponent(`b-${execucao}@sintetico.example.test`)}`).expect(200);
    expect(duplicatas.body.candidates).toEqual([]);
  });

  it("contadores do pipeline, equipe e diretórios de responsáveis ficam no escopo do membro", async () => {
    const resposta = await http("membroA", "get", "/pipelines").expect(200);
    const pipeline = resposta.body.pipelines.find((item: { id: string }) => item.id === pipelineId);
    expect(pipeline).toMatchObject({ canConfigure: false, dealCount: 1 });
    expect(pipeline.stages.find((item: { id: string }) => item.id === etapaId).dealCount).toBe(1);
    expect(pipeline.members.map((item: { userId: string }) => item.userId)).toEqual([pessoas.membroA.id]);
    expect(resposta.body.responsaveis.map((item: { id: string }) => item.id)).toEqual([pessoas.membroA.id]);
    expect(resposta.body.canCreateIn).toEqual([]);
    const pessoasDoFunil = await http("membroA", "get", "/pipelines/pessoas?companyId=plugga").expect(200);
    expect(pessoasDoFunil.body.people.map((item: { id: string }) => item.id)).toEqual([pessoas.membroA.id]);
    const donos = await http("membroA", "get", "/clientes/responsaveis").expect(200);
    expect(donos.body.items.map((item: { id: string }) => item.id)).toEqual([pessoas.membroA.id]);
  });

  it("IDs alheios ocultam detalhe, perfil, histórico, cliente, oportunidade, contrato e anexos", async () => {
    const b = registros.B;
    for (const path of [
      `/leads/${b.dealId}`, `/leads/${b.dealId}/historico`, `/leads/clientes/${b.clientId}/opcoes`, `/clientes/${b.clientId}`,
      `/commercial/opportunities/${b.opportunityId}`, `/commercial/contracts/${b.contractId}`,
      `/leads/${b.dealId}/documentos`, `/leads/${b.dealId}/documentos/${b.documentId}/download`, `/leads/${b.dealId}/documentos/${b.documentId}/preview`,
      `/leads/${b.dealId}/propostas`, `/leads/${b.dealId}/propostas/modelos`,
      `/leads/${b.dealId}/propostas/${b.proposalId}/preview`, `/leads/${b.dealId}/propostas/${b.proposalId}/download`,
    ]) await http("membroA", "get", path).expect(404);
  });

  it("mutações alheias válidas retornam 404 e preservam registros, histórico e auditoria", async () => {
    const b = registros.B;
    const antes = await estado();
    await http("membroA", "patch", `/leads/${b.dealId}`).send({ version: 1, title: "Sintético bloqueado", lead: { notes: "Sintético bloqueado" } }).expect(404);
    await http("membroA", "patch", `/leads/${b.dealId}/prioridade`).send({ priority: "urgente" }).expect(404);
    await http("membroA", "post", `/leads/${b.dealId}/etapa`).send({ stageId: outraEtapaId }).expect(404);
    await http("membroA", "post", `/leads/${b.dealId}/ganho`).send({ convertToClient: false }).expect(404);
    await http("membroA", "post", `/leads/${b.dealId}/perda`).send({ lossReasonId: motivoId }).expect(404);
    await http("membroA", "post", `/leads/${b.dealId}/converter`).send({ resolution: { type: "link", clientId: registros.A.clientId } }).expect(404);
    await http("membroA", "post", `/leads/${b.dealId}/transferencia`).send({ pipelineId, stageId: outraEtapaId }).expect(404);
    await http("membroA", "patch", `/clientes/${b.clientId}`).send({ name: "Sintético bloqueado" }).expect(404);
    await http("membroA", "post", `/clientes/${b.clientId}/inactivate`).send({ reason: "Sintético bloqueado" }).expect(404);
    await http("membroA", "post", `/clientes/${b.clientId}/activate`).send({}).expect(404);
    await http("membroA", "post", `/clientes/${b.clientId}/contatos`).send({ name: "Sintético bloqueado" }).expect(404);
    await http("membroA", "patch", `/clientes/${b.clientId}/contatos/${b.contactId}`).send({ name: "Sintético bloqueado" }).expect(404);
    await http("membroA", "delete", `/clientes/${b.clientId}/contatos/${b.contactId}`).expect(404);
    await http("membroA", "post", `/commercial/opportunities/${b.opportunityId}/stage`).send({ stage: "qualificacao" }).expect(404);
    await http("membroA", "post", `/commercial/opportunities/${b.opportunityId}/contacts`).send({ channel: "email", outcome: "connected" }).expect(404);
    await http("membroA", "post", `/commercial/opportunities/${b.opportunityId}/win`).send({ clientId: registros.A.clientId }).expect(404);
    await http("membroA", "post", `/commercial/opportunities/${b.opportunityId}/lose`).send({ lossReason: "Sintético bloqueado" }).expect(404);
    await http("membroA", "post", `/commercial/opportunities/${b.opportunityId}/revisit`).send({ nextActionAt: new Date(Date.now() + 86_400_000).toISOString(), nextActionNote: "Sintético bloqueado" }).expect(404);
    await http("membroA", "post", `/commercial/contracts/${b.contractId}/status`).send({ status: "revisao_interna" }).expect(404);
    await http("membroA", "patch", `/leads/${b.dealId}/documentos/${b.documentId}`).send({ originalName: "sintetico-bloqueado.pdf" }).expect(404);
    await http("membroA", "post", `/leads/${b.dealId}/documentos/${b.documentId}/arquivar`).send({}).expect(404);
    await http("membroA", "post", `/leads/${b.dealId}/propostas`).send({ templateId: modeloId, content: conteudo }).expect(404);
    await http("membroA", "patch", `/leads/${b.dealId}/propostas/${b.proposalId}`).send({ revision: 1, templateId: modeloId, content: conteudo }).expect(404);
    await http("membroA", "post", `/leads/${b.dealId}/propostas/${b.proposalId}/gerar`).send({ revision: 1 }).expect(404);
    expect(await estado()).toEqual(antes);
  });

  it("lote misto é negado atomicamente, inclusive quando o primeiro ID é próprio", async () => {
    for (const dealIds of [[registros.A.dealId, registros.B.dealId], [registros.B.dealId, registros.A.dealId]]) {
      const antes = await estado();
      await http("membroA", "post", "/leads/lote").send({ dealIds, action: { type: "priority", priority: "urgente" } }).expect(404);
      expect(await estado()).toEqual(antes);
    }
  });

  it("membro não reatribui os próprios registros nem cria registros para outra pessoa", async () => {
    const a = registros.A;
    const ownerId = pessoas.membroB.id;
    const antes = await estado();
    await http("membroA", "patch", `/leads/${a.dealId}`).send({ version: 1, ownerId }).expect(403);
    await http("membroA", "post", "/leads/lote").send({ dealIds: [a.dealId], action: { type: "owner", ownerId } }).expect(403);
    await http("membroA", "post", `/leads/${a.dealId}/transferencia`).send({ pipelineId: pipelineDestinoId, stageId: etapaDestinoId, ownerId }).expect(403);
    await http("membroA", "patch", `/clientes/${a.clientId}`).send({ ownerId }).expect(403);
    await http("membroA", "post", `/commercial/opportunities/${a.opportunityId}/stage`).send({ stage: "qualificacao", ownerId }).expect(403);
    await http("membroA", "post", `/commercial/opportunities/${a.opportunityId}/revisit`).send({ ownerId, nextActionAt: new Date(Date.now() + 86_400_000).toISOString(), nextActionNote: "Sintético bloqueado" }).expect(403);
    await http("membroA", "post", `/commercial/contracts/${a.contractId}/status`).send({ status: "revisao_interna", ownerId }).expect(403);
    await http("membroA", "post", "/leads").send({ pipelineId, stageId: etapaId, ownerId, title: "Sintético bloqueado", lead: { personType: "pj", name: "Sintético bloqueado", email: `novo-${execucao}@sintetico.example.test` } }).expect(403);
    await http("membroA", "post", "/clientes").send({ personType: "pj", name: "Sintético bloqueado", email: `novo-${execucao}@sintetico.example.test`, ownerId }).expect(403);
    await http("membroA", "post", "/commercial/opportunities").send({ title: "Sintético bloqueado", product: "Sintético", ownerId, nextActionAt: new Date(Date.now() + 86_400_000).toISOString() }).expect(403);
    await http("membroA", "post", "/commercial/contracts").send({ clientId: a.clientId, ownerId }).expect(403);
    expect(await estado()).toEqual(antes);
  });

  it("IDs relacionados alheios não podem ser vinculados a um registro próprio", async () => {
    const antes = await estado();
    await http("membroA", "post", `/leads/${registros.A.dealId}/converter`).send({ resolution: { type: "link", clientId: registros.B.clientId } }).expect(404);
    await http("membroA", "post", "/commercial/opportunities").send({ title: "Sintético bloqueado", product: "Sintético", ownerId: pessoas.membroA.id, clientId: registros.B.clientId, nextActionAt: new Date(Date.now() + 86_400_000).toISOString() }).expect(404);
    await http("membroA", "post", "/commercial/contracts").send({ clientId: registros.B.clientId, ownerId: pessoas.membroA.id }).expect(404);
    await http("membroA", "post", "/commercial/contracts").send({ opportunityId: registros.B.opportunityId, ownerId: pessoas.membroA.id }).expect(404);
    await http("membroA", "patch", `/leads/${registros.A.dealId}/documentos/${registros.B.documentId}`).send({ originalName: "sintetico-bloqueado.pdf" }).expect(404);
    await http("membroA", "patch", `/leads/${registros.A.dealId}/propostas/${registros.B.proposalId}`).send({ revision: 1, templateId: modeloId, content: conteudo }).expect(404);
    expect(await estado()).toEqual(antes);
  });

  it("ambos os membros podem ler os próprios dados e o dono pode editá-los", async () => {
    for (const [persona, r] of [["membroA", registros.A], ["membroB", registros.B]] as const) {
      const detalhe = await http(persona, "get", `/leads/${r.dealId}`).expect(200);
      expect(detalhe.body.owner.id).toBe(pessoas[persona].id);
      expect(detalhe.body.lead.name).toContain(prefixo);
      const history = await http(persona, "get", `/leads/${r.dealId}/historico`).expect(200);
      expect(history.body.entries).toHaveLength(1);
      const cliente = await http(persona, "get", `/clientes/${r.clientId}`).expect(200);
      expect(cliente.body.contacts[0].id).toBe(r.contactId);
      await http(persona, "get", `/leads/clientes/${r.clientId}/opcoes`).expect(200);
      await http(persona, "get", `/commercial/opportunities/${r.opportunityId}`).expect(200);
      await http(persona, "get", `/commercial/contracts/${r.contractId}`).expect(200);
      const docs = await http(persona, "get", `/leads/${r.dealId}/documentos`).expect(200);
      expect(docs.body.documents.map((item: { id: string }) => item.id)).toEqual([r.documentId]);
      const propostas = await http(persona, "get", `/leads/${r.dealId}/propostas`).expect(200);
      expect(propostas.body.proposals.map((item: { id: string }) => item.id)).toEqual([r.proposalId]);
    }
    const b = registros.B;
    await http("membroB", "patch", `/leads/${b.dealId}`).send({ version: 1, title: `${prefixo} negócio B editado` }).expect(200);
    await http("membroB", "patch", `/clientes/${b.clientId}/contatos/${b.contactId}`).send({ jobTitle: "Sintético responsável" }).expect(200);
    await http("membroB", "post", `/commercial/opportunities/${b.opportunityId}/stage`).send({ stage: "qualificacao" }).expect(200);
    await http("membroB", "post", `/commercial/contracts/${b.contractId}/status`).send({ status: "revisao_interna" }).expect(200);
    await http("membroB", "patch", `/leads/${b.dealId}/documentos/${b.documentId}`).send({ category: "documento_do_cliente" }).expect(200);
    await http("membroB", "patch", `/leads/${b.dealId}/propostas/${b.proposalId}`).send({ revision: 1, templateId: modeloId, content: conteudo }).expect(200);
  });

  it("gerente, admin e desenvolvedor alcançam os registros dos dois membros", async () => {
    for (const persona of ["gerente", "admin", "desenvolvedor"] as const) {
      const leads = await http(persona, "get", `/leads?pipelineId=${pipelineId}`).expect(200);
      expect(leads.body.deals.map((item: { id: string }) => item.id).sort()).toEqual([registros.A.dealId, registros.B.dealId].sort());
      for (const [path, ids] of [
        [`/clientes?q=${encodeURIComponent(prefixo)}`, [registros.A.clientId, registros.B.clientId]],
        ["/commercial/opportunities", [registros.A.opportunityId, registros.B.opportunityId]],
        ["/commercial/contracts", [registros.A.contractId, registros.B.contractId]],
      ] as const) {
        const resposta = await http(persona, "get", path).expect(200);
        expect(resposta.body.items.map((item: { id: string }) => item.id)).toEqual(expect.arrayContaining([...ids]));
      }
      for (const r of Object.values(registros)) {
        for (const path of [`/leads/${r.dealId}`, `/leads/${r.dealId}/historico`, `/clientes/${r.clientId}`, `/commercial/opportunities/${r.opportunityId}`, `/commercial/contracts/${r.contractId}`, `/leads/${r.dealId}/documentos`, `/leads/${r.dealId}/propostas`]) {
          await http(persona, "get", path).expect(200);
        }
      }
      const funis = await http(persona, "get", "/pipelines").expect(200);
      expect(funis.body.pipelines.find((item: { id: string }) => item.id === pipelineId)).toMatchObject({ canConfigure: true, dealCount: 2 });
      expect(funis.body.responsaveis.map((item: { id: string }) => item.id)).toEqual(expect.arrayContaining([pessoas.membroA.id, pessoas.membroB.id]));
    }
  });

  it("somente gerente, admin e desenvolvedor podem atribuir registros a outra pessoa", async () => {
    const a = registros.A;
    for (const persona of ["gerente", "admin", "desenvolvedor"] as const) {
      for (const ownerId of [pessoas.membroB.id, pessoas.membroA.id]) {
        const negocio = await banco().deal.findUniqueOrThrow({ where: { id: a.dealId } });
        await http(persona, "patch", `/leads/${a.dealId}`).send({ version: negocio.version, ownerId }).expect(200);
        await http(persona, "patch", `/clientes/${a.clientId}`).send({ ownerId }).expect(200);
        await http(persona, "post", `/commercial/opportunities/${a.opportunityId}/stage`).send({ stage: "qualificacao", ownerId }).expect(200);
        await http(persona, "post", `/commercial/contracts/${a.contractId}/status`).send({ status: "rascunho", ownerId }).expect(200);
        expect((await banco().deal.findUniqueOrThrow({ where: { id: a.dealId } })).ownerId).toBe(ownerId);
        expect((await banco().client.findUniqueOrThrow({ where: { id: a.clientId } })).ownerId).toBe(ownerId);
        expect((await banco().opportunity.findUniqueOrThrow({ where: { id: a.opportunityId } })).ownerId).toBe(ownerId);
        expect((await banco().contract.findUniqueOrThrow({ where: { id: a.contractId } })).ownerId).toBe(ownerId);
      }
    }
  });

  it("pessoa sem tela de CRM ou de outro departamento não alcança os recursos de CRM", async () => {
    for (const persona of ["semTela", "outroDepartamento"] as const) {
      for (const path of ["/pipelines", `/leads?pipelineId=${pipelineId}`, "/clientes", "/commercial/opportunities", "/commercial/contracts", `/leads/${registros.B.dealId}/documentos`, `/leads/${registros.B.dealId}/propostas`]) {
        await http(persona, "get", path).expect(403);
      }
      await http(persona, "get", `/leads/${registros.B.dealId}`).expect(404);
    }
  });

  it("jobs é exclusivo de desenvolvedor, inclusive com cabeçalhos de desenvolvimento forjados", async () => {
    await http("admin", "get", "/jobs").expect(403);
    await http("gerente", "get", "/jobs").expect(403);
    await http("desenvolvedor", "get", "/jobs").expect(200);
    await http("membroA", "get", "/jobs").set("x-dev-principal", pessoas.desenvolvedor.id).set("x-dev-plataforma", "desenvolvedor").expect(403);
    await http("membroA", "get", `/leads/${registros.B.dealId}`).set("x-dev-principal", pessoas.admin.id).set("x-dev-plataforma", "admin").set("x-dev-departamentos", "crm:gerente").expect(404);
    if (!app) throw new Error("Aplicação não inicializada.");
    await request(app.getHttpServer()).get("/jobs").set("x-dev-principal", pessoas.desenvolvedor.id).set("x-dev-plataforma", "desenvolvedor").expect(401);
  });

  it("revogação de telas no banco vale na próxima requisição da mesma sessão", async () => {
    const a = registros.A;
    await http("membroA", "get", `/leads/${a.dealId}`).expect(200);
    const sessoesAntes = await banco().session.count({ where: { userId: pessoas.membroA.id } });
    await banco().userDepartamento.update({ where: { userId_departamento: { userId: pessoas.membroA.id, departamento: "crm" } }, data: { telas: [] } });
    try {
      await http("membroA", "get", `/leads/${a.dealId}`).expect(404);
      for (const path of ["/pipelines", "/clientes", "/commercial/opportunities", "/commercial/contracts", `/leads/${a.dealId}/documentos`, `/leads/${a.dealId}/propostas`]) {
        await http("membroA", "get", path).expect(403);
      }
      expect(await banco().session.count({ where: { userId: pessoas.membroA.id } })).toBe(sessoesAntes);
    } finally {
      await banco().userDepartamento.update({ where: { userId_departamento: { userId: pessoas.membroA.id, departamento: "crm" } }, data: { telas: TELAS_CRM } });
    }
    await http("membroA", "get", `/leads/${a.dealId}`).expect(200);
  });

  it("gerente cria agente membro do CRM com telas limitadas e emite credencial sem expô-la no diretório", async () => {
    const telas = ["crm.pipelines", "crm.clientes"];
    const criado = await http("gerente", "post", "/equipe/agentes").send({ name: `${prefixo} IA`, departamento: "crm", telas }).expect(201);
    const id = idRecebido(criado.body.id);
    agentesCriados.push(id);
    userIds.push(id);
    agenteIA = { id, token: "", clientId: "", dealId: "" };
    expect(criado.body.tipo).toBe("agente_ia");
    expect(criado.body.acesso).toEqual({ plataforma: null, departamentos: [{ departamento: "crm", nivel: "membro", telas }] });
    expect("token" in criado.body || "tokenHash" in criado.body).toBe(false);
    const identidade = await banco().agentIdentity.findUniqueOrThrow({ where: { userId: id } });
    expect(identidade.departamento).toBe("crm");
    expect(identidade.tokenHash === null).toBe(true);
    expect(await banco().userDepartamento.count({ where: { userId: id } })).toBe(1);
    expect(await banco().userPlatformRole.count({ where: { userId: id } })).toBe(0);
    expect(await banco().userCredential.count({ where: { userId: id } })).toBe(0);
    const credencial = await http("gerente", "post", `/equipe/agentes/${id}/credencial`).send({}).expect(200);
    expect(credencial.headers["cache-control"]).toBe("no-store");
    agenteIA.token = tokenRecebido(credencial.body.token);
    expect(credencial.body.userId).toBe(id);
    const persistida = await banco().agentIdentity.findUniqueOrThrow({ where: { userId: id } });
    expect(persistida.tokenHash === hashToken(agenteIA.token)).toBe(true);
    expect(persistida.tokenHash === agenteIA.token).toBe(false);
    expect((persistida.credentialExpiresAt?.getTime() ?? 0) > Date.now()).toBe(true);
    const diretorio = await http("gerente", "get", "/equipe").expect(200);
    expect(diretorio.body.membros.some((membro: { id: string; tipo: string }) => membro.id === id && membro.tipo === "agente_ia")).toBe(true);
    const serializado = JSON.stringify(diretorio.body);
    expect(serializado.includes(agenteIA.token) || serializado.includes(persistida.tokenHash ?? "tokenHash")).toBe(false);
    expect(serializado.includes('"tokenHash"') || serializado.includes('"token"')).toBe(false);
    expect(await banco().session.count({ where: { userId: id } })).toBe(0);
  });

  it("membro, gerente de outro departamento e a própria IA não gerem agentes nem ampliam telas", async () => {
    const ia = agente();
    const input = { name: `${prefixo} IA bloqueada`, departamento: "crm", telas: ["crm.pipelines", "crm.clientes"] };
    const antes = await banco().agentIdentity.count();
    const hashAntes = (await banco().agentIdentity.findUniqueOrThrow({ where: { userId: ia.id } })).tokenHash;
    for (const persona of ["membroA", "outroDepartamento", "gerenteLimitado"] as const) {
      await http(persona, "post", "/equipe/agentes").send(input).expect(403);
    }
    await http("membroA", "post", `/equipe/agentes/${ia.id}/credencial`).send({}).expect(403);
    await http("membroA", "post", `/equipe/agentes/${ia.id}/revogar-credencial`).send({}).expect(403);
    await http("outroDepartamento", "post", `/equipe/agentes/${ia.id}/credencial`).send({}).expect(404);
    await http("outroDepartamento", "post", `/equipe/agentes/${ia.id}/revogar-credencial`).send({}).expect(404);
    await httpAgente("post", "/equipe/agentes").send(input).expect(403);
    await httpAgente("post", `/equipe/agentes/${ia.id}/credencial`).send({}).expect(403);
    await httpAgente("post", `/equipe/agentes/${ia.id}/revogar-credencial`).send({}).expect(403);
    await httpAgente("get", "/equipe").expect(403);
    await httpAgente("get", "/jobs").expect(403);
    expect(await banco().agentIdentity.count()).toBe(antes);
    expect((await banco().agentIdentity.findUniqueOrThrow({ where: { userId: ia.id } })).tokenHash === hashAntes).toBe(true);
  });

  it("Bearer real da IA permite criar, ler e editar cliente e negócio próprios, ocultando B", async () => {
    const ia = agente();
    const email = `ia-${execucao}@sintetico.example.test`;
    const cliente = await httpAgente("post", "/clientes").send({ personType: "pj", name: `${prefixo} cliente IA`, email, ownerId: ia.id }).expect(201);
    ia.clientId = idRecebido(cliente.body.client.id);
    const negocio = await httpAgente("post", "/leads").send({
      pipelineId, stageId: etapaId, ownerId: ia.id, title: `${prefixo} negócio IA`,
      lead: { personType: "pj", name: `${prefixo} perfil IA`, email },
    }).expect(201);
    ia.dealId = idRecebido(negocio.body.id);
    await httpAgente("get", `/clientes/${ia.clientId}`).expect(200);
    await httpAgente("get", `/leads/${ia.dealId}`).expect(200);
    await httpAgente("patch", `/clientes/${ia.clientId}`).send({ notes: "Sintético editado pela própria IA" }).expect(200);
    await httpAgente("patch", `/leads/${ia.dealId}`).send({ version: 1, title: `${prefixo} negócio IA editado` }).expect(200);
    const clientes = await httpAgente("get", `/clientes?q=${encodeURIComponent(prefixo)}`).expect(200);
    expect(clientes.body.items.map((item: { id: string }) => item.id)).toEqual([ia.clientId]);
    const negocios = await httpAgente("get", `/leads?pipelineId=${pipelineId}`).expect(200);
    expect(negocios.body.deals.map((item: { id: string }) => item.id)).toEqual([ia.dealId]);
    const antes = await estado();
    await httpAgente("get", `/clientes/${registros.B.clientId}`).expect(404);
    await httpAgente("get", `/leads/${registros.B.dealId}`).expect(404);
    await httpAgente("get", `/leads/${registros.B.dealId}/historico`).expect(404);
    await httpAgente("patch", `/clientes/${registros.B.clientId}`).send({ name: "Sintético bloqueado" }).expect(404);
    const versaoB = (await banco().deal.findUniqueOrThrow({ where: { id: registros.B.dealId } })).version;
    await httpAgente("patch", `/leads/${registros.B.dealId}`).send({ version: versaoB, title: "Sintético bloqueado" }).expect(404);
    expect(await estado()).toEqual(antes);
    expect((await banco().client.findUniqueOrThrow({ where: { id: ia.clientId } })).ownerId).toBe(ia.id);
    expect((await banco().deal.findUniqueOrThrow({ where: { id: ia.dealId } })).ownerId).toBe(ia.id);
  });

  it("IA permanece membro: não atribui registros a terceiros nem alcança telas não concedidas", async () => {
    const ia = agente();
    const antes = await estado();
    const version = (await banco().deal.findUniqueOrThrow({ where: { id: ia.dealId } })).version;
    const ownerId = pessoas.membroB.id;
    await httpAgente("patch", `/clientes/${ia.clientId}`).send({ ownerId }).expect(403);
    await httpAgente("patch", `/leads/${ia.dealId}`).send({ version, ownerId }).expect(403);
    await httpAgente("post", "/leads/lote").send({ dealIds: [ia.dealId], action: { type: "owner", ownerId } }).expect(403);
    await httpAgente("post", "/clientes").send({ personType: "pj", name: "Sintético bloqueado IA", email: `bloqueado-${execucao}@sintetico.example.test`, ownerId }).expect(403);
    await httpAgente("post", "/leads").send({ pipelineId, stageId: etapaId, ownerId, title: "Sintético bloqueado IA", lead: { personType: "pj", name: "Sintético bloqueado IA", email: `bloqueado-${execucao}@sintetico.example.test` } }).expect(403);
    await httpAgente("get", "/commercial/contracts").expect(403);
    await httpAgente("get", "/jobs").expect(403);
    expect(await estado()).toEqual(antes);
  });

  it("trilha de IA só registra entidades próprias e não aceita autoaprovação ou identidade forjada", async () => {
    const ia = agente();
    const antes = await banco().agentAction.count({ where: { agentUserId: ia.id } });
    const eventosAntes = await banco().eventLog.count({ where: { actorType: "agent", actorId: ia.id, eventName: "agent.action.recorded" } });
    const input = {
      agent: ia.id, channel: "sintetico", action: "crm.observar", entityType: "client", entityId: ia.clientId,
      decision: "allowed", approvalStatus: "not_required", status: "recorded", input: { observacao: "Sintético" }, payload: { observacao: "Sintético" },
      result: "Sintético não deve ser persistido", error: "Sintético não deve ser persistido",
    };
    for (const [entityType, entityId] of [["client", ia.clientId], ["deal", ia.dealId]]) {
      const resposta = await httpAgente("post", "/agent-actions").send({ ...input, entityType, entityId }).expect(201);
      const trilha = await banco().agentAction.findUniqueOrThrow({ where: { id: idRecebido(resposta.body.id) } });
      expect({ agent: trilha.agent, agentUserId: trilha.agentUserId, requestedById: trilha.requestedById, entityType: trilha.entityType, entityId: trilha.entityId }).toEqual({
        agent: ia.id, agentUserId: ia.id, requestedById: null, entityType, entityId,
      });
      expect(trilha.input).toEqual({});
      expect(trilha.payload).toEqual({});
      expect(trilha.result).toBeNull();
      expect(trilha.error).toBeNull();
    }
    await httpAgente("post", "/agent-actions").send({ ...input, entityId: registros.B.clientId }).expect(403);
    await httpAgente("post", "/agent-actions").send({ ...input, entityType: "deal", entityId: registros.B.dealId }).expect(403);
    await httpAgente("post", "/agent-actions").send({ ...input, approvalStatus: "approved" }).expect(403);
    await httpAgente("post", "/agent-actions").send({ ...input, agent: pessoas.membroB.id }).expect(403);
    await http("admin", "post", "/agent-actions").send(input).expect(403);
    expect(await banco().agentAction.count({ where: { agentUserId: ia.id } })).toBe(antes + 2);
    expect(await banco().eventLog.count({ where: { actorType: "agent", actorId: ia.id, eventName: "agent.action.recorded" } })).toBe(eventosAntes + 2);
  });

  it("rotação invalida o Bearer anterior imediatamente e mantém a nova credencial utilizável", async () => {
    const ia = agente();
    const anterior = ia.token;
    await httpAgente("get", `/clientes/${ia.clientId}`, anterior).expect(200);
    const resposta = await http("gerente", "post", `/equipe/agentes/${ia.id}/credencial`).send({}).expect(200);
    expect(resposta.headers["cache-control"]).toBe("no-store");
    ia.token = tokenRecebido(resposta.body.token);
    expect(ia.token === anterior).toBe(false);
    await httpAgente("get", `/clientes/${ia.clientId}`, anterior).expect(401);
    await http("admin", "get", `/clientes/${ia.clientId}`).set("Authorization", `Bearer ${anterior}`).expect(401);
    await httpAgente("get", `/clientes/${ia.clientId}`).expect(200);
    const hash = (await banco().agentIdentity.findUniqueOrThrow({ where: { userId: ia.id } })).tokenHash;
    expect(hash === hashToken(ia.token)).toBe(true);
    expect(hash === hashToken(anterior)).toBe(false);
  });

  it("Bearer inválido com cookie administrativo é recusado sem recorrer à sessão do cookie", async () => {
    const inexistente = `plg_agent_${randomBytes(32).toString("base64url")}`;
    await http("admin", "get", `/clientes/${registros.B.clientId}`).expect(200);
    await http("admin", "get", `/clientes/${registros.B.clientId}`).set("Authorization", `Bearer ${inexistente}`).expect(401);
    await http("admin", "get", `/clientes/${registros.B.clientId}`).set("Authorization", "Bearer invalido").expect(401);
  });

  it("revogação da credencial nega a próxima requisição e não altera a trilha já registrada", async () => {
    const ia = agente();
    const trilhasAntes = await banco().agentAction.count({ where: { agentUserId: ia.id } });
    await httpAgente("get", `/leads/${ia.dealId}`).expect(200);
    await http("gerente", "post", `/equipe/agentes/${ia.id}/revogar-credencial`).send({}).expect(200);
    await httpAgente("get", `/leads/${ia.dealId}`).expect(401);
    await httpAgente("get", `/clientes/${ia.clientId}`).expect(401);
    await http("admin", "get", `/clientes/${ia.clientId}`).set("Authorization", `Bearer ${ia.token}`).expect(401);
    const identidade = await banco().agentIdentity.findUniqueOrThrow({ where: { userId: ia.id } });
    expect(identidade.tokenHash === null && identidade.credentialExpiresAt === null && identidade.revokedAt !== null).toBe(true);
    expect(await banco().agentAction.count({ where: { agentUserId: ia.id } })).toBe(trilhasAntes);
  });

  it("CRM com apenas Contratos lê o escopo devido e cria contrato no cliente próprio ainda sem contrato", async () => {
    const clientId = randomUUID();
    clientesExtras.push(clientId);
    let contratoCriado: string | undefined;
    await banco().client.create({ data: { id: clientId, name: `${prefixo} cliente para contrato mínimo`, email: `contrato-${execucao}@sintetico.example.test`, ownerId: pessoas.membroA.id } });
    try {
      await comAcessosTemporarios({
        membroA: { plataforma: null, departamentos: [{ departamento: "crm", nivel: "membro", telas: ["crm.contratos"] }] },
        gerente: { plataforma: null, departamentos: [{ departamento: "crm", nivel: "gerente", telas: ["crm.contratos"] }] },
      }, async () => {
        const proprio = await http("membroA", "get", `/commercial/contracts/${registros.A.contractId}`).expect(200);
        expect(proprio.body.clientId).toBe(registros.A.clientId);
        expect(typeof proprio.body.clientName).toBe("string");
        await http("membroA", "get", `/commercial/contracts/${registros.B.contractId}`).expect(404);
        const listaMembro = await http("membroA", "get", "/commercial/contracts").expect(200);
        expect(listaMembro.body.items.map((item: { id: string }) => item.id)).toEqual([registros.A.contractId]);
        const listaGerente = await http("gerente", "get", "/commercial/contracts").expect(200);
        expect(listaGerente.body.items.map((item: { id: string }) => item.id)).toEqual(expect.arrayContaining([registros.A.contractId, registros.B.contractId]));
        for (const r of Object.values(registros)) {
          const contrato = await http("gerente", "get", `/commercial/contracts/${r.contractId}`).expect(200);
          expect(contrato.body.clientId).toBe(r.clientId);
          expect(typeof contrato.body.clientName).toBe("string");
        }
        await http("membroA", "get", `/clientes/${clientId}`).expect(403);
        expect(await banco().contract.count({ where: { clientId } })).toBe(0);
        const criado = await http("membroA", "post", "/commercial/contracts").send({ clientId, ownerId: pessoas.membroA.id }).expect(201);
        contratoCriado = idRecebido(criado.body.id);
        expect(criado.body.clientId).toBe(clientId);
        expect(criado.body.ownerId).toBe(pessoas.membroA.id);
        await http("membroA", "get", `/commercial/contracts/${contratoCriado}`).expect(200);
      });
    } finally {
      if (contratoCriado) await banco().contract.deleteMany({ where: { id: contratoCriado } });
      await banco().client.deleteMany({ where: { id: clientId } });
    }
  });

  it("gerente Financeiro com apenas Receber materializa contratos e seus clientes sem acesso à tela Clientes", async () => {
    await comAcessosTemporarios({
      outroDepartamento: { plataforma: null, departamentos: [{ departamento: "financeiro", nivel: "gerente", telas: ["financeiro.receber"] }] },
    }, async () => {
      const lista = await http("outroDepartamento", "get", "/commercial/contracts").expect(200);
      expect(lista.body.items.map((item: { id: string }) => item.id)).toEqual(expect.arrayContaining([registros.A.contractId, registros.B.contractId]));
      for (const r of Object.values(registros)) {
        const resposta = await http("outroDepartamento", "get", `/commercial/contracts/${r.contractId}`).expect(200);
        expect(resposta.body.clientId).toBe(r.clientId);
        expect(typeof resposta.body.clientName).toBe("string");
      }
      await http("outroDepartamento", "get", "/clientes").expect(403);
      await http("outroDepartamento", "get", `/clientes/${registros.B.clientId}`).expect(403);
    });
  });

  it("gerente de apenas Pipelines carrega negócios, membros e responsáveis Admin/Dev sem departamento", async () => {
    const dados = (["admin", "desenvolvedor"] as const).map((persona) => ({ persona, clientId: randomUUID(), dealId: randomUUID() }));
    try {
      for (const { persona, clientId, dealId } of dados) {
        const ownerId = pessoas[persona].id;
        expect(await banco().userDepartamento.count({ where: { userId: ownerId } })).toBe(0);
        clientesExtras.push(clientId);
        const email = `plataforma-${persona}-${execucao}@sintetico.example.test`;
        await banco().client.create({ data: { id: clientId, ownerId, name: `${prefixo} plataforma ${persona}`, email } });
        await banco().deal.create({ data: {
          id: dealId, ownerId, pipelineId, stageId: etapaId, clientId, title: `${prefixo} plataforma ${persona}`,
          profile: { create: { personType: "pj", name: `${prefixo} plataforma ${persona}`, email } },
        } });
        await banco().pipelineMember.create({ data: { pipelineId, userId: ownerId, role: "vendedor" } });
      }
      await comAcessosTemporarios({
        gerente: { plataforma: null, departamentos: [{ departamento: "crm", nivel: "gerente", telas: ["crm.pipelines"] }] },
      }, async () => {
        const lista = await http("gerente", "get", `/leads?pipelineId=${pipelineId}`).expect(200);
        for (const { persona, clientId, dealId } of dados) {
          expect(lista.body.deals.some((item: { id: string; owner: { id: string } }) => item.id === dealId && item.owner.id === pessoas[persona].id)).toBe(true);
          const detalhe = await http("gerente", "get", `/leads/${dealId}`).expect(200);
          expect(detalhe.body.owner.id).toBe(pessoas[persona].id);
          expect(detalhe.body.client.id).toBe(clientId);
        }
        const funis = await http("gerente", "get", "/pipelines").expect(200);
        const funil = funis.body.pipelines.find((item: { id: string }) => item.id === pipelineId);
        expect(funil.members.map((item: { userId: string }) => item.userId)).toEqual(expect.arrayContaining([pessoas.admin.id, pessoas.desenvolvedor.id]));
        expect(funis.body.responsaveis.map((item: { id: string }) => item.id)).toEqual(expect.arrayContaining([pessoas.admin.id, pessoas.desenvolvedor.id]));
        const candidatos = await http("gerente", "get", "/pipelines/pessoas?companyId=plugga").expect(200);
        expect(candidatos.body.people.map((item: { id: string }) => item.id)).toEqual(expect.arrayContaining([pessoas.admin.id, pessoas.desenvolvedor.id]));
        const responsaveis = await http("gerente", "get", "/clientes/responsaveis").expect(200);
        expect(responsaveis.body.items.map((item: { id: string }) => item.id)).toEqual(expect.arrayContaining([pessoas.admin.id, pessoas.desenvolvedor.id]));
        const clientes = await http("gerente", "get", `/clientes/selecao-negocio?q=${encodeURIComponent(`${prefixo} plataforma`)}`).expect(200);
        expect(clientes.body.items.map((item: { id: string }) => item.id).sort()).toEqual(dados.map((item) => item.clientId).sort());
      });
    } finally {
      await banco().deal.deleteMany({ where: { id: { in: dados.map((item) => item.dealId) } } });
      await banco().pipelineMember.deleteMany({ where: { pipelineId, userId: { in: dados.map((item) => pessoas[item.persona].id) } } });
      await banco().client.deleteMany({ where: { id: { in: dados.map((item) => item.clientId) } } });
    }
  });

  it("seletor de apenas Pipelines oferece cliente B e compartilhado ao gerente e somente A ao membro", async () => {
    const compartilhadoId = randomUUID();
    clientesExtras.push(compartilhadoId);
    await banco().client.create({ data: { id: compartilhadoId, name: `${prefixo} cliente compartilhado`, ownerId: null } });
    try {
      await comAcessosTemporarios({
        gerente: { plataforma: null, departamentos: [{ departamento: "crm", nivel: "gerente", telas: ["crm.pipelines"] }] },
        membroA: { plataforma: null, departamentos: [{ departamento: "crm", nivel: "membro", telas: ["crm.pipelines"] }] },
      }, async () => {
        const path = `/clientes/selecao-negocio?q=${encodeURIComponent(prefixo)}`;
        const gerencia = await http("gerente", "get", path).expect(200);
        expect(gerencia.body.items.map((item: { id: string }) => item.id)).toEqual(expect.arrayContaining([registros.A.clientId, registros.B.clientId, compartilhadoId]));
        const membro = await http("membroA", "get", path).expect(200);
        expect(membro.body.items.map((item: { id: string }) => item.id)).toEqual([registros.A.clientId]);
        await http("gerente", "get", "/clientes").expect(403);
        await http("membroA", "get", "/clientes").expect(403);
      });
    } finally {
      await banco().client.deleteMany({ where: { id: compartilhadoId } });
    }
  });

  it("criações HTTP concorrentes do mesmo membro recebem posições distintas com login runtime restrito", async () => {
    const quantidade = 8;
    try {
      await comAcessosTemporarios({
        membroA: { plataforma: null, departamentos: [{ departamento: "crm", nivel: "membro", telas: ["crm.pipelines"] }] },
      }, async () => {
        const resultados = await Promise.allSettled(Array.from({ length: quantidade }, (_, indice) =>
          http("membroA", "post", "/leads").send({
            pipelineId: pipelineDestinoId, stageId: etapaDestinoId, ownerId: pessoas.membroA.id,
            title: `${prefixo} concorrente ${indice}`,
            lead: { personType: "pj", name: `${prefixo} concorrente ${indice}`, email: `concorrente-${indice}-${execucao}@sintetico.example.test` },
          }).expect(201),
        ));
        expect(resultados.map((resultado) => resultado.status)).toEqual(Array(quantidade).fill("fulfilled"));
        const ids = resultados.flatMap((resultado) => resultado.status === "fulfilled" ? [idRecebido(resultado.value.body.id)] : []);
        expect(new Set(ids).size).toBe(quantidade);
        const linhas = await banco().deal.findMany({ where: { id: { in: ids } }, orderBy: { position: "asc" } });
        expect(linhas).toHaveLength(quantidade);
        expect(new Set(linhas.map((linha) => linha.position.toString())).size).toBe(quantidade);
        expect(linhas.every((linha) => linha.ownerId === pessoas.membroA.id && linha.stageId === etapaDestinoId && linha.pipelineId === pipelineDestinoId)).toBe(true);
        const quadro = await http("membroA", "get", `/leads?pipelineId=${pipelineDestinoId}`).expect(200);
        expect(quadro.body.deals.map((item: { id: string }) => item.id)).toEqual(linhas.map((linha) => linha.id));
      });
    } finally {
      await banco().deal.deleteMany({ where: { pipelineId: pipelineDestinoId, stageId: etapaDestinoId, ownerId: pessoas.membroA.id } });
    }
  });

  it("gerente preserva o responsável histórico que saiu do CRM, foi desativado ou removido, sem torná-lo elegível novamente", async () => {
    const ownerId = randomUUID();
    const clientId = randomUUID();
    const dealId = randomUUID();
    const name = `${prefixo} responsável histórico`;
    const email = `historico-${execucao}@sintetico.example.test`;
    userIds.push(ownerId);
    clientesExtras.push(clientId);
    try {
      await banco().user.create({ data: {
        id: ownerId, name, email, status: "active",
        departamentos: { create: { departamento: "crm", nivel: "membro", telas: ["crm.pipelines", "crm.clientes"] } },
      } });
      await banco().client.create({ data: { id: clientId, name: `${prefixo} cliente histórico`, email, ownerId } });
      await banco().deal.create({ data: {
        id: dealId, ownerId, pipelineId, stageId: etapaId, clientId, title: `${prefixo} negócio histórico`,
        profile: { create: { personType: "pj", name: `${prefixo} perfil histórico`, email } },
        history: { create: { kind: "created", actorId: ownerId, toStageName: "Sintético início" } },
      } });
      await banco().userDepartamento.deleteMany({ where: { userId: ownerId } });
      await banco().userDepartamento.create({ data: { userId: ownerId, departamento: "financeiro", nivel: "membro", telas: ["financeiro.receber"] } });
      expect(await banco().userPlatformRole.count({ where: { userId: ownerId } })).toBe(0);
      await comAcessosTemporarios({
        gerente: { plataforma: null, departamentos: [{ departamento: "crm", nivel: "gerente", telas: ["crm.pipelines"] }] },
      }, async () => {
        for (const status of ["active", "disabled", "removed"]) {
          await banco().user.update({ where: { id: ownerId }, data: { status } });
          const lista = await http("gerente", "get", `/leads?pipelineId=${pipelineId}`).expect(200);
          const item = lista.body.deals.find((negocio: { id: string }) => negocio.id === dealId);
          expect(item?.owner).toEqual({ id: ownerId, name });
          const detalhe = await http("gerente", "get", `/leads/${dealId}`).expect(200);
          expect(detalhe.body.owner).toEqual({ id: ownerId, name });
          expect(detalhe.body.client.id).toBe(clientId);
          const historico = await http("gerente", "get", `/leads/${dealId}/historico`).expect(200);
          expect(historico.body.entries.some((entrada: { actor: { id: string; name: string } | null }) => entrada.actor?.id === ownerId && entrada.actor.name === name)).toBe(true);
          const candidatos = await http("gerente", "get", "/pipelines/pessoas?companyId=plugga").expect(200);
          expect(candidatos.body.people.some((pessoa: { id: string }) => pessoa.id === ownerId)).toBe(false);
          const responsaveis = await http("gerente", "get", "/clientes/responsaveis").expect(200);
          expect(responsaveis.body.items.some((pessoa: { id: string }) => pessoa.id === ownerId)).toBe(false);
          if (status === "active") {
            const antes = await banco().deal.findUniqueOrThrow({ where: { id: registros.A.dealId } });
            await http("gerente", "patch", `/leads/${registros.A.dealId}`).send({ version: antes.version, ownerId }).expect(400);
            expect(await banco().deal.findUniqueOrThrow({ where: { id: registros.A.dealId } })).toEqual(antes);
          }
        }
      });
    } finally {
      await banco().deal.deleteMany({ where: { id: dealId } });
      await banco().client.deleteMany({ where: { id: clientId } });
      await banco().user.deleteMany({ where: { id: ownerId } });
    }
  });

  it("metadados e recusas por acesso não fazem I/O no armazenamento", () => {
    expect(chamadasStorage.enviar).not.toHaveBeenCalled();
    expect(chamadasStorage.ler).not.toHaveBeenCalled();
    expect(chamadasStorage.excluir).not.toHaveBeenCalled();
  });
});
