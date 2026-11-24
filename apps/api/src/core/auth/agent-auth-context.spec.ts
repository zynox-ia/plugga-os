import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { AgentAuthContext } from "./agent-auth-context";
import { AgentLookupRepository } from "./agent-lookup.repository";
import type { AuthenticatedRequest, AuthPrincipal } from "./auth.types";
import { hashToken } from "./token.util";

const principal: AuthPrincipal = { id: "00000000-0000-4000-8000-000000000011", kind: "service", acesso: { plataforma: null, departamentos: [{ departamento: "crm", nivel: "membro", telas: ["crm.pipelines"] }] } };

class Lookup extends AgentLookupRepository {
  autenticado = true;
  hashRecebido = "";
  chamadas = 0;
  async resolvePrincipal(hash: string): Promise<AuthPrincipal | null> {
    this.hashRecebido = hash;
    this.chamadas++;
    return this.autenticado ? principal : null;
  }
  async identidadeAtiva(): Promise<boolean> { return this.autenticado; }
}

describe("identidade de agente por credencial opaca", () => {
  it("usa só o hash e mantém a capacidade fora do principal serializado", async () => {
    const lookup = new Lookup();
    const contexto = new AgentAuthContext(lookup);
    const token = `plg_agent_${randomBytes(32).toString("base64url")}`;
    const request: AuthenticatedRequest = { headers: { authorization: `Bearer ${token}` } };
    const resultado = await contexto.resolve(request);
    expect(resultado).toEqual(principal);
    expect(lookup.hashRecebido === hashToken(token)).toBe(true);
    expect(request.databaseAgentHash === lookup.hashRecebido).toBe(true);
    expect(JSON.stringify(resultado).includes(token)).toBe(false);
    expect(JSON.stringify(resultado).includes(lookup.hashRecebido)).toBe(false);
  });

  it("revalida a cada requisição: revogar impede a mesma credencial imediatamente", async () => {
    const lookup = new Lookup();
    const contexto = new AgentAuthContext(lookup);
    const token = `plg_agent_${randomBytes(32).toString("base64url")}`;
    const request: AuthenticatedRequest = { headers: { authorization: `Bearer ${token}` } };
    expect(await contexto.resolve(request)).toEqual(principal);
    lookup.autenticado = false;
    expect(await contexto.resolve(request)).toBeNull();
    expect(request.databaseAgentHash === undefined).toBe(true);
    expect(lookup.chamadas).toBe(2);
  });

  it("texto service, header de desenvolvimento e bearer malformado não são identidade", async () => {
    const lookup = new Lookup();
    const contexto = new AgentAuthContext(lookup);
    for (const authorization of [undefined, "service:admin", "Bearer admin", ["Bearer duplicado", "Bearer outro"]]) {
      expect(await contexto.resolve({ headers: { authorization, "x-dev-principal": "service:agente", "x-dev-plataforma": "desenvolvedor" } })).toBeNull();
    }
    expect(lookup.chamadas).toBe(0);
  });
});
