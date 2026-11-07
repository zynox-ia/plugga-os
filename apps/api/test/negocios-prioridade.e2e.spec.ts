import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AppModule } from "../src/app.module";
import { AuthContext, type AuthPrincipal } from "../src/core/auth/auth.types";
import { NegociosRepository } from "../src/negocios/negocios.repository";
import { PrismaAuthService } from "../src/prisma/prisma-auth.service";
import { PrismaJobsService } from "../src/prisma/prisma-jobs.service";
import { PrismaService } from "../src/prisma/prisma.service";

describe("prioridade do negócio (e2e)", () => {
  let app: INestApplication;
  const setPriority = vi.fn(async (_id, input) => input);
  const moveStage = vi.fn(async (_id, input) => input);
  const repository = {
    setPriority, moveStage,
    list: vi.fn(async () => ({ deals: [] })),
    clientOptions: vi.fn(async () => ({ contacts: [] })),
    create: vi.fn(async () => ({ ok: true })),
    update: vi.fn(async () => ({ ok: true })),
    convert: vi.fn(async () => ({ ok: true })),
    bulk: vi.fn(async () => ({ deals: [] })),
    win: vi.fn(async () => ({ ok: true })),
    lose: vi.fn(async () => ({ ok: true })),
    transfer: vi.fn(async () => ({ ok: true })),
  };
  const id = "00000000-0000-4000-8000-000000000001";
  const comercial = (r: request.Test) => r.set("x-dev-principal", "local-comercial").set("x-dev-departamentos", "crm:membro");

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService).useValue({})
      .overrideProvider(PrismaAuthService).useValue({})
      .overrideProvider(PrismaJobsService).useValue({})
      .overrideProvider(NegociosRepository).useValue(repository).compile();
    app = modulo.createNestApplication();
    await app.init();
  });
  afterAll(async () => { await app.close(); });

  it("exige sessão e valida os valores antes de delegar", async () => {
    await request(app.getHttpServer()).patch(`/leads/${id}/prioridade`).send({ priority: "normal" }).expect(401);
    await comercial(request(app.getHttpServer()).patch(`/leads/${id}/prioridade`)).send({ priority: "alta" }).expect(400);
    await comercial(request(app.getHttpServer()).patch(`/leads/${id}/prioridade`)).send({ priority: null }).expect(200, { priority: null });
    expect(setPriority).toHaveBeenCalledOnce();
  });

  it("aceita uma referência de ordenação ou o fim explícito", async () => {
    await comercial(request(app.getHttpServer()).post(`/leads/${id}/etapa`)).send({ stageId: id, beforeDealId: null }).expect(200, { stageId: id, beforeDealId: null });
    await comercial(request(app.getHttpServer()).post(`/leads/${id}/etapa`)).send({ stageId: id, beforeDealId: "invalido" }).expect(400);
    expect(moveStage).toHaveBeenCalledOnce();
  });

  it("expõe todas as operações sob leads e remove a rota antiga", async () => {
    await comercial(request(app.getHttpServer()).get(`/leads?pipelineId=${id}`)).expect(200);
    await comercial(request(app.getHttpServer()).get(`/leads/clientes/${id}/opcoes`)).expect(200);
    await comercial(request(app.getHttpServer()).post("/leads")).send({
      pipelineId: id, stageId: id, clientId: id, ownerId: id, title: "Lead",
      lead: { personType: "pf", name: "Lead de teste", phone: "92999990000" },
    }).expect(201);
    await comercial(request(app.getHttpServer()).post("/leads/lote")).send({ dealIds: [id], action: { type: "stage", stageId: id } }).expect(200);
    await comercial(request(app.getHttpServer()).patch(`/leads/${id}`)).send({ lead: { notes: "atualizado" } }).expect(200);
    await comercial(request(app.getHttpServer()).post(`/leads/${id}/converter`)).send({}).expect(200);
    await comercial(request(app.getHttpServer()).post(`/leads/${id}/etapa`)).send({ stageId: id }).expect(200);
    await comercial(request(app.getHttpServer()).post(`/leads/${id}/ganho`)).send({}).expect(200);
    await comercial(request(app.getHttpServer()).post(`/leads/${id}/perda`)).send({ lossReasonId: id }).expect(200);
    await comercial(request(app.getHttpServer()).post(`/leads/${id}/transferencia`)).send({ pipelineId: id, stageId: id }).expect(200);
    await comercial(request(app.getHttpServer()).patch(`/leads/${id}/prioridade`)).send({ priority: "normal" }).expect(200);
    await comercial(request(app.getHttpServer()).get("/negocios")).expect(404);
  });

  it("Pipelines permite operar leads sem liberar Clientes, e Clientes nao libera Pipelines", async () => {
    const principal: AuthPrincipal = {
      id, kind: "user", acesso: { plataforma: null, departamentos: [{ departamento: "crm", nivel: "membro", telas: ["crm.pipelines"] }] },
    };
    const resolver = vi.spyOn(app.get<AuthContext>(AuthContext), "resolve").mockResolvedValue(principal);
    try {
      await request(app.getHttpServer()).get(`/leads?pipelineId=${id}`).expect(200);
      await request(app.getHttpServer()).patch(`/leads/${id}/prioridade`).send({ priority: "normal" }).expect(200);
      await request(app.getHttpServer()).post(`/leads/${id}/converter`).send({}).expect(200);
      const clientesAntes = repository.clientOptions.mock.calls.length;
      await request(app.getHttpServer()).get(`/leads/clientes/${id}/opcoes`).expect(403);
      expect(repository.clientOptions.mock.calls.length).toBe(clientesAntes);
      resolver.mockResolvedValue({ ...principal, acesso: { plataforma: null, departamentos: [{ departamento: "crm", nivel: "membro", telas: ["crm.clientes"] }] } });
      const antes = [repository.list.mock.calls.length, setPriority.mock.calls.length, repository.convert.mock.calls.length];
      await request(app.getHttpServer()).get(`/leads?pipelineId=${id}`).expect(403);
      await request(app.getHttpServer()).patch(`/leads/${id}/prioridade`).send({ priority: "normal" }).expect(403);
      await request(app.getHttpServer()).post(`/leads/${id}/converter`).send({}).expect(403);
      expect([repository.list.mock.calls.length, setPriority.mock.calls.length, repository.convert.mock.calls.length]).toEqual(antes);
    } finally {
      resolver.mockRestore();
    }
  });
});
