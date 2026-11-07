import { randomBytes, randomUUID } from "node:crypto";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module";
import { AgentActionScope } from "../src/audit/agent-action-scope";
import { AgentLookupRepository } from "../src/core/auth/agent-lookup.repository";
import type { AuthPrincipal } from "../src/core/auth/auth.types";
import { hashToken } from "../src/core/auth/token.util";
import {
  AuditPort,
  type AgentActionAppend,
  type EventAppend,
  type StoredAgentAction,
} from "../src/audit/audit.port";

class InMemoryAuditRepository extends AuditPort {
  readonly calls: Array<{ agentAction?: AgentActionAppend; event: EventAppend }> = [];

  async appendEvent(event: EventAppend): Promise<void> {
    this.calls.push({ event });
  }

  async appendTrail(
    agentAction: AgentActionAppend,
    event: EventAppend,
  ): Promise<StoredAgentAction> {
    this.calls.push({ agentAction, event });
    return {
      id: "00000000-0000-4000-8000-000000000201",
      status: agentAction.status,
      createdAt: new Date("2026-08-06T15:00:00.000Z"),
    };
  }
}

describe("foundation API (e2e)", () => {
  let app: INestApplication;
  let auditRepository: InMemoryAuditRepository;
  const token = `plg_agent_${randomBytes(32).toString("base64url")}`;
  const agenteId = randomUUID();
  const clienteId = randomUUID();
  const principal: AuthPrincipal = { id: agenteId, kind: "service", acesso: { plataforma: null, departamentos: [{ departamento: "crm", nivel: "membro", telas: ["crm.clientes"] }] } };

  beforeAll(async () => {
    auditRepository = new InMemoryAuditRepository();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuditPort)
      .useValue(auditRepository)
      .overrideProvider(AgentLookupRepository)
      .useValue({
        resolvePrincipal: async (hash: string) => hash === hashToken(token) ? principal : null,
        identidadeAtiva: async (id: string) => id === agenteId,
      })
      .overrideProvider(AgentActionScope)
      .useValue({ permite: async (_: AuthPrincipal, tipo: string, id: string) => tipo === "client" && id === clienteId })
      .compile();

    app = module.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    auditRepository.calls.length = 0;
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns health without authentication or a database connection", async () => {
    const response = await request(app.getHttpServer()).get("/health").expect(200);

    expect(response.body).toMatchObject({ status: "ok", service: "plugga-api" });
    expect(response.body.timestamp).toEqual(expect.any(String));
  });

  it("rejects an unauthenticated mutation", async () => {
    await request(app.getHttpServer()).post("/agent-actions").send({}).expect(401);
  });

  it("rejects an agent mutation from a human principal", async () => {
    await request(app.getHttpServer())
      .post("/agent-actions")
      .set("x-dev-principal", "local-viewer")
      .set("x-dev-departamentos", "crm:membro")
      .send({})
      .expect(403);
  });

  it("validates agent-action input before appending the audit trail", async () => {
    await request(app.getHttpServer())
      .post("/agent-actions")
      .set("Authorization", `Bearer ${token}`)
      .send({ action: "missing-required-fields" })
      .expect(400);

    expect(auditRepository.calls).toHaveLength(0);
  });

  it("appends a local agent action and matching event", async () => {
    const response = await request(app.getHttpServer())
      .post("/agent-actions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        agent: agenteId,
        channel: "api",
        action: "foundation.test",
        entityType: "client",
        entityId: clienteId,
        input: {},
        payload: { safe: true },
        decision: "allowed",
        approvalStatus: "not_required",
        status: "recorded",
      })
      .expect(201);

    expect(response.body).toEqual({
      id: "00000000-0000-4000-8000-000000000201",
      status: "recorded",
      createdAt: "2026-08-06T15:00:00.000Z",
    });
    expect(auditRepository.calls).toHaveLength(1);
    expect(auditRepository.calls[0]?.event.eventName).toBe("agent.action.recorded");
  });

  it("rejects an agent identity that differs from the service principal", async () => {
    await request(app.getHttpServer())
      .post("/agent-actions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        agent: "forged-agent",
        channel: "api",
        action: "foundation.test",
        entityType: "test_entity",
        entityId: "entity-1",
        decision: "allowed",
        approvalStatus: "not_required",
        status: "recorded",
      })
      .expect(403);

    expect(auditRepository.calls).toHaveLength(0);
  });

  it("records a human WhatsApp request only as an event", async () => {
    await request(app.getHttpServer())
      .post("/channels/whatsapp/send")
      .set("x-dev-principal", "local-admin")
      .set("x-dev-plataforma", "desenvolvedor")
      .send({
        destination: "+5592999991234",
        originDomain: "ops",
        content: { kind: "text", text: "local mock" },
      })
      .expect(201);

    expect(auditRepository.calls).toHaveLength(1);
    expect(auditRepository.calls[0]?.agentAction).toBeUndefined();
    expect(auditRepository.calls[0]?.event.actorType).toBe("user");
    expect(auditRepository.calls[0]?.event.actorId).toBe("local-admin");
  });

  it("simulates WhatsApp without retaining destination or content in audit", async () => {
    const destination = "+5592999991234";
    const text = "conteudo que nao deve entrar na auditoria";
    const response = await request(app.getHttpServer())
      .post("/channels/whatsapp/send")
      .set("x-dev-principal", "service:test-agent")
      .set("x-dev-plataforma", "desenvolvedor")
      .send({
        destination,
        originDomain: "ops",
        audience: "transactional",
        priority: "normal",
        optedOut: false,
        content: { kind: "text", text },
      })
      .expect(201);

    expect(response.body).toMatchObject({
      status: "queued",
      simulated: true,
      reason: "mock_only",
    });
    expect(response.body.maskedDestination).not.toContain("999991234");
    const serializedAudit = JSON.stringify(auditRepository.calls);
    expect(serializedAudit).not.toContain(destination);
    expect(serializedAudit).not.toContain(text);
    expect(auditRepository.calls[0]?.event.eventName).toBe("channel.whatsapp.send.mocked");
  });
});
