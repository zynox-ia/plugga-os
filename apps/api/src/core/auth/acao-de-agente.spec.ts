import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Acesso } from "@plugga/shared";
import { describe, expect, it } from "vitest";

import { AcaoDeAgente, AcaoDeAgenteGuard } from "./acao-de-agente";
import type { AgentLookupRepository } from "./agent-lookup.repository";
import type { AuthPrincipal } from "./auth.types";
import { ThrottlerPorAgenteGuard } from "./throttler-por-agente.guard";

class Rota {
  @AcaoDeAgente("engenharia.ordem.criar")
  criar(): void {}
  semAcao(): void {}
}

const engenharia: Acesso = { plataforma: null, departamentos: [{ departamento: "engenharia-obras", nivel: "membro", telas: ["engenharia-obras.os"] }] };
const contexto = (metodo: "criar" | "semAcao", principal?: AuthPrincipal): ExecutionContext => ({
  getHandler: () => Rota.prototype[metodo],
  getClass: () => Rota,
  switchToHttp: () => ({ getRequest: () => ({ headers: {}, authPrincipal: principal }) }),
}) as unknown as ExecutionContext;
const guard = (ativa = true) => new AcaoDeAgenteGuard(new Reflector(), { identidadeAtiva: async () => ativa } as unknown as AgentLookupRepository);
const agente = (acoes: AuthPrincipal["acoesDeAgente"]): AuthPrincipal => ({ id: "00000000-0000-4000-8000-0000000000a1", kind: "service", acesso: engenharia, acoesDeAgente: acoes });

describe("escopo por ação do agente (B-01)", () => {
  it("passa só o agente ativo com a ação", async () => {
    await expect(guard().canActivate(contexto("criar", agente(["engenharia.ordem.criar"])))).resolves.toBe(true);
  });

  it("recusa o agente sem a ação, mesmo com a tela; a pessoa; o agente revogado; e a rota sem ação declarada", async () => {
    await expect(guard().canActivate(contexto("criar", agente([])))).rejects.toThrow(ForbiddenException);
    await expect(guard().canActivate(contexto("criar", agente(undefined)))).rejects.toThrow(/não tem a ação/);
    await expect(guard().canActivate(contexto("criar", { id: "p", kind: "user", acesso: engenharia }))).rejects.toThrow(/só para identidades de agente/);
    await expect(guard().canActivate(contexto("criar", undefined))).rejects.toThrow(ForbiddenException);
    await expect(guard(false).canActivate(contexto("criar", agente(["engenharia.ordem.criar"])))).rejects.toThrow(/ativa/);
    await expect(guard().canActivate(contexto("semAcao", agente(["engenharia.ordem.criar"])))).rejects.toThrow(/sem ação declarada/);
  });
});

describe("limite de taxa por agente", () => {
  const tracker = (req: Record<string, unknown>) => (ThrottlerPorAgenteGuard.prototype as unknown as { getTracker(r: Record<string, unknown>): Promise<string> }).getTracker.call({}, req);

  it("o agente conta pelo próprio id; sem agente, pelo IP", async () => {
    expect(await tracker({ ip: "10.0.0.1", authPrincipal: agente([]) })).toBe("agente:00000000-0000-4000-8000-0000000000a1");
    expect(await tracker({ ip: "10.0.0.1", authPrincipal: { id: "p", kind: "user", acesso: engenharia } })).toBe("10.0.0.1");
  });
});
