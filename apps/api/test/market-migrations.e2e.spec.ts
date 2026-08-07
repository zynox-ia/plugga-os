import { NotFoundException, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type {
  ActivateMarketMigrationRequest,
  AdvanceMarketMigrationStageRequest,
  CancelMarketMigrationRequest,
  CreateMarketMigrationRequest,
  ListAuditsResponse,
  ListConsumerUnitsResponse,
  ListContestationsResponse,
  ListCyclesResponse,
  ListMarketMigrationsResponse,
  MarketMigrationDetail,
} from "@plugga/shared";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module";
import { EnergyRepository } from "../src/energy/energy.repository";
import {
  assertMarketMigrationHasOwnerAndNextAction,
  assertMarketMigrationOpen,
  assertMarketMigrationStageTransitionAllowed,
} from "../src/energy/energy.rules";
import type { AuthPrincipal } from "../src/core/auth/auth.types";

const OWNER_ID = "00000000-0000-4000-8000-000000000601";
const CONSUMER_UNIT_ID = "00000000-0000-4000-8000-000000000701";
const CLIENT_ID = "00000000-0000-4000-8000-000000000801";

type StoredMigration = MarketMigrationDetail;

type RecordedEvent = { eventName: string; entityType: string; entityId: string; actorId: string; payload: unknown };

/**
 * In-memory double implementing the same abstract EnergyRepository the real
 * Prisma adapter implements, so this suite exercises real HTTP + RBAC + Zod
 * validation without a live Postgres (unavailable in this sandbox — same
 * pattern as apps/api/test/commercial.e2e.spec.ts). It re-uses the exact
 * same guard functions the Prisma repository calls (energy.rules.ts) rather
 * than re-implementing the rules, so this double can't silently drift from
 * production behavior.
 */
class InMemoryEnergyRepository extends EnergyRepository {
  private migrations = new Map<string, StoredMigration>();
  private sequence = 0;
  readonly events: RecordedEvent[] = [];

  private nextId(prefix: string): string {
    this.sequence += 1;
    return `00000000-0000-4000-8000-${prefix}${String(this.sequence).padStart(6, "0")}`;
  }

  private record(eventName: string, entityType: string, entityId: string, principal: AuthPrincipal, payload: unknown) {
    this.events.push({ eventName, entityType, entityId, actorId: principal.id, payload });
  }

  seedMigration(overrides: Partial<StoredMigration> & { id: string }): StoredMigration {
    const migration: StoredMigration = {
      clientId: null,
      clientName: null,
      consumerUnitId: CONSUMER_UNIT_ID,
      consumerUnitCode: "UC-0001",
      stage: "analise",
      status: "em_andamento",
      ownerId: OWNER_ID,
      ownerName: "Ana",
      nextActionAt: "2026-08-10T12:00:00.000Z",
      nextActionNote: "Confirmar viabilidade",
      cancelReason: null,
      activatedAt: null,
      createdAt: "2026-08-01T12:00:00.000Z",
      updatedAt: "2026-08-01T12:00:00.000Z",
      ...overrides,
    };
    this.migrations.set(migration.id, migration);
    return migration;
  }

  async listConsumerUnits(): Promise<ListConsumerUnitsResponse> {
    return { items: [] };
  }

  async listMarketMigrations(): Promise<ListMarketMigrationsResponse> {
    return { items: [...this.migrations.values()] };
  }

  async listCycles(): Promise<ListCyclesResponse> {
    return { items: [] };
  }

  async listAudits(): Promise<ListAuditsResponse> {
    return { items: [] };
  }

  async listContestations(): Promise<ListContestationsResponse> {
    return { items: [] };
  }

  private get(id: string): StoredMigration {
    const found = this.migrations.get(id);
    if (!found) throw new NotFoundException("market migration not found");
    return found;
  }

  async createMarketMigration(input: CreateMarketMigrationRequest, principal: AuthPrincipal): Promise<MarketMigrationDetail> {
    const id = this.nextId("mig");
    const created = this.seedMigration({
      id,
      consumerUnitId: input.consumerUnitId,
      ownerId: input.ownerId,
      ownerName: input.ownerId === OWNER_ID ? "Ana" : "Outro",
      nextActionAt: input.nextActionAt,
      nextActionNote: input.nextActionNote ?? null,
    });
    this.record("energy.market_migration_created", "market_migration", id, principal, input);
    return created;
  }

  async advanceMarketMigrationStage(
    id: string,
    input: AdvanceMarketMigrationStageRequest,
    principal: AuthPrincipal,
  ): Promise<MarketMigrationDetail> {
    const current = this.get(id);
    assertMarketMigrationOpen(current.status);
    assertMarketMigrationStageTransitionAllowed(current.stage, input.stage);
    const nextOwnerId = input.ownerId ?? current.ownerId;
    const nextActionAt = input.nextActionAt ?? current.nextActionAt;
    assertMarketMigrationHasOwnerAndNextAction(nextOwnerId, nextActionAt ? new Date(nextActionAt) : null);

    const updated: StoredMigration = {
      ...current,
      stage: input.stage,
      ownerId: nextOwnerId,
      nextActionAt,
      nextActionNote: input.nextActionNote ?? current.nextActionNote,
    };
    this.migrations.set(id, updated);
    this.record("energy.market_migration_stage_advanced", "market_migration", id, principal, input);
    return updated;
  }

  async cancelMarketMigration(
    id: string,
    input: CancelMarketMigrationRequest,
    principal: AuthPrincipal,
  ): Promise<MarketMigrationDetail> {
    const current = this.get(id);
    assertMarketMigrationOpen(current.status);

    const updated: StoredMigration = { ...current, status: "cancelada", cancelReason: input.cancelReason };
    this.migrations.set(id, updated);
    this.record("energy.market_migration_cancelled", "market_migration", id, principal, input);
    return updated;
  }

  async activateMarketMigration(
    id: string,
    input: ActivateMarketMigrationRequest,
    principal: AuthPrincipal,
  ): Promise<MarketMigrationDetail> {
    const current = this.get(id);
    assertMarketMigrationOpen(current.status);
    assertMarketMigrationHasOwnerAndNextAction(current.ownerId, current.nextActionAt ? new Date(current.nextActionAt) : null);

    const clientId = input.clientId ?? this.nextId("client");
    const updated: StoredMigration = {
      ...current,
      status: "ativa",
      stage: "ativacao",
      clientId,
      activatedAt: "2026-08-06T12:00:00.000Z",
    };
    this.migrations.set(id, updated);
    this.record("energy.market_migration_activated", "market_migration", id, principal, { clientId });
    return updated;
  }
}

describe("energy market-migrations API (e2e)", () => {
  let app: INestApplication;
  let repository: InMemoryEnergyRepository;

  beforeAll(async () => {
    repository = new InMemoryEnergyRepository();

    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EnergyRepository)
      .useValue(repository)
      .compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  function asOpm() {
    return {
      get: (path: string) => request(app.getHttpServer()).get(path).set("x-dev-principal", "local-opm").set("x-dev-roles", "opm"),
      post: (path: string) => request(app.getHttpServer()).post(path).set("x-dev-principal", "local-opm").set("x-dev-roles", "opm"),
    };
  }

  function asViewer() {
    return {
      get: (path: string) =>
        request(app.getHttpServer()).get(path).set("x-dev-principal", "local-viewer").set("x-dev-roles", "viewer"),
      post: (path: string) =>
        request(app.getHttpServer()).post(path).set("x-dev-principal", "local-viewer").set("x-dev-roles", "viewer"),
    };
  }

  it("requires authentication to read market migrations", async () => {
    await request(app.getHttpServer()).get("/energy/market-migrations").expect(401);
  });

  it("allows a broad read role to list market migrations but not mutate them", async () => {
    repository.seedMigration({ id: "00000000-0000-4000-8000-000000000901" });

    await asViewer().get("/energy/market-migrations").expect(200);
    await asViewer()
      .post("/energy/market-migrations")
      .send({ consumerUnitId: CONSUMER_UNIT_ID, ownerId: OWNER_ID, nextActionAt: "2026-08-10T12:00:00.000Z" })
      .expect(403);
  });

  it("rejects creating a migration without an owner or a next action (blocking rule)", async () => {
    await asOpm().post("/energy/market-migrations").send({ consumerUnitId: CONSUMER_UNIT_ID }).expect(400);
    await asOpm()
      .post("/energy/market-migrations")
      .send({ consumerUnitId: CONSUMER_UNIT_ID, ownerId: OWNER_ID })
      .expect(400);
  });

  it("creates a migration with owner + next action and records an event", async () => {
    const response = await asOpm()
      .post("/energy/market-migrations")
      .send({ consumerUnitId: CONSUMER_UNIT_ID, ownerId: OWNER_ID, nextActionAt: "2026-08-10T12:00:00.000Z" })
      .expect(201);

    expect(response.body.ownerId).toBe(OWNER_ID);
    expect(response.body.stage).toBe("analise");
    expect(repository.events.some((event) => event.eventName === "energy.market_migration_created")).toBe(true);
  });

  it("blocks skipping a stage", async () => {
    const id = "00000000-0000-4000-8000-000000000902";
    repository.seedMigration({ id, stage: "analise" });

    await asOpm().post(`/energy/market-migrations/${id}/stage`).send({ stage: "documentacao" }).expect(400);
  });

  it("blocks advancing a stage without owner/next action (blocking rule)", async () => {
    const id = "00000000-0000-4000-8000-000000000903";
    repository.seedMigration({ id, stage: "analise", ownerId: null, nextActionAt: null });

    await asOpm().post(`/energy/market-migrations/${id}/stage`).send({ stage: "contratacao" }).expect(400);
  });

  it("advances a migration through the stage sequence and audits every step", async () => {
    const id = "00000000-0000-4000-8000-000000000904";
    repository.seedMigration({ id, stage: "analise" });

    await asOpm().post(`/energy/market-migrations/${id}/stage`).send({ stage: "contratacao" }).expect(200);
    await asOpm().post(`/energy/market-migrations/${id}/stage`).send({ stage: "documentacao" }).expect(200);
    await asOpm().post(`/energy/market-migrations/${id}/stage`).send({ stage: "denuncia" }).expect(200);
    const final = await asOpm().post(`/energy/market-migrations/${id}/stage`).send({ stage: "ativacao" }).expect(200);

    expect(final.body.stage).toBe("ativacao");
    const stageEvents = repository.events.filter(
      (event) => event.eventName === "energy.market_migration_stage_advanced" && event.entityId === id,
    );
    expect(stageEvents).toHaveLength(4);
  });

  it("blocks cancelling a migration without a reason (blocking rule)", async () => {
    const id = "00000000-0000-4000-8000-000000000905";
    repository.seedMigration({ id });

    await asOpm().post(`/energy/market-migrations/${id}/cancel`).send({}).expect(400);
    await asOpm().post(`/energy/market-migrations/${id}/cancel`).send({ cancelReason: "" }).expect(400);
  });

  it("cancels a migration with a reason and audits it", async () => {
    const id = "00000000-0000-4000-8000-000000000906";
    repository.seedMigration({ id });

    const response = await asOpm()
      .post(`/energy/market-migrations/${id}/cancel`)
      .send({ cancelReason: "Cliente desistiu" })
      .expect(200);

    expect(response.body.status).toBe("cancelada");
    expect(response.body.cancelReason).toBe("Cliente desistiu");
  });

  it("blocks re-cancelling an already decided migration", async () => {
    const id = "00000000-0000-4000-8000-000000000907";
    repository.seedMigration({ id, status: "cancelada", cancelReason: "Já cancelada" });

    await asOpm().post(`/energy/market-migrations/${id}/cancel`).send({ cancelReason: "outra vez" }).expect(400);
  });

  it("rejects activation with both a linked client and a new client", async () => {
    const id = "00000000-0000-4000-8000-000000000908";
    repository.seedMigration({ id });

    await asOpm()
      .post(`/energy/market-migrations/${id}/activate`)
      .send({ clientId: CLIENT_ID, newClient: { name: "Hotel Rio Negro" } })
      .expect(400);
  });

  it("rejects activation without a linked client or a new client", async () => {
    const id = "00000000-0000-4000-8000-000000000909";
    repository.seedMigration({ id });

    await asOpm().post(`/energy/market-migrations/${id}/activate`).send({}).expect(400);
  });

  it("activates a migration by linking an existing client and audits it", async () => {
    const id = "00000000-0000-4000-8000-000000000910";
    repository.seedMigration({ id });

    const response = await asOpm()
      .post(`/energy/market-migrations/${id}/activate`)
      .send({ clientId: CLIENT_ID })
      .expect(200);

    expect(response.body.status).toBe("ativa");
    expect(response.body.clientId).toBe(CLIENT_ID);
    expect(response.body.activatedAt).not.toBeNull();
    expect(
      repository.events.some((event) => event.eventName === "energy.market_migration_activated" && event.entityId === id),
    ).toBe(true);
  });

  it("activates a migration by creating a new client when there is no match", async () => {
    const id = "00000000-0000-4000-8000-000000000911";
    repository.seedMigration({ id });

    const response = await asOpm()
      .post(`/energy/market-migrations/${id}/activate`)
      .send({ newClient: { name: "Amazonas Clean", email: "financeiro@amazonasclean.com" } })
      .expect(200);

    expect(response.body.status).toBe("ativa");
    expect(response.body.clientId).not.toBeNull();
  });

  it("blocks activating a migration without owner/next action (blocking rule)", async () => {
    const id = "00000000-0000-4000-8000-000000000912";
    repository.seedMigration({ id, ownerId: null, nextActionAt: null });

    await asOpm().post(`/energy/market-migrations/${id}/activate`).send({ clientId: CLIENT_ID }).expect(400);
  });

  it("blocks activating an already decided migration", async () => {
    const id = "00000000-0000-4000-8000-000000000913";
    repository.seedMigration({ id, status: "cancelada", cancelReason: "x" });

    await asOpm().post(`/energy/market-migrations/${id}/activate`).send({ clientId: CLIENT_ID }).expect(400);
  });

  it("returns 404 for mutations against an unknown migration", async () => {
    const missing = "00000000-0000-4000-8000-000000000999";
    await asOpm().post(`/energy/market-migrations/${missing}/cancel`).send({ cancelReason: "x" }).expect(404);
  });
});
