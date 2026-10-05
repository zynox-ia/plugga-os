import { type INestApplication, Logger } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

async function sobe(modo?: "warn" | "enforce"): Promise<INestApplication> {
  if (modo) process.env.ROUTE_GUARD_MODE = modo;
  else delete process.env.ROUTE_GUARD_MODE;
  // `ConfigModule.forRoot` valida o ambiente ao importar o AppModule; sem isto o
  // segundo app reaproveitaria o modo do primeiro.
  vi.resetModules();
  const { AppModule } = await import("../src/app.module");
  const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = modulo.createNestApplication();
  await app.init();
  return app;
}

/** Cobertura do inventário (T070): em modo warn só as rotas esperadas aparecem como undeclared. */
describe("rota fechada por padrão (e2e)", () => {
  afterEach(() => {
    delete process.env.ROUTE_GUARD_MODE;
    vi.restoreAllMocks();
  });

  describe("modo warn (padrão)", () => {
    let app: INestApplication;
    beforeAll(async () => {
      app = await sobe();
    });
    afterAll(async () => {
      await app.close();
    });

    it("não nega a rota sem declaração, e a registra no log", async () => {
      const aviso = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => {});

      await request(app.getHttpServer()).get("/health").expect(200);

      const mensagens = aviso.mock.calls.map((c) => String(c[0]));
      expect(mensagens).toContain("rota sem declaração de acesso (undeclared): HealthController.check");
    });

    it("rota que declara o acesso não gera aviso", async () => {
      const aviso = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => {});

      // Sem sessão: 401 do guard de autenticação, e nenhum aviso de rota fechada.
      await request(app.getHttpServer()).get("/energy-efficiency/studies").expect((r) => {
        expect([401, 403, 404]).toContain(r.status);
      });

      expect(aviso.mock.calls.map((c) => String(c[0])).filter((m) => m.includes("undeclared"))).toEqual([]);
    });
  });

  describe("modo enforce", () => {
    let app: INestApplication;
    beforeAll(async () => {
      app = await sobe("enforce");
    });
    afterAll(async () => {
      await app.close();
    });

    it("nega a rota sem declaração com o envelope de erro", async () => {
      const resposta = await request(app.getHttpServer()).get("/health").expect(403);

      expect(resposta.body.codigo).toBe("ACESSO_NEGADO");
      expect(resposta.body.requestId).toBeTruthy();
    });
  });
});
