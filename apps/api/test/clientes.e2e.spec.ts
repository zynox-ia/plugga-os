import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type {
  ClientDuplicateCandidatesResponse,
  ClientFicha,
  ClientSummary,
  CreateClientRequest,
  CreateClientResponse,
  DuplicateCandidatesQuery,
  ListClientsQuery,
  ListClientsResponse,
  UpdateClientRequest,
} from "@plugga/shared";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module";
import { ClientesRepository } from "../src/clientes/clientes.repository";

const CLIENT_A: ClientSummary = {
  id: "00000000-0000-4000-8000-000000000101",
  name: "Hotel Rio Negro",
  company: "Rio Negro Hospedagens",
  phone: "+55 92 90000-0000",
  email: "contato@rionegro.example",
  externalId: "ev-1001",
  segment: "opm",
  active: true,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

const CLIENT_B: ClientSummary = {
  id: "00000000-0000-4000-8000-000000000102",
  name: "Amazonas Clean",
  company: null,
  phone: null,
  email: null,
  externalId: null,
  segment: "prospect",
  active: true,
  createdAt: "2026-08-02T00:00:00.000Z",
  updatedAt: "2026-08-02T00:00:00.000Z",
};

class InMemoryClientesRepository extends ClientesRepository {
  clients = [CLIENT_A, CLIENT_B];

  async list(query: ListClientsQuery): Promise<ListClientsResponse> {
    let items = this.clients;
    if (query.segment) items = items.filter((client) => client.segment === query.segment);
    if (query.active !== undefined) items = items.filter((client) => client.active === (query.active === "true"));
    if (query.q) {
      const term = query.q.toLowerCase();
      items = items.filter((client) =>
        [client.name, client.company, client.phone, client.email, client.externalId]
          .filter((value): value is string => !!value)
          .some((value) => value.toLowerCase().includes(term)),
      );
    }
    return { mode: "mock", items };
  }

  async get(id: string): Promise<ClientSummary> {
    const client = this.clients.find((c) => c.id === id);
    if (!client) throw new Error("not found");
    return client;
  }

  async create(input: CreateClientRequest): Promise<CreateClientResponse> {
    const client: ClientSummary = {
      id: "00000000-0000-4000-8000-000000000199",
      name: input.name,
      company: input.company ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      externalId: input.externalId ?? null,
      segment: input.segment ?? "prospect",
      active: true,
      createdAt: "2026-08-07T00:00:00.000Z",
      updatedAt: "2026-08-07T00:00:00.000Z",
    };
    this.clients.push(client);
    const duplicateCandidates = input.phone === CLIENT_A.phone
      ? [{ ...CLIENT_A, matchedOn: ["phone" as const] }]
      : [];
    return { mode: "mock", client, duplicateCandidates };
  }

  async update(id: string, input: UpdateClientRequest): Promise<ClientSummary> {
    const client = await this.get(id);
    return { ...client, ...input };
  }

  async activate(id: string): Promise<ClientSummary> {
    return { ...(await this.get(id)), active: true };
  }

  async inactivate(id: string): Promise<ClientSummary> {
    return { ...(await this.get(id)), active: false };
  }

  async duplicateCandidates(query: DuplicateCandidatesQuery): Promise<ClientDuplicateCandidatesResponse> {
    if (query.phone === CLIENT_A.phone) {
      return { mode: "mock", candidates: [{ ...CLIENT_A, matchedOn: ["phone"] }] };
    }
    return { mode: "mock", candidates: [] };
  }

  async ficha(id: string): Promise<ClientFicha> {
    const resumo = await this.get(id);
    return {
      mode: "mock",
      resumo,
      contatos: [
        { id: "00000000-0000-4000-8000-000000000201", channel: "whatsapp", outcome: "connected", note: null, createdAt: "2026-08-03T00:00:00.000Z", opportunityId: "00000000-0000-4000-8000-000000000301", opportunityTitle: "Hotel Rio Negro · OPM" },
      ],
      oportunidades: [
        { id: "00000000-0000-4000-8000-000000000301", title: "Hotel Rio Negro · OPM", product: "opm", stage: "decisao", status: "aberta", estimatedValue: "12000.00", nextActionAt: null },
      ],
      contratos: [],
      energiaOpm: { available: false, reason: "Energia & OPM ainda não tem modelo de domínio implementado neste bloco." },
      pluggamob: { available: false, reason: "Cliente sem externalId cadastrado — sem vínculo PluggaMob." },
      financeiro: { status: "em_breve", message: "Financeiro do cliente ainda não foi implementado neste bloco." },
      documentos: { status: "em_breve", message: "Documentos do cliente ainda não foi implementado neste bloco." },
      timeline: [],
      acoesDoAgente: [],
    };
  }
}

describe("clientes API (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ClientesRepository)
      .useClass(InMemoryClientesRepository)
      .compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("requires authentication", async () => {
    await request(app.getHttpServer()).get("/clientes").expect(401);
  });

  it("requires a role scoped to this domain", async () => {
    await request(app.getHttpServer())
      .get("/clientes")
      .set("x-dev-principal", "local-viewer")
      .set("x-dev-roles", "viewer")
      .expect(403);
  });

  it("searches clients by a free-text term across name/company/phone/email/externalId", async () => {
    await request(app.getHttpServer())
      .get("/clientes?q=rio negro")
      .set("x-dev-principal", "local-comercial")
      .set("x-dev-roles", "comercial")
      .expect(200)
      .expect((res) => {
        expect(res.body.items).toHaveLength(1);
        expect(res.body.items[0].id).toBe(CLIENT_A.id);
      });
  });

  it("filters by segment and active", async () => {
    await request(app.getHttpServer())
      .get("/clientes?segment=prospect&active=true")
      .set("x-dev-principal", "local-comercial")
      .set("x-dev-roles", "comercial")
      .expect(200)
      .expect((res) => {
        expect(res.body.items).toHaveLength(1);
        expect(res.body.items[0].id).toBe(CLIENT_B.id);
      });
  });

  it("rejects an unknown query parameter", async () => {
    await request(app.getHttpServer())
      .get("/clientes?bogus=1")
      .set("x-dev-principal", "local-comercial")
      .set("x-dev-roles", "comercial")
      .expect(400);
  });

  it("signals duplicate candidates on create without blocking creation", async () => {
    await request(app.getHttpServer())
      .post("/clientes")
      .set("x-dev-principal", "local-comercial")
      .set("x-dev-roles", "comercial")
      .send({ name: "Hotel Rio Negro Ltda", phone: CLIENT_A.phone })
      .expect(201)
      .expect((res) => {
        expect(res.body.client.name).toBe("Hotel Rio Negro Ltda");
        expect(res.body.duplicateCandidates).toHaveLength(1);
        expect(res.body.duplicateCandidates[0].matchedOn).toEqual(["phone"]);
      });
  });

  it("requires the comercial/admin role to create a client", async () => {
    await request(app.getHttpServer())
      .post("/clientes")
      .set("x-dev-principal", "local-tech")
      .set("x-dev-roles", "tech")
      .send({ name: "Should not be allowed" })
      .expect(403);
  });

  it("returns the ficha aggregator with placeholders for domains not implemented in this block", async () => {
    await request(app.getHttpServer())
      .get(`/clientes/${CLIENT_A.id}/ficha`)
      .set("x-dev-principal", "local-comercial")
      .set("x-dev-roles", "comercial")
      .expect(200)
      .expect((res) => {
        expect(res.body.resumo.id).toBe(CLIENT_A.id);
        expect(res.body.oportunidades).toHaveLength(1);
        expect(res.body.contatos).toHaveLength(1);
        expect(res.body.energiaOpm).toEqual({ available: false, reason: "Energia & OPM ainda não tem modelo de domínio implementado neste bloco." });
        expect(res.body.financeiro).toEqual({ status: "em_breve", message: "Financeiro do cliente ainda não foi implementado neste bloco." });
        expect(res.body.documentos.status).toBe("em_breve");
      });
  });

  it("inactivates and reactivates a client through explicit auditable actions", async () => {
    await request(app.getHttpServer())
      .post(`/clientes/${CLIENT_B.id}/inactivate`)
      .set("x-dev-principal", "local-comercial")
      .set("x-dev-roles", "comercial")
      .send({ reason: "cliente encerrou operação" })
      .expect(200)
      .expect((res) => expect(res.body.active).toBe(false));

    await request(app.getHttpServer())
      .post(`/clientes/${CLIENT_B.id}/activate`)
      .set("x-dev-principal", "local-comercial")
      .set("x-dev-roles", "comercial")
      .expect(200)
      .expect((res) => expect(res.body.active).toBe(true));
  });
});
