import { Test } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O atalho de desenvolvimento (cabeçalhos x-dev-*) nunca pode valer em produção
 * (FR-023): a validação do ambiente recusa a combinação e, mesmo que alguém a
 * contorne, o provedor de autenticação não registra o atalho.
 */
describe("atalho de autenticação de desenvolvimento em produção", () => {
  const ambienteOriginal = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...ambienteOriginal };
    vi.restoreAllMocks();
  });

  it("a validação do ambiente recusa NODE_ENV=production com DEV_AUTH_ENABLED=true", async () => {
    const { validateEnvironment } = await import("../src/config/environment");
    const base = {
      NODE_ENV: "production",
      DEV_AUTH_ENABLED: "true",
      DATABASE_URL: "postgresql://u:p@localhost:5432/db",
      AUTH_SESSION_SECRET: "x".repeat(40),
    };

    expect(() => validateEnvironment(base)).toThrow(/DEV_AUTH_ENABLED/);
  });

  it("fora de produção o atalho liga, mas o aviso aparece no log", async () => {
    process.env.NODE_ENV = "test";
    process.env.DEV_AUTH_ENABLED = "true";
    const { Logger } = await import("@nestjs/common");
    const aviso = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => {});
    const { AppModule } = await import("../src/app.module");

    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    await modulo.close();

    expect(aviso.mock.calls.map((c) => String(c[0])).some((m) => m.includes("DEV_AUTH_ENABLED ligado"))).toBe(true);
  });
});
