import { NotFoundException, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type {
  AuditDetail,
  ContestationDetail,
  CreateAuditRequest,
  CreateContestationRequest,
  ListAuditsResponse,
  ListConsumerUnitsResponse,
  ListContestationsResponse,
  ListCyclesResponse,
  ListMarketMigrationsResponse,
  ResolveAuditRequest,
  UpdateContestationStatusRequest,
} from "@plugga/shared";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module";
import type { AuthPrincipal } from "../src/core/auth/auth.types";
import { EnergyRepository } from "../src/energy/energy.repository";
import {
  assertAuditCanBeResolved,
  assertAuditCanOpenContestation,
  assertAuditHasNoContestation,
  assertAuditIsContestationType,
  assertAuditOriginMatchesLinks,
  assertContestationCanClose,
  assertContestationTransitionAllowed,
} from "../src/energy/energy.rules";

const CYCLE_ID = "00000000-0000-4000-8000-000000000501";
const MIGRATION_ID = "00000000-0000-4000-8000-000000000502";
const OWNER_ID = "00000000-0000-4000-8000-000000000503";

type RecordedEvent = { eventName: string; entityType: string; entityId: string; actorId: string; payload: unknown };

/**
 * In-memory double implementing the same abstract EnergyRepository the real
 * Prisma adapter implements, mirroring commercial.e2e.spec.ts. It re-uses the
 * exact same guard functions from energy.rules.ts the Prisma repository
 * calls, so this double can't silently drift from production behavior.
 */
class InMemoryEnergyRepository extends EnergyRepository {
  private audits = new Map<string, AuditDetail>();
  private contestations = new Map<string, ContestationDetail>();
  private sequence = 0;
  readonly events: RecordedEvent[] = [];

  private nextId(prefix: string): string {
    this.sequence += 1;
    return `00000000-0000-4000-8000-${prefix}${String(this.sequence).padStart(6, "0")}`;
  }

  private record(eventName: string, entityType: string, entityId: string, principal: AuthPrincipal, payload: unknown) {
    this.events.push({ eventName, entityType, entityId, actorId: principal.id, payload });
  }

  seedAudit(overrides: Partial<AuditDetail> & { id: string }): AuditDetail {
    const audit: AuditDetail = {
      origin: "avulsa",
      type: "contestacao",
      status: "divergencia_encontrada",
      cycleId: null,
      marketMigrationId: null,
      summary: "divergência de demanda",
      divergenceBlocksClosing: false,
      createdById: null,
      contestationId: null,
      createdAt: "2026-08-01T12:00:00.000Z",
      updatedAt: "2026-08-01T12:00:00.000Z",
      ...overrides,
    };
    this.audits.set(audit.id, audit);
    return audit;
  }

  async listConsumerUnits(): Promise<ListConsumerUnitsResponse> {
    return { items: [] };
  }

  async listMarketMigrations(): Promise<ListMarketMigrationsResponse> {
    return { items: [] };
  }

  async listCycles(): Promise<ListCyclesResponse> {
    return { items: [] };
  }

  async listAudits(): Promise<ListAuditsResponse> {
    return { items: [...this.audits.values()] };
  }

  async audit(id: string): Promise<AuditDetail> {
    const found = this.audits.get(id);
    if (!found) throw new NotFoundException("audit not found");
    return found;
  }

  async createAudit(input: CreateAuditRequest, principal: AuthPrincipal): Promise<AuditDetail> {
    assertAuditOriginMatchesLinks(input.origin, input.cycleId, input.marketMigrationId);
    const id = this.nextId("aud");
    const created = this.seedAudit({
      id,
      origin: input.origin,
      type: input.type,
      status: "em_analise",
      cycleId: input.cycleId ?? null,
      marketMigrationId: input.marketMigrationId ?? null,
      summary: input.summary ?? null,
      divergenceBlocksClosing: input.divergenceBlocksClosing ?? false,
      createdById: principal.id,
    });
    this.record("energy.audit_created", "audit", id, principal, input);
    return created;
  }

  async resolveAudit(id: string, input: ResolveAuditRequest, principal: AuthPrincipal): Promise<AuditDetail> {
    const current = await this.audit(id);
    assertAuditCanBeResolved(current.status);
    const updated: AuditDetail = { ...current, status: input.status, summary: input.summary ?? current.summary };
    this.audits.set(id, updated);
    this.record("energy.audit_resolved", "audit", id, principal, { from: current.status, to: input.status });
    return updated;
  }

  async listContestations(): Promise<ListContestationsResponse> {
    return { items: [...this.contestations.values()] };
  }

  async contestation(id: string): Promise<ContestationDetail> {
    const found = this.contestations.get(id);
    if (!found) throw new NotFoundException("contestation not found");
    return found;
  }

  async createContestation(input: CreateContestationRequest, principal: AuthPrincipal): Promise<ContestationDetail> {
    const audit = await this.audit(input.auditId);
    assertAuditIsContestationType(audit.type);
    assertAuditCanOpenContestation(audit.status);
    assertAuditHasNoContestation(audit.contestationId !== null);

    const id = this.nextId("cont");
    const created: ContestationDetail = {
      id,
      auditId: input.auditId,
      distributor: input.distributor,
      reason: input.reason,
      estimatedAmount: input.estimatedAmount,
      protocol: input.protocol,
      openedAt: input.openedAt,
      expectedResponseAt: input.expectedResponseAt,
      status: "rascunho",
      ownerId: input.ownerId,
      financialResult: null,
      createdAt: "2026-08-05T12:00:00.000Z",
      updatedAt: "2026-08-05T12:00:00.000Z",
    };
    this.contestations.set(id, created);
    this.audits.set(audit.id, { ...audit, status: "contestacao_aberta", contestationId: id });
    this.record("energy.contestation_created", "contestation", id, principal, input);
    return created;
  }

  async updateContestationStatus(
    id: string,
    input: UpdateContestationStatusRequest,
    principal: AuthPrincipal,
  ): Promise<ContestationDetail> {
    const current = await this.contestation(id);
    assertContestationTransitionAllowed(current.status, input.status);
    const financialResult = input.financialResult ?? current.financialResult;
    assertContestationCanClose(input.status, financialResult);

    const updated: ContestationDetail = { ...current, status: input.status, financialResult };
    this.contestations.set(id, updated);
    this.record("energy.contestation_status_updated", "contestation", id, principal, {
      from: current.status,
      to: input.status,
    });
    return updated;
  }
}

describe("energy audits/contestations API (e2e)", () => {
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
      post: (path: string) =>
        request(app.getHttpServer()).post(path).set("x-dev-principal", "local-opm").set("x-dev-roles", "opm"),
    };
  }

  function asFinanceiro() {
    return {
      post: (path: string) =>
        request(app.getHttpServer()).post(path).set("x-dev-principal", "local-financeiro").set("x-dev-roles", "financeiro"),
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

  it("requires authentication to read audits", async () => {
    await request(app.getHttpServer()).get("/energy/audits").expect(401);
  });

  it("allows a broad read role to list audits but not open one (RBAC)", async () => {
    await asViewer().get("/energy/audits").expect(200);
    await asViewer()
      .post("/energy/audits")
      .send({ origin: "avulsa", type: "oportunidade" })
      .expect(403);
  });

  it("rejects opening an audit whose origin is incoherent with its FKs (validation before insert)", async () => {
    await asOpm()
      .post("/energy/audits")
      .send({ origin: "ciclo_mensal", type: "conferencia_fatura" })
      .expect(400);

    await asOpm()
      .post("/energy/audits")
      .send({ origin: "avulsa", type: "oportunidade", cycleId: CYCLE_ID })
      .expect(400);

    await asOpm()
      .post("/energy/audits")
      .send({ origin: "migracao_ml", type: "validacao_migracao", cycleId: CYCLE_ID, marketMigrationId: MIGRATION_ID })
      .expect(400);
  });

  it("opens an audit with a coherent origin/FK and records an event", async () => {
    const response = await asOpm()
      .post("/energy/audits")
      .send({ origin: "ciclo_mensal", type: "conferencia_fatura", cycleId: CYCLE_ID })
      .expect(201);

    expect(response.body.origin).toBe("ciclo_mensal");
    expect(response.body.cycleId).toBe(CYCLE_ID);
    expect(repository.events.some((event) => event.eventName === "energy.audit_created")).toBe(true);
  });

  it("resolves an audit and records an event", async () => {
    const id = "00000000-0000-4000-8000-000000000601";
    repository.seedAudit({ id, type: "conferencia_fatura", status: "divergencia_encontrada" });

    const response = await asOpm().post(`/energy/audits/${id}/resolve`).send({ status: "sem_divergencia" }).expect(200);

    expect(response.body.status).toBe("sem_divergencia");
    expect(repository.events.some((event) => event.eventName === "energy.audit_resolved" && event.entityId === id)).toBe(true);
  });

  it("blocks resolving an already-resolved audit (blocking rule)", async () => {
    const id = "00000000-0000-4000-8000-000000000602";
    repository.seedAudit({ id, status: "resolvida" });

    await asOpm().post(`/energy/audits/${id}/resolve`).send({ status: "inconclusiva" }).expect(400);
  });

  it("rejects opening a contestation from an audit whose type is not contestacao (blocking rule)", async () => {
    const id = "00000000-0000-4000-8000-000000000603";
    repository.seedAudit({ id, type: "conferencia_fatura" });

    await asOpm()
      .post("/energy/contestations")
      .send({
        auditId: id,
        distributor: "Amazonas Energia",
        reason: "Demanda ultrapassagem",
        estimatedAmount: "1240.00",
        protocol: "PROT-1",
        openedAt: "2026-08-06T12:00:00.000Z",
        expectedResponseAt: "2026-09-06T12:00:00.000Z",
        ownerId: OWNER_ID,
      })
      .expect(400);
  });

  it("rejects opening a contestation from a non-existent audit (never created loose)", async () => {
    await asOpm()
      .post("/energy/contestations")
      .send({
        auditId: "00000000-0000-4000-8000-000000009999",
        distributor: "Amazonas Energia",
        reason: "Demanda ultrapassagem",
        estimatedAmount: "1240.00",
        protocol: "PROT-2",
        openedAt: "2026-08-06T12:00:00.000Z",
        expectedResponseAt: "2026-09-06T12:00:00.000Z",
        ownerId: OWNER_ID,
      })
      .expect(404);
  });

  it("opens a contestation from a contestacao-type audit, moves the audit status, and records an event", async () => {
    const auditId = "00000000-0000-4000-8000-000000000604";
    repository.seedAudit({ id: auditId, type: "contestacao", status: "divergencia_encontrada" });

    const response = await asOpm()
      .post("/energy/contestations")
      .send({
        auditId,
        distributor: "Amazonas Energia",
        reason: "Demanda ultrapassagem",
        estimatedAmount: "1240.00",
        protocol: "PROT-3",
        openedAt: "2026-08-06T12:00:00.000Z",
        expectedResponseAt: "2026-09-06T12:00:00.000Z",
        ownerId: OWNER_ID,
      })
      .expect(201);

    expect(response.body.status).toBe("rascunho");
    expect(response.body.auditId).toBe(auditId);

    const auditResponse = await asOpm().get(`/energy/audits/${auditId}`).expect(200);
    expect(auditResponse.body.status).toBe("contestacao_aberta");
    expect(auditResponse.body.contestationId).toBe(response.body.id);
    expect(repository.events.some((event) => event.eventName === "energy.contestation_created")).toBe(true);
  });

  it("blocks skipping a contestation status transition (RESOLVE_CONTESTATION role, sequence rule)", async () => {
    const auditId = "00000000-0000-4000-8000-000000000605";
    repository.seedAudit({ id: auditId, type: "contestacao", status: "divergencia_encontrada" });
    const contestation = await repository.createContestation(
      {
        auditId,
        distributor: "Amazonas Energia",
        reason: "Demanda ultrapassagem",
        estimatedAmount: "1240.00",
        protocol: "PROT-4",
        openedAt: "2026-08-06T12:00:00.000Z",
        expectedResponseAt: "2026-09-06T12:00:00.000Z",
        ownerId: OWNER_ID,
      },
      { id: OWNER_ID, kind: "user", roles: ["opm"] },
    );

    await asFinanceiro().post(`/energy/contestations/${contestation.id}/status`).send({ status: "encerrada" }).expect(400);
  });

  it("only RESOLVE_CONTESTATION roles can transition a contestation (RBAC)", async () => {
    const auditId = "00000000-0000-4000-8000-000000000606";
    repository.seedAudit({ id: auditId, type: "contestacao", status: "divergencia_encontrada" });
    const contestation = await repository.createContestation(
      {
        auditId,
        distributor: "Amazonas Energia",
        reason: "Demanda ultrapassagem",
        estimatedAmount: "1240.00",
        protocol: "PROT-5",
        openedAt: "2026-08-06T12:00:00.000Z",
        expectedResponseAt: "2026-09-06T12:00:00.000Z",
        ownerId: OWNER_ID,
      },
      { id: OWNER_ID, kind: "user", roles: ["opm"] },
    );

    await asOpm().post(`/energy/contestations/${contestation.id}/status`).send({ status: "aberta" }).expect(403);

    const response = await asFinanceiro()
      .post(`/energy/contestations/${contestation.id}/status`)
      .send({ status: "aberta" })
      .expect(200);
    expect(response.body.status).toBe("aberta");
  });

  it("blocks closing a contestation without a financial result (blocking rule)", async () => {
    const auditId = "00000000-0000-4000-8000-000000000607";
    repository.seedAudit({ id: auditId, type: "contestacao", status: "divergencia_encontrada" });
    const contestation = await repository.createContestation(
      {
        auditId,
        distributor: "Amazonas Energia",
        reason: "Demanda ultrapassagem",
        estimatedAmount: "1240.00",
        protocol: "PROT-6",
        openedAt: "2026-08-06T12:00:00.000Z",
        expectedResponseAt: "2026-09-06T12:00:00.000Z",
        ownerId: OWNER_ID,
      },
      { id: OWNER_ID, kind: "user", roles: ["opm"] },
    );
    await repository.updateContestationStatus(contestation.id, { status: "aberta" }, { id: OWNER_ID, kind: "user", roles: ["opm"] });
    await repository.updateContestationStatus(
      contestation.id,
      { status: "aguardando_distribuidora" },
      { id: OWNER_ID, kind: "user", roles: ["opm"] },
    );
    await repository.updateContestationStatus(
      contestation.id,
      { status: "deferida" },
      { id: OWNER_ID, kind: "user", roles: ["opm"] },
    );

    await asFinanceiro().post(`/energy/contestations/${contestation.id}/status`).send({ status: "encerrada" }).expect(400);

    const response = await asFinanceiro()
      .post(`/energy/contestations/${contestation.id}/status`)
      .send({ status: "encerrada", financialResult: "980.00" })
      .expect(200);
    expect(response.body.status).toBe("encerrada");
    expect(response.body.financialResult).toBe("980.00");
  });
});
