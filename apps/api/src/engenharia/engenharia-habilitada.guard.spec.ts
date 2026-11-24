import { NotFoundException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";

import { engenhariaLigada, validateEnvironment } from "../config/environment";
import { EngenhariaHabilitadaGuard } from "./engenharia-habilitada.guard";

const BASE = {
  DATABASE_URL: "postgresql://plugga:plugga@localhost:55432/plugga?schema=public",
  AUTH_SESSION_SECRET: "s".repeat(48),
};
const ligada = (ambiente: Record<string, unknown>) => validateEnvironment({ ...BASE, ...ambiente }).ENGENHARIA_LIGADA;
const guard = (ambiente: Record<string, unknown>) =>
  new EngenhariaHabilitadaGuard({ get: (chave: string) => validateEnvironment({ ...BASE, ...ambiente })[chave as "ENGENHARIA_LIGADA"] } as unknown as ConfigService);

describe("portão da Engenharia", () => {
  it("liga em development e test, ou com ENGENHARIA_HABILITADO", () => {
    expect(ligada({ NODE_ENV: "development" })).toBe(true);
    expect(ligada({ NODE_ENV: "test" })).toBe(true);
    expect(ligada({ ENGENHARIA_HABILITADO: "true" })).toBe(true);
    expect(engenhariaLigada("production", true)).toBe(true);
  });

  it("fechado na dúvida: produção ou NODE_ENV ausente, sem a variável", () => {
    expect(engenhariaLigada("production", false)).toBe(false);
    expect(validateEnvironment(BASE).NODE_ENV).toBe("development");
    expect(ligada({})).toBe(false);
  });

  it("independente do portão do Financeiro", () => {
    expect(ligada({ FINANCEIRO_HABILITADO: "true" })).toBe(false);
    expect(validateEnvironment({ ...BASE, ENGENHARIA_HABILITADO: "true" }).FINANCEIRO_LIGADO).toBe(false);
  });

  it("desligado, a rota responde 404 como se não existisse", () => {
    expect(() => guard({}).canActivate()).toThrow(NotFoundException);
    expect(guard({ NODE_ENV: "test" }).canActivate()).toBe(true);
  });
});
