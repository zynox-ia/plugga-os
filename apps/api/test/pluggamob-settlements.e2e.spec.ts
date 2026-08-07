import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module";
import {
  type MutationContext,
  type SettlementMutationResult,
  SettlementsRepository,
  type StoredSettlement,
} from "../src/pluggamob/settlements/settlements.repository";

const settlementId = "00000000-0000-4000-8000-000000000701";
const lineId = "00000000-0000-4000-8000-000000000711";

const blockedSettlement: StoredSettlement = {
  id: settlementId,
  partner: {
    id: "00000000-0000-4000-8000-000000000721",
    key: "local-partner",
    name: "Parceiro local",
  },
  weekStart: new Date("2026-08-03T04:00:00.000Z"),
  weekEnd: new Date("2026-08-10T03:59:59.999Z"),
  status: "blocked",
  lines: [
    {
      id: lineId,
      sessionId: null,
      tokenRfid: "LOCAL-RFID-001",
      classification: "rfid_physical",
      amount: "48.00",
      blockedReason: "RFID físico sem valoração",
      blockerAssignee: "Financeiro PluggaMob",
      blockerEvidenceMissing: "Tabela de tarifa",
      blockerNextAction: "Validar tarifa",
    },
  ],
};

class InMemorySettlementsRepository extends SettlementsRepository {
  lastMutationContext?: MutationContext;

  async findCoupons() {
    return [
      {
        id: "00000000-0000-4000-8000-000000000731",
        code: "LOCAL10",
        status: "active",
        createdAt: new Date("2026-08-01T12:00:00.000Z"),
      },
    ];
  }
  async findSettlements() {
    return [blockedSettlement];
  }
  async findSettlement(id: string) {
    return id === settlementId ? blockedSettlement : null;
  }
  async findD14Credits() {
    return [];
  }
  async resolveBlocker(
    id: string,
    requestedLineId: string,
    _resolution: string,
    context: MutationContext,
  ): Promise<SettlementMutationResult> {
    this.lastMutationContext = context;
    if (id !== settlementId || requestedLineId !== lineId) return { kind: "line_not_found" };
    return {
      kind: "ok",
      settlement: { ...blockedSettlement, status: "auditing", lines: [] },
    };
  }
  async requestApproval(
    _id: string,
    _note: string | undefined,
    context: MutationContext,
  ): Promise<SettlementMutationResult> {
    this.lastMutationContext = context;
    return { kind: "blocked" };
  }
  async approve(
    _id: string,
    _note: string | undefined,
    context: MutationContext,
  ): Promise<SettlementMutationResult> {
    this.lastMutationContext = context;
    return { kind: "ok", settlement: { ...blockedSettlement, status: "approved", lines: [] } };
  }
}

describe("PluggaMob settlements API (e2e, local repository)", () => {
  let app: INestApplication;
  let repository: InMemorySettlementsRepository;

  beforeAll(async () => {
    repository = new InMemorySettlementsRepository();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SettlementsRepository)
      .useValue(repository)
      .compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("requires authentication and exposes local coupons to an authorized role", async () => {
    await request(app.getHttpServer()).get("/pluggamob/coupons").expect(401);

    const response = await request(app.getHttpServer())
      .get("/pluggamob/coupons")
      .set("x-dev-principal", "local-finance")
      .set("x-dev-roles", "financeiro")
      .expect(200);

    expect(response.body).toMatchObject({ mode: "mock", items: [{ code: "LOCAL10" }] });
  });

  it("returns the negative Pode fechar? panel and its attributed blocker", async () => {
    const response = await request(app.getHttpServer())
      .get(`/pluggamob/settlements/${settlementId}`)
      .set("x-dev-principal", "local-finance")
      .set("x-dev-roles", "financeiro")
      .expect(200);

    expect(response.body.canClosePanel).toMatchObject({
      canClose: false,
      blockerCount: 1,
      blockers: [{ lineId, assignee: "Financeiro PluggaMob" }],
    });
  });

  it("lists weekly settlements and local D+14 credits", async () => {
    const headers = { "x-dev-principal": "local-finance", "x-dev-roles": "financeiro" };
    const settlements = await request(app.getHttpServer())
      .get("/pluggamob/settlements")
      .set(headers)
      .expect(200);
    const credits = await request(app.getHttpServer())
      .get("/pluggamob/d14-credits")
      .set(headers)
      .expect(200);

    expect(settlements.body).toMatchObject({
      mode: "mock",
      items: [{ id: settlementId, amount: "48.00", canClose: false }],
    });
    expect(credits.body).toEqual({ mode: "mock", items: [] });
  });

  it("rejects approval by pluggamob or admin roles", async () => {
    for (const role of ["pluggamob", "admin"]) {
      await request(app.getHttpServer())
        .post(`/pluggamob/settlements/${settlementId}/approve`)
        .set("x-dev-principal", `local-${role}`)
        .set("x-dev-roles", role)
        .send({ note: "Tentativa sem papel aprovador" })
        .expect(403);
    }

    await request(app.getHttpServer())
      .post(`/pluggamob/settlements/${settlementId}/approve`)
      .set("x-dev-principal", "service:settlements-agent")
      .set("x-dev-roles", "financeiro")
      .send({ note: "Agente não pode executar mutação humana" })
      .expect(403);
  });

  it("rejects an approval request while an open blocker exists", async () => {
    await request(app.getHttpServer())
      .post(`/pluggamob/settlements/${settlementId}/request-approval`)
      .set("x-dev-principal", "local-pluggamob")
      .set("x-dev-roles", "pluggamob")
      .send({ note: "Solicitar revisão" })
      .expect(409);

    expect(repository.lastMutationContext?.actorId).toBe("local-pluggamob");
  });

  it("allows financeiro to resolve a blocker and approve a clean settlement", async () => {
    await request(app.getHttpServer())
      .post(`/pluggamob/settlements/${settlementId}/resolve-blocker`)
      .set("x-dev-principal", "local-finance")
      .set("x-dev-roles", "financeiro")
      .send({ lineId, resolution: "Tarifa validada localmente" })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post(`/pluggamob/settlements/${settlementId}/approve`)
      .set("x-dev-principal", "local-finance")
      .set("x-dev-roles", "financeiro")
      .send({ note: "Auditoria limpa" })
      .expect(201);

    expect(response.body).toMatchObject({ status: "approved", canClosePanel: { canClose: true } });
    expect(repository.lastMutationContext?.actorId).toBe("local-finance");
  });
});
