import { ConfigModule } from "@nestjs/config";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { configureApp } from "../src/configure-app";
import { HealthController } from "../src/health/health.controller";
import { HealthService } from "../src/health/health.service";
import type { HealthRepository } from "../src/health/health.repository";

type Falhas = { banco?: boolean; redis?: boolean; armazenamento?: boolean };

class HealthServiceFalso extends HealthService {
  falhas: Falhas = {};
  constructor() {
    super({} as HealthRepository, { get: () => undefined } as never);
  }
  protected override async sondarBanco() {
    if (this.falhas.banco) throw new Error("postgres://usuario:senha@host:5432");
  }
  protected override async sondarRedis() {
    if (this.falhas.redis) throw new Error("redis://:senha@host:6379");
  }
  protected override async sondarArmazenamento() {
    if (this.falhas.armazenamento) throw new Error("http://chave:segredo@s3:8333");
  }
}

describe("GET /health/ready (SC-019)", () => {
  let app: NestExpressApplication;
  const servico = new HealthServiceFalso();

  beforeAll(async () => {
    process.env.AUTH_SESSION_SECRET = "test_only_session_secret_change_me_please";
    const modulo = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true })],
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: servico }],
    }).compile();
    app = modulo.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
  });
  afterAll(async () => app.close());

  it("liveness continua simples", async () => {
    servico.falhas = { banco: true };
    const r = await request(app.getHttpServer()).get("/health");
    expect(r.status).toBe(200);
    expect(r.body.status).toBe("ok");
  });

  it("responde 200 com tudo disponível", async () => {
    servico.falhas = {};
    const r = await request(app.getHttpServer()).get("/health/ready");
    expect(r.status).toBe(200);
    expect(r.body.status).toBe("ready");
  });

  it.each(["banco", "redis", "armazenamento"] as const)("responde 503 quando %s está indisponível, sem vazar detalhe", async (dep) => {
    servico.falhas = { [dep]: true };
    const r = await request(app.getHttpServer()).get("/health/ready");
    expect(r.status).toBe(503);
    expect(r.body.dependencias[dep]).toEqual({ ok: false, motivo: "indisponível" });
    expect(JSON.stringify(r.body)).not.toMatch(/senha|segredo|postgres:|redis:/);
  });

  it("não responde a quem chega por proxy (rede pública)", async () => {
    servico.falhas = {};
    const r = await request(app.getHttpServer()).get("/health/ready").set("x-forwarded-for", "203.0.113.9");
    expect(r.status).toBe(404);
  });
});
