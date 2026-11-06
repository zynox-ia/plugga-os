import { randomUUID } from "node:crypto";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module";
import { AuthContext, type AuthenticatedRequest, type AuthPrincipal } from "../src/core/auth/auth.types";
import { PrismaService } from "../src/prisma/prisma.service";

describe.skipIf(process.env.RUN_NEGOCIOS_INTEGRATION_TESTS !== "true")("novo lead: HTTP até Postgres isolado", () => {
  const prisma = new PrismaService();
  const marca = `novo-lead-${randomUUID().slice(0, 8)}`;
  const pessoas = new Map<string, AuthPrincipal>();
  const pipelines: Array<{ id: string; stages: Array<{ id: string }> }> = [];
  let app: INestApplication;
  let responsavelId: string;
  let semTelaId: string;

  beforeAll(async () => {
    await prisma.$connect();
    for (const nome of ["crm", "sem-tela", "desenvolvedor"] as const) {
      const papel = nome === "desenvolvedor"
        ? await prisma.role.upsert({ where: { key: nome }, update: {}, create: { key: nome, name: "Desenvolvedor" } })
        : null;
      const pessoa = await prisma.user.create({ data: {
        email: `${marca}-${nome}@teste.local`, name: `${marca} ${nome}`, status: "active",
        ...(papel ? { platformRoles: { create: { roleId: papel.id } } } : { departamentos: { create: {
          departamento: "crm", nivel: "membro", telas: nome === "crm" ? ["crm.pipelines"] : [],
        } } }),
      } });
      pessoas.set(nome, { id: pessoa.id, kind: "user", acesso: papel
        ? { plataforma: "desenvolvedor", departamentos: [] }
        : { plataforma: null, departamentos: [{ departamento: "crm", nivel: "membro", telas: nome === "crm" ? ["crm.pipelines"] : [] }] },
      });
    }
    responsavelId = pessoas.get("crm")!.id;
    semTelaId = pessoas.get("sem-tela")!.id;
    for (const companyId of ["waze", "plugga"]) {
      await prisma.company.upsert({ where: { id: companyId }, update: {}, create: { id: companyId, name: companyId } });
      pipelines.push(await prisma.pipeline.create({ data: {
        companyId, name: `${marca} ${companyId}`, valueLabel: "Valor", color: "#0077FF", wonLabel: "Ganho", lostLabel: "Perdido",
        stages: { create: [0, 1].map((position) => ({ name: `Etapa ${position}`, position, color: "#0077FF" })) },
      }, include: { stages: { orderBy: { position: "asc" } } } }));
    }
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService).useValue(prisma)
      .overrideProvider(AuthContext).useValue({ resolve: async (r: AuthenticatedRequest) => pessoas.get(String(r.headers["x-test-user"])) ?? null })
      .compile();
    app = modulo.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
    // Remove somente fixtures deste arquivo; o event_log append-only fica.
    await prisma.deal.deleteMany({ where: { pipelineId: { in: pipelines.map((p) => p.id) } } });
    await prisma.pipeline.deleteMany({ where: { id: { in: pipelines.map((p) => p.id) } } });
    await prisma.user.deleteMany({ where: { id: { in: [...pessoas.values()].map((p) => p.id) } } });
    await prisma.$disconnect();
  });

  const payload = (personType: "pf" | "pj" = "pf") => ({
    pipelineId: pipelines[0]!.id, stageId: pipelines[0]!.stages[0]!.id,
    title: `${marca} ${personType}`, ownerId: responsavelId,
    value: null, expectedCloseDate: null, tagIds: [],
    lead: { personType, name: `${marca} ${personType}`, phone: "(92) 99999-0000", email: "  LEAD@TESTE.LOCAL ",
      document: personType === "pf" ? "999.999.001-00" : "99.999.001/0001-59",
      legalName: null, postalCode: null, street: null, addressComplement: null,
      district: null, city: null, state: null, origin: null, notes: null },
  });
  const postar = (body: object, pessoa = "crm", path = "/leads") => request(app.getHttpServer()).post(path).set("x-test-user", pessoa).send(body);

  it.each(["pf", "pj"] as const)("cadastro %s devolve 201 somente com valores relidos e persistidos, sem criar cliente", async (tipo) => {
    const body = payload(tipo);
    // PJ também prova escolha do outro pipeline e da segunda etapa, com apenas e-mail.
    if (tipo === "pj") {
      body.pipelineId = pipelines[1]!.id;
      body.stageId = pipelines[1]!.stages[1]!.id;
      body.lead.phone = "";
    }
    const { body: resposta } = await postar(body, tipo === "pj" ? "desenvolvedor" : "crm").expect(201);
    const gravado = await prisma.deal.findUniqueOrThrow({ where: { id: resposta.id }, include: { profile: true } });
    expect(gravado).toMatchObject({ pipelineId: body.pipelineId, stageId: body.stageId, ownerId: responsavelId,
      title: body.title, clientId: null, contactId: null, leadContactId: null, value: null, expectedCloseDate: null });
    expect(gravado.profile).toMatchObject({ personType: tipo, name: body.lead.name, legalName: null,
      phone: tipo === "pj" ? null : "92999990000", email: "lead@teste.local", document: tipo === "pf" ? "99999900100" : "99999001000159" });
    expect(resposta).toMatchObject({ id: gravado.id, pipelineId: gravado.pipelineId, stageId: gravado.stageId,
      owner: { id: gravado.ownerId }, client: null, lead: { personType: tipo, name: gravado.profile!.name,
        phone: gravado.profile!.phone, email: gravado.profile!.email, document: gravado.profile!.document } });
    expect(await prisma.client.count({ where: { name: { startsWith: marca } } })).toBe(0);
  });

  it("telefone sozinho e documento ausente são opcionais conforme contrato", async () => {
    const body = payload();
    const { body: resposta } = await postar({ ...body, lead: { ...body.lead, email: null, document: null } }).expect(201);
    const gravado = await prisma.leadProfile.findUniqueOrThrow({ where: { dealId: resposta.id } });
    expect(gravado).toMatchObject({ phone: "92999990000", email: null, document: null });
  });

  it("falhas por campo não persistem lead parcial: etapa, responsável, PF/PJ, telefone, e-mail e documento", async () => {
    const base = payload();
    const antes = await prisma.deal.count({ where: { pipelineId: { in: pipelines.map((p) => p.id) } } });
    const casos = [
      { body: { ...base, stageId: pipelines[1]!.stages[0]!.id }, campo: "stageId" },
      { body: { ...base, ownerId: semTelaId }, campo: "ownerId" },
      { body: { ...base, lead: { ...base.lead, personType: "outro" } }, campo: "lead.personType" },
      { body: { ...base, lead: { ...base.lead, name: "" } }, campo: "lead.name" },
      { body: { ...base, lead: { ...base.lead, phone: "123" } }, campo: "lead.phone" },
      { body: { ...base, lead: { ...base.lead, email: "inválido" } }, campo: "lead.email" },
      { body: { ...base, lead: { ...base.lead, document: "11111111111" } }, campo: "lead.document" },
      { body: { ...base, lead: { ...base.lead, phone: null, email: null } }, campo: "lead.phone" },
    ];
    for (const caso of casos) {
      const resposta = await postar(caso.body, caso.campo === "ownerId" ? "desenvolvedor" : "crm").expect(400);
      expect(resposta.body.detalhes).toContainEqual(expect.objectContaining({ campo: caso.campo }));
    }
    expect(await prisma.deal.count({ where: { pipelineId: { in: pipelines.map((p) => p.id) } } })).toBe(antes);
  });

  it("nega sem sessão ou tela e não publica o POST legado /negocios", async () => {
    const antes = await prisma.deal.count({ where: { pipelineId: pipelines[0]!.id } });
    await request(app.getHttpServer()).post("/leads").send(payload()).expect(401);
    await postar(payload(), "sem-tela").expect(403);
    await postar(payload(), "crm", "/negocios").expect(404);
    expect(await prisma.deal.count({ where: { pipelineId: pipelines[0]!.id } })).toBe(antes);
  });
});
