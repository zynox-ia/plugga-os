import { NotFoundException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";

import { FinanceiroHabilitadoGuard, financeiroHabilitado } from "./financeiro-habilitado.guard";

const guard = (ambiente: Record<string, unknown>) =>
  new FinanceiroHabilitadoGuard({ get: (chave: string) => ambiente[chave] } as unknown as ConfigService);

describe("portão do Financeiro", () => {
  it("liga em development e test, ou com FINANCEIRO_HABILITADO; fechado na dúvida", () => {
    expect(financeiroHabilitado({ NODE_ENV: "development" })).toBe(true);
    expect(financeiroHabilitado({ NODE_ENV: "test", FINANCEIRO_HABILITADO: false })).toBe(true);
    expect(financeiroHabilitado({ NODE_ENV: "production" })).toBe(false);
    expect(financeiroHabilitado({ NODE_ENV: "production", FINANCEIRO_HABILITADO: true })).toBe(true);
    expect(financeiroHabilitado({})).toBe(false);
    expect(financeiroHabilitado({ NODE_ENV: "staging" })).toBe(false);
  });

  it("desligado, a rota responde 404 como se não existisse", () => {
    expect(() => guard({ NODE_ENV: "production", FINANCEIRO_HABILITADO: false }).canActivate()).toThrow(NotFoundException);
    expect(guard({ NODE_ENV: "production", FINANCEIRO_HABILITADO: true }).canActivate()).toBe(true);
  });
});
