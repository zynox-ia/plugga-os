import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { AppModule } from "../src/app.module";
import { NegociosRepository } from "../src/negocios/negocios.repository";

describe("detalhe do lead (HTTP)", () => {
  let app: INestApplication;
  const id = "00000000-0000-4000-8000-000000001001";
  const repository = {
    get: vi.fn(async () => ({ id, version: 1 })),
    history: vi.fn(async () => ({ entries: [], nextCursor: null })),
    update: vi.fn(async (_id, input) => ({ id, version: 2, ...input })),
  };
  const comercial = (r: request.Test) => r.set("x-dev-principal", "local-comercial").set("x-dev-departamentos", "crm:membro");
  const semAcesso = (r: request.Test) => r.set("x-dev-principal", "local-financeiro").set("x-dev-departamentos", "financeiro:membro");

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(NegociosRepository).useValue(repository).compile();
    app = modulo.createNestApplication();
    await app.init();
  });
  afterAll(async () => { await app.close(); });

  it("lê por id e pagina o histórico, exigindo sessão", async () => {
    await request(app.getHttpServer()).get(`/leads/${id}`).expect(401);
    await comercial(request(app.getHttpServer()).get(`/leads/${id}`)).expect(200, { id, version: 1 });
    await comercial(request(app.getHttpServer()).get(`/leads/${id}/historico?limit=2`)).expect(200, { entries: [], nextCursor: null });
    await comercial(request(app.getHttpServer()).get(`/leads/${id}/historico?limit=101`)).expect(400);
    await comercial(request(app.getHttpServer()).get(`/leads/${id}/historico?cursor=invalido`)).expect(400);
  });

  it("aceita os campos comerciais e recusa valores que não cabem no banco", async () => {
    const input = { title: "Novo título", value: "120.00", expectedCloseDate: "2028-02-29", ownerId: id, tagIds: [], version: 1 };
    await comercial(request(app.getHttpServer()).patch(`/leads/${id}`)).send(input).expect(200);
    for (const body of [{ value: "-1", version: 1 }, { value: "1000000000000.00", version: 1 }, { expectedCloseDate: "2027-02-29", version: 1 }, { version: 0 }, { title: " ", version: 1 }, { title: "Comercial sem versão" }, { stageId: id }]) {
      await comercial(request(app.getHttpServer()).patch(`/leads/${id}`)).send(body).expect(400);
    }
  });

  it("oculta o negócio de quem não alcança a tela, sem delegar leitura ou escrita", async () => {
    const antes = [repository.get.mock.calls.length, repository.history.mock.calls.length, repository.update.mock.calls.length];
    await semAcesso(request(app.getHttpServer()).get(`/leads/${id}`)).expect(404);
    await semAcesso(request(app.getHttpServer()).get(`/leads/${id}/historico`)).expect(404);
    await semAcesso(request(app.getHttpServer()).patch(`/leads/${id}`)).send({ title: "Não deve salvar", version: 1 }).expect(404);
    expect([repository.get.mock.calls.length, repository.history.mock.calls.length, repository.update.mock.calls.length]).toEqual(antes);
  });
});
