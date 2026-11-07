import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";
import type { CreateAgentAction } from "@plugga/shared";

import type { AuthPrincipal } from "../core/auth/auth.types";
import { AgentActionsService } from "./agent-actions.service";
import { AgentActionScope } from "./agent-action-scope";
import { AuditPort, type AgentActionAppend, type EventAppend } from "./audit.port";

const principal: AuthPrincipal = { id: randomUUID(), kind: "service", acesso: { plataforma: null, departamentos: [{ departamento: "crm", nivel: "membro", telas: ["crm.clientes"] }] } };
const input: CreateAgentAction = { agent: principal.id, channel: "api", action: "client.checked", entityType: "client", entityId: randomUUID(), input: {}, payload: {}, decision: "allowed", approvalStatus: "not_required", status: "recorded" };

function preparar() {
  const trilhas: AgentActionAppend[] = [];
  class Repository extends AuditPort {
    async appendEvent(): Promise<void> {}
    async appendTrail(action: AgentActionAppend, evento: EventAppend) {
      expect(evento.actorType).toBe("agent");
      expect(evento.actorId).toBe(principal.id);
      trilhas.push(action);
      return { id: randomUUID(), status: action.status, createdAt: new Date() };
    }
  }
  class Scope extends AgentActionScope {
    permitido = true;
    async permite(): Promise<boolean> { return this.permitido; }
  }
  const scope = new Scope();
  return { service: new AgentActionsService(new Repository(), scope), scope, trilhas };
}

describe("trilha de agente autenticado", () => {
  it("recusa personificação e aprovação autodeclarada sem gravar", async () => {
    const h = preparar();
    await expect(h.service.create({ ...input, agent: randomUUID() }, principal)).rejects.toThrow();
    await expect(h.service.create({ ...input, approvalStatus: "approved" }, principal)).rejects.toThrow();
    await expect(h.service.create({ ...input, approvalStatus: "rejected" }, principal)).rejects.toThrow();
    expect(h.trilhas).toHaveLength(0);
  });
  it("entidade fora do alcance não entra na trilha", async () => {
    const h = preparar();
    h.scope.permitido = false;
    await expect(h.service.create(input, principal)).rejects.toThrow();
    expect(h.trilhas).toHaveLength(0);
  });
  it("liga a trilha à identidade e descarta conteúdo livre", async () => {
    const h = preparar();
    await h.service.create({ ...input, input: { detalhe: "conteúdo sintético livre" }, payload: { detalhe: "outro conteúdo livre" }, result: "resultado livre", error: "erro livre" }, principal);
    expect(h.trilhas[0]).toMatchObject({ agent: principal.id, agentUserId: principal.id, requestedById: null, input: {}, payload: {} });
    expect(h.trilhas[0]?.result).toBeUndefined();
    expect(h.trilhas[0]?.error).toBeUndefined();
  });
});
