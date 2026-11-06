import { randomBytes, randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import type { Acesso, LeadProposalContent, Tela } from "@plugga/shared";
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
import { ArmazenamentoDeDocumentos } from "../src/lead-documentos/armazenamento-de-documentos";
import { PrismaService } from "../src/prisma/prisma.service";
import { assertSafeTestDatabaseUrl } from "./safe-test-environment";

const HABILITADO = process.env.RUN_PERMISSOES_INTEGRATION_TESTS === "true";
const PRAZO_MS = 120_000;
const ORIGIN = "http://localhost:3000";
const TELAS_CRM: Tela[] = ["crm.pipelines", "crm.clientes", "crm.contratos", "crm.propostas"];
type Persona = "membroA" | "membroB" | "gerente" | "admin" | "desenvolvedor" | "semTela" | "outroDepartamento";

/** HTTP, cookie assinado, credenciais Argon2 e repositórios reais; somente dados sintéticos. */
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
    admin: { plataforma: "admin", departamentos: [] },
    desenvolvedor: { plataforma: "desenvolvedor", departamentos: [] },
    semTela: { plataforma: null, departamentos: [{ departamento: "crm", nivel: "membro", telas: [] }] },
    outroDepartamento: { plataforma: null, departamentos: [{ departamento: "marketing", nivel: "membro", telas: [] }] },
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
  const chamadasStorage = {
    enviar: vi.fn(), ler: vi.fn(), excluir: vi.fn(),
  };
  let app: NestExpressApplication | undefined;
  let prisma: PrismaService | undefined;

  function banco(): PrismaService {
    if (!prisma) throw new Error("Banco sintético não foi inicializado.");
    return prisma;
  }

  function http(persona: Persona, method: "get" | "post" | "patch" | "delete", path: string): request.Test {
    const cookie = cookies.get(persona);
    if (!app || !cookie) throw new Error("Sessão real não foi inicializada.");
    return request(app.getHttpServer())[method](path).set("Cookie", cookie).set("Origin", ORIGIN);
  }

  function definirAmbiente(nome: string, valor: string): void {
    ambienteOriginal.set(nome, process.env[nome]);
    process.env[nome] = valor;
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
    assertSafeTestDatabaseUrl(process.env.DATABASE_URL ?? "");
    if (process.env.PLUGGA_TEST_IGNORE_ENV_FILE !== "true") throw new Error("Execute com o runner hermético, sem carregar .env.");
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
    const db = app.get<PrismaService>(PrismaService);
    prisma = db;
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
        await prisma.client.deleteMany({ where: { ownerId: { in: userIds } } });
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
        await prisma.role.deleteMany({ where: { id: { in: papeisCriados } } });
        // event_log é append-only: os eventos sintéticos ficam no banco descartável.
      }
    } finally {
      cookies.clear();
      await app?.close();
      for (const [nome, valor] of ambienteOriginal) {
        if (valor === undefined) delete process.env[nome];
        else process.env[nome] = valor;
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

  it("membro sem tela ou de outro departamento não alcança os recursos de CRM", async () => {
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

  it("metadados e recusas por acesso não fazem I/O no armazenamento", () => {
    expect(chamadasStorage.enviar).not.toHaveBeenCalled();
    expect(chamadasStorage.ler).not.toHaveBeenCalled();
    expect(chamadasStorage.excluir).not.toHaveBeenCalled();
  });
});
