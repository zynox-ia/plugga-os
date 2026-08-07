import { BadRequestException, NotFoundException, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type {
  ContractDetail,
  ContractList,
  ContractListQuery,
  ContractStatus,
  CreateContractRequest,
  CreateOpportunityRequest,
  LoseOpportunityRequest,
  OpportunityContactRequest,
  OpportunityDetail,
  OpportunityList,
  OpportunityListQuery,
  RevisitOpportunityRequest,
  UpdateContractStatusRequest,
  UpdateOpportunityStageRequest,
  WinOpportunityRequest,
} from "@plugga/shared";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module";
import { CommercialRepository } from "../src/commercial/commercial.repository";
import {
  assertContractCanActivate,
  assertContractHasOwnerAndNextAction,
  assertContractTransitionAllowed,
  assertOpportunityHasOwnerAndNextAction,
  assertOpportunityOpen,
} from "../src/commercial/commercial.rules";
import type { AuthPrincipal } from "../src/core/auth/auth.types";

const OWNER_ID = "00000000-0000-4000-8000-000000000201";
const OTHER_OWNER_ID = "00000000-0000-4000-8000-000000000202";
const CLIENT_ID = "00000000-0000-4000-8000-000000000301";

type StoredOpportunity = OpportunityDetail;
type StoredContract = ContractDetail;

type RecordedEvent = { eventName: string; entityType: string; entityId: string; actorId: string; payload: unknown };

/**
 * In-memory double implementing the same abstract CommercialRepository the
 * real Prisma adapter implements (ADR pattern already used by
 * read-only-inventory.e2e.spec.ts), so this suite exercises real HTTP + RBAC
 * + Zod validation without a live Postgres (unavailable in this sandbox — see
 * PR notes). It re-uses the exact same guard functions the Prisma repository
 * calls (commercial.rules.ts) rather than re-implementing the rules, so this
 * double can't silently drift from production behavior.
 */
class InMemoryCommercialRepository extends CommercialRepository {
  private opportunities = new Map<string, StoredOpportunity>();
  private contracts = new Map<string, StoredContract>();
  private sequence = 0;
  readonly events: RecordedEvent[] = [];

  private nextId(prefix: string): string {
    this.sequence += 1;
    return `00000000-0000-4000-8000-${prefix}${String(this.sequence).padStart(6, "0")}`;
  }

  private record(eventName: string, entityType: string, entityId: string, principal: AuthPrincipal, payload: unknown) {
    this.events.push({ eventName, entityType, entityId, actorId: principal.id, payload });
  }

  seedOpportunity(overrides: Partial<StoredOpportunity> & { id: string }): StoredOpportunity {
    const opportunity: StoredOpportunity = {
      title: "Oportunidade seed",
      product: "OPM",
      stage: "leads",
      status: "aberta",
      ownerId: OWNER_ID,
      ownerName: "Ana",
      clientId: null,
      clientName: null,
      estimatedValue: null,
      nextActionAt: "2026-08-10T12:00:00.000Z",
      nextActionNote: "Ligar amanhã",
      lossReason: null,
      decidedAt: null,
      createdAt: "2026-08-01T12:00:00.000Z",
      updatedAt: "2026-08-01T12:00:00.000Z",
      contacts: [],
      contracts: [],
      ...overrides,
    };
    this.opportunities.set(opportunity.id, opportunity);
    return opportunity;
  }

  seedContract(overrides: Partial<StoredContract> & { id: string }): StoredContract {
    const contract: StoredContract = {
      status: "rascunho",
      clientId: CLIENT_ID,
      clientName: "Hotel Rio Negro",
      opportunityId: null,
      ownerId: null,
      ownerName: null,
      startsAt: null,
      endsAt: null,
      signedAt: null,
      nextActionAt: null,
      nextActionNote: null,
      createdAt: "2026-08-01T12:00:00.000Z",
      updatedAt: "2026-08-01T12:00:00.000Z",
      ...overrides,
    };
    this.contracts.set(contract.id, contract);
    return contract;
  }

  async listOpportunities(query: OpportunityListQuery): Promise<OpportunityList> {
    return {
      items: [...this.opportunities.values()].filter(
        (item) =>
          (!query.stage || item.stage === query.stage) &&
          (!query.status || item.status === query.status) &&
          (!query.ownerId || item.ownerId === query.ownerId),
      ),
    };
  }

  async opportunity(id: string): Promise<OpportunityDetail> {
    const found = this.opportunities.get(id);
    if (!found) throw new NotFoundException("opportunity not found");
    return found;
  }

  async createOpportunity(input: CreateOpportunityRequest, principal: AuthPrincipal): Promise<OpportunityDetail> {
    const id = this.nextId("opp");
    const created = this.seedOpportunity({
      id,
      title: input.title,
      product: input.product,
      ownerId: input.ownerId,
      ownerName: input.ownerId === OWNER_ID ? "Ana" : "Outro",
      clientId: input.clientId ?? null,
      nextActionAt: input.nextActionAt,
      nextActionNote: input.nextActionNote ?? null,
      estimatedValue: input.estimatedValue ?? null,
    });
    this.record("commercial.opportunity_created", "opportunity", id, principal, input);
    return created;
  }

  async updateOpportunityStage(
    id: string,
    input: UpdateOpportunityStageRequest,
    principal: AuthPrincipal,
  ): Promise<OpportunityDetail> {
    const current = await this.opportunity(id);
    assertOpportunityOpen(current.status);
    const nextOwnerId = input.ownerId ?? current.ownerId;
    const nextActionAt = input.nextActionAt ?? current.nextActionAt;
    assertOpportunityHasOwnerAndNextAction(nextOwnerId, nextActionAt ? new Date(nextActionAt) : null);
    const updated: StoredOpportunity = {
      ...current,
      stage: input.stage,
      ownerId: nextOwnerId,
      nextActionAt,
      nextActionNote: input.nextActionNote ?? current.nextActionNote,
    };
    this.opportunities.set(id, updated);
    this.record("commercial.opportunity_stage_updated", "opportunity", id, principal, input);
    return updated;
  }

  async registerOpportunityContact(
    id: string,
    input: OpportunityContactRequest,
    principal: AuthPrincipal,
  ): Promise<OpportunityDetail> {
    const current = await this.opportunity(id);
    const contactId = this.nextId("contact");
    const updated: StoredOpportunity = {
      ...current,
      contacts: [
        ...current.contacts,
        { id: contactId, opportunityId: id, channel: input.channel, outcome: input.outcome, note: input.note ?? null, createdAt: "2026-08-05T12:00:00.000Z" },
      ],
    };
    this.opportunities.set(id, updated);
    this.record("commercial.opportunity_contact_registered", "opportunity_contact", contactId, principal, input);
    return updated;
  }

  async winOpportunity(id: string, input: WinOpportunityRequest, principal: AuthPrincipal): Promise<OpportunityDetail> {
    const current = await this.opportunity(id);
    assertOpportunityOpen(current.status);
    const clientId = input.clientId ?? this.nextId("client");
    const updated: StoredOpportunity = { ...current, status: "ganha", clientId, decidedAt: "2026-08-06T12:00:00.000Z" };
    this.opportunities.set(id, updated);
    this.record("commercial.opportunity_won", "opportunity", id, principal, { clientId });
    return updated;
  }

  async loseOpportunity(id: string, input: LoseOpportunityRequest, principal: AuthPrincipal): Promise<OpportunityDetail> {
    const current = await this.opportunity(id);
    assertOpportunityOpen(current.status);
    const updated: StoredOpportunity = {
      ...current,
      status: "perdida",
      lossReason: input.lossReason,
      decidedAt: "2026-08-06T12:00:00.000Z",
    };
    this.opportunities.set(id, updated);
    this.record("commercial.opportunity_lost", "opportunity", id, principal, input);
    return updated;
  }

  async revisitOpportunity(
    id: string,
    input: RevisitOpportunityRequest,
    principal: AuthPrincipal,
  ): Promise<OpportunityDetail> {
    const current = await this.opportunity(id);
    assertOpportunityOpen(current.status);
    const nextOwnerId = input.ownerId ?? current.ownerId;
    const updated: StoredOpportunity = {
      ...current,
      status: "revisitar",
      ownerId: nextOwnerId,
      nextActionAt: input.nextActionAt,
      nextActionNote: input.nextActionNote,
    };
    this.opportunities.set(id, updated);
    this.record("commercial.opportunity_revisit_scheduled", "opportunity", id, principal, input);
    return updated;
  }

  async listContracts(query: ContractListQuery): Promise<ContractList> {
    return {
      items: [...this.contracts.values()].filter(
        (item) =>
          (!query.status || item.status === query.status) &&
          (!query.clientId || item.clientId === query.clientId) &&
          (!query.ownerId || item.ownerId === query.ownerId),
      ),
    };
  }

  async contract(id: string): Promise<ContractDetail> {
    const found = this.contracts.get(id);
    if (!found) throw new NotFoundException("contract not found");
    return found;
  }

  async createContract(input: CreateContractRequest, principal: AuthPrincipal): Promise<ContractDetail> {
    let clientId: string;
    let opportunityId: string | null = null;

    if (input.opportunityId) {
      const opportunity = await this.opportunity(input.opportunityId);
      if (opportunity.status !== "ganha") {
        throw new BadRequestException("um contrato só nasce de uma oportunidade ganha");
      }
      clientId = opportunity.clientId!;
      opportunityId = opportunity.id;
    } else {
      clientId = input.clientId!;
    }

    const id = this.nextId("contract");
    const created = this.seedContract({
      id,
      clientId,
      opportunityId,
      ownerId: input.ownerId ?? null,
      nextActionAt: input.nextActionAt ?? null,
      nextActionNote: input.nextActionNote ?? null,
    });
    this.record("commercial.contract_created", "contract", id, principal, input);
    return created;
  }

  async updateContractStatus(
    id: string,
    input: UpdateContractStatusRequest,
    principal: AuthPrincipal,
  ): Promise<ContractDetail> {
    const current = await this.contract(id);
    assertContractTransitionAllowed(current.status as ContractStatus, input.status);

    const nextOwnerId = input.ownerId ?? current.ownerId;
    const nextActionAt = input.nextActionAt ?? current.nextActionAt;
    const signedAt = input.signedAt ?? current.signedAt;

    if (input.status === "ativo") {
      assertContractCanActivate(signedAt ? new Date(signedAt) : null);
    }
    assertContractHasOwnerAndNextAction(input.status, nextOwnerId, nextActionAt ? new Date(nextActionAt) : null);

    const updated: StoredContract = {
      ...current,
      status: input.status,
      ownerId: nextOwnerId,
      nextActionAt,
      nextActionNote: input.nextActionNote ?? current.nextActionNote,
      signedAt,
      startsAt: input.startsAt ?? current.startsAt,
      endsAt: input.endsAt ?? current.endsAt,
    };
    this.contracts.set(id, updated);
    this.record("commercial.contract_status_updated", "contract", id, principal, { from: current.status, to: input.status });
    return updated;
  }
}

describe("commercial API (e2e)", () => {
  let app: INestApplication;
  let repository: InMemoryCommercialRepository;

  beforeAll(async () => {
    repository = new InMemoryCommercialRepository();

    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CommercialRepository)
      .useValue(repository)
      .compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  function asComercial() {
    return {
      get: (path: string) =>
        request(app.getHttpServer()).get(path).set("x-dev-principal", "local-comercial").set("x-dev-roles", "comercial"),
      post: (path: string) =>
        request(app.getHttpServer()).post(path).set("x-dev-principal", "local-comercial").set("x-dev-roles", "comercial"),
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

  it("requires authentication to read opportunities", async () => {
    await request(app.getHttpServer()).get("/commercial/opportunities").expect(401);
  });

  it("allows a broad read role to list opportunities but not mutate them", async () => {
    repository.seedOpportunity({ id: "00000000-0000-4000-8000-000000000401" });

    await asViewer().get("/commercial/opportunities").expect(200);
    await asViewer()
      .post("/commercial/opportunities")
      .send({ title: "x", product: "OPM", ownerId: OWNER_ID, nextActionAt: "2026-08-10T12:00:00.000Z" })
      .expect(403);
  });

  it("rejects creating an opportunity without an owner or a next action (blocking rule)", async () => {
    await asComercial()
      .post("/commercial/opportunities")
      .send({ title: "Sem dono", product: "OPM" })
      .expect(400);

    await asComercial()
      .post("/commercial/opportunities")
      .send({ title: "Sem próxima ação", product: "OPM", ownerId: OWNER_ID })
      .expect(400);
  });

  it("creates an opportunity with owner + next action and records an event", async () => {
    const response = await asComercial()
      .post("/commercial/opportunities")
      .send({ title: "Solar Norte", product: "OPM", ownerId: OWNER_ID, nextActionAt: "2026-08-10T12:00:00.000Z" })
      .expect(201);

    expect(response.body.ownerId).toBe(OWNER_ID);
    expect(repository.events.some((event) => event.eventName === "commercial.opportunity_created")).toBe(true);
  });

  it("blocks marking an opportunity as won without a client (blocking rule)", async () => {
    const id = "00000000-0000-4000-8000-000000000402";
    repository.seedOpportunity({ id });

    await asComercial().post(`/commercial/opportunities/${id}/win`).send({}).expect(400);
  });

  it("wins an opportunity when a client is linked and audits the decision", async () => {
    const id = "00000000-0000-4000-8000-000000000403";
    repository.seedOpportunity({ id });

    const response = await asComercial()
      .post(`/commercial/opportunities/${id}/win`)
      .send({ clientId: CLIENT_ID })
      .expect(200);

    expect(response.body.status).toBe("ganha");
    expect(response.body.clientId).toBe(CLIENT_ID);
    expect(repository.events.some((event) => event.eventName === "commercial.opportunity_won" && event.entityId === id)).toBe(true);
  });

  it("blocks marking an opportunity as lost without a reason (blocking rule)", async () => {
    const id = "00000000-0000-4000-8000-000000000404";
    repository.seedOpportunity({ id });

    await asComercial().post(`/commercial/opportunities/${id}/lose`).send({}).expect(400);
    await asComercial().post(`/commercial/opportunities/${id}/lose`).send({ lossReason: "" }).expect(400);
  });

  it("marks an opportunity as lost with a reason and audits it", async () => {
    const id = "00000000-0000-4000-8000-000000000405";
    repository.seedOpportunity({ id });

    const response = await asComercial()
      .post(`/commercial/opportunities/${id}/lose`)
      .send({ lossReason: "Orçamento insuficiente" })
      .expect(200);

    expect(response.body.status).toBe("perdida");
    expect(response.body.lossReason).toBe("Orçamento insuficiente");
  });

  it("blocks revisiting an opportunity without a next action and note (blocking rule)", async () => {
    const id = "00000000-0000-4000-8000-000000000406";
    repository.seedOpportunity({ id });

    await asComercial().post(`/commercial/opportunities/${id}/revisit`).send({}).expect(400);
  });

  it("schedules a revisit with a next action and note", async () => {
    const id = "00000000-0000-4000-8000-000000000407";
    repository.seedOpportunity({ id });

    const response = await asComercial()
      .post(`/commercial/opportunities/${id}/revisit`)
      .send({ nextActionAt: "2026-09-01T12:00:00.000Z", nextActionNote: "Retomar após reajuste" })
      .expect(200);

    expect(response.body.status).toBe("revisitar");
  });

  it("registers a contact against an opportunity", async () => {
    const id = "00000000-0000-4000-8000-000000000408";
    repository.seedOpportunity({ id });

    const response = await asComercial()
      .post(`/commercial/opportunities/${id}/contacts`)
      .send({ channel: "whatsapp", outcome: "connected", note: "Retornou o contato" })
      .expect(200);

    expect(response.body.contacts).toHaveLength(1);
  });

  it("rejects a contract created from an opportunity that has not been won", async () => {
    const id = "00000000-0000-4000-8000-000000000409";
    repository.seedOpportunity({ id, status: "aberta" });

    await asComercial().post("/commercial/contracts").send({ opportunityId: id }).expect(400);
  });

  it("creates a contract directly on an existing client", async () => {
    const response = await asComercial().post("/commercial/contracts").send({ clientId: CLIENT_ID }).expect(201);
    expect(response.body.status).toBe("rascunho");
    expect(repository.events.some((event) => event.eventName === "commercial.contract_created")).toBe(true);
  });

  it("blocks skipping a contract status in the sequence", async () => {
    const id = "00000000-0000-4000-8000-000000000501";
    repository.seedContract({ id, status: "rascunho" });

    await asComercial().post(`/commercial/contracts/${id}/status`).send({ status: "ativo" }).expect(400);
  });

  it("blocks a contract without owner/next action from entering revisão interna (blocking rule)", async () => {
    const id = "00000000-0000-4000-8000-000000000502";
    repository.seedContract({ id, status: "rascunho" });

    await asComercial().post(`/commercial/contracts/${id}/status`).send({ status: "revisao_interna" }).expect(400);
  });

  it("blocks marking a contract active without a confirmed signature", async () => {
    const id = "00000000-0000-4000-8000-000000000503";
    repository.seedContract({
      id,
      status: "aguardando_assinatura",
      ownerId: OTHER_OWNER_ID,
      nextActionAt: "2026-08-15T12:00:00.000Z",
    });

    await asComercial().post(`/commercial/contracts/${id}/status`).send({ status: "ativo" }).expect(400);
  });

  it("advances a contract through the full sequence and audits every step", async () => {
    const id = "00000000-0000-4000-8000-000000000504";
    repository.seedContract({ id, status: "rascunho" });

    await asComercial()
      .post(`/commercial/contracts/${id}/status`)
      .send({
        status: "revisao_interna",
        ownerId: OWNER_ID,
        nextActionAt: "2026-08-12T12:00:00.000Z",
        nextActionNote: "Revisar cláusulas",
      })
      .expect(200);

    await asComercial().post(`/commercial/contracts/${id}/status`).send({ status: "aguardando_assinatura" }).expect(200);

    await asComercial()
      .post(`/commercial/contracts/${id}/status`)
      .send({ status: "ativo", signedAt: "2026-08-20T12:00:00.000Z" })
      .expect(200);

    const finalResponse = await asComercial()
      .post(`/commercial/contracts/${id}/status`)
      .send({ status: "vencendo" })
      .expect(200);
    expect(finalResponse.body.status).toBe("vencendo");

    const closed = await asComercial().post(`/commercial/contracts/${id}/status`).send({ status: "encerrado" }).expect(200);
    expect(closed.body.status).toBe("encerrado");

    const statusUpdates = repository.events.filter(
      (event) => event.eventName === "commercial.contract_status_updated" && event.entityId === id,
    );
    expect(statusUpdates).toHaveLength(5);
  });
});
