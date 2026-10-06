import { readFileSync } from "node:fs";
import path from "node:path";

import { type INestApplication, Controller, Get, Logger } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

/** Depois da aprovação do inventário (T068) nenhuma rota real fica sem declaração; este controller de teste faz esse papel. */
@Controller("teste-sem-declaracao")
class RotaSemDeclaracaoController {
  @Get()
  aberta(): { ok: true } {
    return { ok: true };
  }
}

async function sobe(modo?: "warn" | "enforce"): Promise<INestApplication> {
  if (modo) process.env.ROUTE_GUARD_MODE = modo;
  else delete process.env.ROUTE_GUARD_MODE;
  // `ConfigModule.forRoot` valida o ambiente ao importar o AppModule; sem isto o
  // segundo app reaproveitaria o modo do primeiro.
  vi.resetModules();
  const { AppModule } = await import("../src/app.module");
  const modulo = await Test.createTestingModule({ imports: [AppModule], controllers: [RotaSemDeclaracaoController] }).compile();
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

  describe("modo warn (explícito)", () => {
    let app: INestApplication;
    beforeAll(async () => {
      app = await sobe("warn");
    });
    afterAll(async () => {
      await app.close();
    });

    it("não nega a rota sem declaração, e a registra no log", async () => {
      const aviso = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => {});

      await request(app.getHttpServer()).get("/teste-sem-declaracao").expect(200);

      const mensagens = aviso.mock.calls.map((c) => String(c[0]));
      expect(mensagens).toContain("rota sem declaração de acesso (undeclared): RotaSemDeclaracaoController.aberta");
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

  describe("sem ROUTE_GUARD_MODE", () => {
    let app: INestApplication;
    beforeAll(async () => {
      app = await sobe();
    });
    afterAll(async () => {
      await app.close();
    });

    it("o padrão é negar a rota sem declaração", async () => {
      await request(app.getHttpServer()).get("/teste-sem-declaracao").expect(403);
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
      const resposta = await request(app.getHttpServer()).get("/teste-sem-declaracao").expect(403);

      expect(resposta.body.codigo).toBe("ACESSO_NEGADO");
      expect(resposta.body.requestId).toBeTruthy();
    });

    it("rota pública aprovada segue aberta", async () => {
      await request(app.getHttpServer()).get("/health").expect(200);
    });
  });
  describe("inventário e parâmetros de identificador", () => {
    let app: INestApplication;
    beforeAll(async () => {
      process.env.DEV_AUTH_ENABLED = "true";
      app = await sobe("enforce");
    });
    afterAll(async () => {
      delete process.env.DEV_AUTH_ENABLED;
      await app.close();
    });

    const inventario: { metodo: string; caminho: string; acesso: string; papeis: string[] }[] = JSON.parse(
      readFileSync(
        path.resolve(__dirname, "../../../specs/002-fundacao-solida/contracts/inventario-rotas.json"),
        "utf8",
      ),
    );

    it("nenhuma rota do inventário está sem declaração de acesso", () => {
      expect(inventario.filter((r) => r.acesso === "undeclared").map((r) => `${r.metodo} ${r.caminho}`)).toEqual([]);
    });

    it("toda rota com :id recusa valor que não é UUID com REQUISICAO_INVALIDA", async () => {
      const comId = inventario.filter((r) => /:(id|\w+Id)(\/|$)/.test(r.caminho));
      expect(comId.length).toBeGreaterThan(20);
      const falhas: string[] = [];
      for (const rota of comId) {
        const url = rota.caminho.replace(/:\w+/g, "nao-e-uuid");
        const papeis = rota.papeis.length > 0 ? rota.papeis.join(",") : "admin";
        const metodo = rota.metodo.toLowerCase() as "get";
        const alvo = request(app.getHttpServer());
        const resposta = await alvo[metodo](url)
          .set("x-dev-principal", "teste-uuid")
          .set("x-dev-roles", papeis)
          .send({});
        if (resposta.status !== 400 || resposta.body.codigo !== "REQUISICAO_INVALIDA") {
          falhas.push(`${rota.metodo} ${rota.caminho} -> ${resposta.status} ${resposta.body.codigo ?? ""}`);
        }
      }
      expect(falhas).toEqual([]);
    });
  });
});
