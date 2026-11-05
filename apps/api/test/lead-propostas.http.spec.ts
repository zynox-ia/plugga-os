import { Readable } from "node:stream";

import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { ThrottlerModule } from "@nestjs/throttler";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { EstadoInvalido, NaoEncontrado } from "../src/common/errors/dominio";
import { FiltroGlobalDeExcecoes } from "../src/common/errors/filtro-global";
import { AuthContext, type AuthenticatedRequest } from "../src/core/auth/auth.types";
import { LeadPropostasController } from "../src/lead-propostas/lead-propostas.controller";
import { LeadPropostasService } from "../src/lead-propostas/lead-propostas.service";

const DEAL = "bead0000-0000-4000-8000-000000000004";
const ID = "bead0000-0000-4000-8000-000000000003";
const URL = `/leads/${DEAL}/propostas`;
const content = { title: "Proposta", recipient: "João", company: "", email: "", phone: "", city: "", owner: "", jobTitle: "", amount: "", validUntil: "2026-11-20", introduction: "", scope: "", payment: "", notes: "" };
const service = {
  list: vi.fn().mockResolvedValue({ proposals: [] }), templates: vi.fn().mockResolvedValue({ templates: [] }), create: vi.fn().mockResolvedValue({ proposal: { id: ID } }),
  update: vi.fn().mockResolvedValue({ proposal: { id: ID } }), generate: vi.fn().mockResolvedValue({ proposal: { id: ID } }),
  file: vi.fn().mockImplementation(async () => ({ name: "Proposta João.pdf", stream: Readable.from(["%PDF-test"]), encerrar: vi.fn() })),
};

describe("HTTP propostas isolado (sem banco/storage)", () => {
  let app: INestApplication;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }])],
      controllers: [LeadPropostasController],
      providers: [
        { provide: LeadPropostasService, useValue: service },
        { provide: ConfigService, useValue: new ConfigService({ AUTH_ALLOWED_ORIGINS: "http://localhost:3000" }) },
        { provide: AuthContext, useValue: { resolve: async (req: AuthenticatedRequest) => req.headers.authorization ? {
          id: "user", kind: "user", acesso: { plataforma: req.headers.authorization === "admin" ? "admin" : null, departamentos: [] },
        } : null } },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalFilters(new FiltroGlobalDeExcecoes());
    await app.init();
  });
  afterAll(async () => { await app.close(); });

  it("exige sessão e permissão da tela pipelines", async () => {
    await request(app.getHttpServer()).get(URL).expect(401);
    await request(app.getHttpServer()).get(URL).set("Authorization", "sem-acesso").expect(403);
    await request(app.getHttpServer()).get(URL).set("Authorization", "admin").expect(200, { proposals: [] });
    await request(app.getHttpServer()).get(`${URL}/modelos`).set("Authorization", "admin").expect(200, { templates: [] });
  });
  it("valida UUID, revisão, conteúdo e Origin antes da mutação", async () => {
    await request(app.getHttpServer()).post(URL).set("Authorization", "admin").set("Origin", "https://fora.example.test").send({}).expect(403);
    await request(app.getHttpServer()).get("/leads/invalido/propostas").set("Authorization", "admin").expect(400);
    await request(app.getHttpServer()).post(URL).set("Authorization", "admin").send({ templateId: ID, content: { ...content, validUntil: "2026-02-30" } }).expect(400);
    await request(app.getHttpServer()).post(`${URL}/${ID}/gerar`).set("Authorization", "admin").send({}).expect(400);
    await request(app.getHttpServer()).patch(`${URL}/${ID}`).set("Authorization", "admin").send({ templateId: ID, revision: 0, content }).expect(400);
    await request(app.getHttpServer()).post(URL).set("Authorization", "admin").set("Origin", "http://localhost:3000").send({ templateId: ID, content }).expect(201);
  });
  it("converte revisão concorrente em 409 e id alheio em 404", async () => {
    service.generate.mockRejectedValueOnce(new EstadoInvalido("Atualize a proposta."));
    const conflict = await request(app.getHttpServer()).post(`${URL}/${ID}/gerar`).set("Authorization", "admin").send({ revision: 1 }).expect(409);
    expect(conflict.body.codigo).toBe("CONFLITO_ESTADO");
    service.update.mockRejectedValueOnce(new NaoEncontrado("Proposta não encontrada."));
    await request(app.getHttpServer()).patch(`${URL}/${ID}`).set("Authorization", "admin").send({ templateId: ID, revision: 1, content }).expect(404);
  });
  it("serve PDF com disposição, cache privado e cabeçalhos seguros", async () => {
    const preview = await request(app.getHttpServer()).get(`${URL}/${ID}/preview`).set("Authorization", "admin").expect(200);
    expect(preview.headers["content-type"]).toContain("application/pdf");
    expect(preview.headers["content-disposition"]).toContain("inline;");
    expect(preview.headers["cache-control"]).toBe("no-store");
    expect(preview.headers["content-security-policy"]).toBe("sandbox");
    expect(preview.headers["x-content-type-options"]).toBe("nosniff");
    const download = await request(app.getHttpServer()).get(`${URL}/${ID}/download`).set("Authorization", "admin").expect(200);
    expect(download.headers["content-disposition"]).toContain("attachment;");
  });
});
