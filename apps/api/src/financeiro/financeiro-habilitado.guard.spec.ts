import { NotFoundException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";

import { validateEnvironment } from "../config/environment";
import { FinanceiroHabilitadoGuard } from "./financeiro-habilitado.guard";

const BASE = {
  DATABASE_URL: "postgresql://plugga:plugga@localhost:55432/plugga?schema=public",
  AUTH_SESSION_SECRET: "s".repeat(48),
};
const ligado = (ambiente: Record<string, unknown>) => validateEnvironment({ ...BASE, ...ambiente }).FINANCEIRO_LIGADO;
const guard = (ambiente: Record<string, unknown>) =>
  new FinanceiroHabilitadoGuard({ get: (chave: string) => validateEnvironment({ ...BASE, ...ambiente })[chave as "FINANCEIRO_LIGADO"] } as unknown as ConfigService);

describe("portão do Financeiro", () => {
  it("liga em development e test, ou com FINANCEIRO_HABILITADO", () => {
    expect(ligado({ NODE_ENV: "development" })).toBe(true);
    expect(ligado({ NODE_ENV: "test" })).toBe(true);
    expect(ligado({ NODE_ENV: "development", FINANCEIRO_HABILITADO: "true" })).toBe(true);
  });

  it("fechado na dúvida: sem NODE_ENV o schema assume development, mas o portão não", () => {
    expect(validateEnvironment(BASE).NODE_ENV).toBe("development");
    expect(ligado({})).toBe(false);
    expect(ligado({ FINANCEIRO_HABILITADO: "true" })).toBe(true);
  });

  it("desligado, a rota responde 404 como se não existisse", () => {
    expect(() => guard({}).canActivate()).toThrow(NotFoundException);
    expect(guard({ NODE_ENV: "test" }).canActivate()).toBe(true);
  });
});
