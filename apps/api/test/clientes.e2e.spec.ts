import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type {
  ClientContactInput,
  ClientDetail,
  ClientDuplicateCandidatesResponse,
  ClientOwnersResponse,
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
import { paraItemDeLista } from "../src/clientes/clientes.rules";
import { ClientesRepository } from "../src/clientes/clientes.repository";
import { Conflito, NaoEncontrado } from "../src/common/errors/dominio";

// Documento da faixa sintética do projeto (scripts/dados-sinteticos.mjs), com dígito verificador válido.
const CNPJ = "99999001000159";
const DONO = { id: "00000000-0000-4000-8000-000000000001", name: "Ana" };

function cliente(dados: Partial<ClientDetail> & Pick<ClientDetail, "id" | "name">): ClientDetail {
  return {
    personType: "pj",
    legalName: null,
    document: null,
    phone: null,
    email: null,
    postalCode: null,
    street: null,
    addressComplement: null,
    district: null,
    city: null,
    state: null,
    owner: DONO,
    origin: null,
    notes: null,
    rg: null,
    rgIssuer: null,
    nationality: null,
    birthDate: null,
    active: true,
    contacts: [],
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...dados,
  };
}

const CLIENT_A = cliente({ id: "00000000-0000-4000-8000-000000000101", name: "Hotel Rio Negro", document: CNPJ, phone: "92900000000" });
const CLIENT_B = cliente({ id: "00000000-0000-4000-8000-000000000102", name: "Amazonas Clean", email: "contato@clean.example" });
const CONTATO_ID = "00000000-0000-4000-8000-000000000201";

/** Repositório em memória: o teste cobre rotas, papéis e validação; as regras de banco têm teste próprio. */
class InMemoryClientesRepository extends ClientesRepository {
  clients = [CLIENT_A, CLIENT_B];

  async list(query: ListClientsQuery): Promise<ListClientsResponse> {
    const termo = query.q?.toLowerCase();
    const itens = this.clients.filter((c) => !termo || c.name.toLowerCase().includes(termo) || (c.document ?? "").includes(termo));
    return {
      items: itens.map((c) =>
        paraItemDeLista({ ...c, updatedAt: new Date(c.updatedAt), contacts: c.contacts.map((ct) => ({ ...ct, createdAt: new Date(ct.createdAt) })) }),
      ),
    };
  }

  async get(id: string): Promise<ClientDetail> {
    const encontrado = this.clients.find((c) => c.id === id);
    if (!encontrado) throw new NaoEncontrado("Cliente não encontrado.");
    return encontrado;
  }

  async create(input: CreateClientRequest): Promise<CreateClientResponse> {
    if (input.document && this.clients.some((c) => c.document === input.document)) throw new Conflito("Já existe um cliente com este CNPJ.");
    const novo = cliente({ id: "00000000-0000-4000-8000-000000000199", name: input.name, document: input.document ?? null, phone: input.phone ?? null });
    const duplicateCandidates = input.phone === CLIENT_A.phone ? [{ id: CLIENT_A.id, name: CLIENT_A.name, personType: "pj" as const, matchedOn: ["phone" as const] }] : [];
    return { client: novo, duplicateCandidates };
  }

  async update(id: string, input: UpdateClientRequest): Promise<ClientDetail> {
    return { ...(await this.get(id)), ...(input.name ? { name: input.name } : {}) };
  }

  async activate(id: string): Promise<ClientDetail> {
    return { ...(await this.get(id)), active: true };
  }

  async inactivate(id: string): Promise<ClientDetail> {
    return { ...(await this.get(id)), active: false };
  }

  async duplicateCandidates(query: DuplicateCandidatesQuery): Promise<ClientDuplicateCandidatesResponse> {
    const candidates = query.document && query.document.replace(/\D/g, "") === CNPJ
      ? [{ id: CLIENT_A.id, name: CLIENT_A.name, personType: "pj" as const, matchedOn: ["document" as const] }]
      : [];
    return { candidates };
  }

  async owners(): Promise<ClientOwnersResponse> {
    return { items: [DONO] };
  }

  async addContact(clientId: string, input: ClientContactInput): Promise<ClientDetail> {
    const atual = await this.get(clientId);
    const contato = {
      id: CONTATO_ID,
      name: input.name,
      jobTitle: input.jobTitle ?? null,
      role: input.role ?? null,
      phone: input.phone ?? null,
      phoneIsWhatsapp: input.phoneIsWhatsapp ?? false,
      email: input.email ?? null,
      isPrimary: true,
      cpf: input.cpf ?? null,
      rg: input.rg ?? null,
      createdAt: "2026-10-19T00:00:00.000Z",
      updatedAt: "2026-10-19T00:00:00.000Z",
    };
    return { ...atual, contacts: [contato] };
  }

  async updateContact(clientId: string): Promise<ClientDetail> {
    return this.get(clientId);
  }

  async removeContact(clientId: string): Promise<ClientDetail> {
    return this.get(clientId);
  }
}

describe("clientes API (e2e)", () => {
  let app: INestApplication;

  const comercial = (r: request.Test) => r.set("x-dev-principal", "local-comercial").set("x-dev-departamentos", "crm:membro");

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

  it("denies the cadastro to departments outside the client domain", async () => {
    for (const departamento of ["financeiro", "suprimentos", "marketing"]) {
      await request(app.getHttpServer())
        .get("/clientes")
        .set("x-dev-principal", `local-${departamento}`)
        .set("x-dev-departamentos", `${departamento}:membro`)
        .expect(403);
    }
  });

  it("lets comercial search and returns list rows with the CNPJ formatted and the phone masked", async () => {
    await comercial(request(app.getHttpServer()).get("/clientes?q=rio negro"))
      .expect(200)
      .expect((res) => {
        expect(res.body.items).toHaveLength(1);
        expect(res.body.items[0].documentDisplay).toBe("99.999.001/0001-59");
        expect(res.body.items[0].phoneDisplay).toBe("(92) 9••••-0000");
        expect(res.body.items[0]).not.toHaveProperty("phone");
      });
  });

  it("rejects an unknown query parameter", async () => {
    await comercial(request(app.getHttpServer()).get("/clientes?segment=opm")).expect(400);
  });

  it("returns the full ficha by id and 400 for a malformed id", async () => {
    await comercial(request(app.getHttpServer()).get(`/clientes/${CLIENT_A.id}`))
      .expect(200)
      .expect((res) => expect(res.body.document).toBe(CNPJ));
    await comercial(request(app.getHttpServer()).get("/clientes/nao-e-uuid")).expect(400);
  });

  it("lists possible owners without being captured by the :id route", async () => {
    await comercial(request(app.getHttpServer()).get("/clientes/responsaveis"))
      .expect(200)
      .expect((res) => expect(res.body.items).toEqual([DONO]));
  });

  it("creates a prospect without document when a phone is given", async () => {
    await comercial(request(app.getHttpServer()).post("/clientes"))
      .send({ personType: "pj", name: "Logística Igarapé", phone: "(92) 99999-4120" })
      .expect(201)
      .expect((res) => expect(res.body.client.document).toBeNull());
  });

  it("asks for a phone or an e-mail", async () => {
    await comercial(request(app.getHttpServer()).post("/clientes"))
      .send({ personType: "pj", name: "Sem Contato" })
      .expect(400)
      .expect((res) => expect(res.body.detalhes.map((d: { campo: string }) => d.campo)).toContain("phone"));
  });

  it("rejects a CNPJ with a wrong check digit", async () => {
    await comercial(request(app.getHttpServer()).post("/clientes"))
      .send({ personType: "pj", name: "Documento Errado", email: "a@b.example", document: "99.999.001/0001-58" })
      .expect(400);
  });

  it("blocks a second client with the same document and reports it as a duplicate", async () => {
    await comercial(request(app.getHttpServer()).post("/clientes"))
      .send({ personType: "pj", name: "Hotel Rio Negro Filial", email: "a@b.example", document: "99.999.001/0001-59" })
      .expect(409)
      .expect((res) => expect(res.body.codigo).toBe("CONFLITO_UNICIDADE"));

    await comercial(request(app.getHttpServer()).get("/clientes/duplicates?document=99.999.001/0001-59"))
      .expect(200)
      .expect((res) => expect(res.body.candidates[0]).toMatchObject({ id: CLIENT_A.id, matchedOn: ["document"] }));
  });

  it("signals phone duplicates on create without blocking creation", async () => {
    await comercial(request(app.getHttpServer()).post("/clientes"))
      .send({ personType: "pj", name: "Hotel Rio Negro Ltda", phone: CLIENT_A.phone })
      .expect(201)
      .expect((res) => expect(res.body.duplicateCandidates[0].matchedOn).toEqual(["phone"]));
  });

  it("lets other client-domain departments read but only the CRM/admin write", async () => {
    await request(app.getHttpServer()).get("/clientes").set("x-dev-principal", "local-opm").set("x-dev-departamentos", "energia-opm:membro").expect(200);
    await request(app.getHttpServer())
      .post("/clientes")
      .set("x-dev-principal", "local-opm")
      .set("x-dev-departamentos", "energia-opm:membro")
      .send({ personType: "pj", name: "Não pode", phone: "92999994120" })
      .expect(403);
    await request(app.getHttpServer())
      .post(`/clientes/${CLIENT_A.id}/contatos`)
      .set("x-dev-principal", "local-tech")
      .set("x-dev-departamentos", "produto-tecnologia:membro")
      .send({ name: "Juliana" })
      .expect(403);
  });

  it("adds, edits and removes a contact of a PJ client", async () => {
    await comercial(request(app.getHttpServer()).post(`/clientes/${CLIENT_A.id}/contatos`))
      .send({ name: "Juliana Prado", role: "decisor", phone: "92999994120", phoneIsWhatsapp: true })
      .expect(201)
      .expect((res) => expect(res.body.contacts[0]).toMatchObject({ name: "Juliana Prado", isPrimary: true }));

    await comercial(request(app.getHttpServer()).patch(`/clientes/${CLIENT_A.id}/contatos/${CONTATO_ID}`))
      .send({ jobTitle: "Gerente administrativa" })
      .expect(200);

    await comercial(request(app.getHttpServer()).delete(`/clientes/${CLIENT_A.id}/contatos/${CONTATO_ID}`)).expect(200);
  });

  it("rejects an invalid CPF on a contact", async () => {
    await comercial(request(app.getHttpServer()).post(`/clientes/${CLIENT_A.id}/contatos`))
      .send({ name: "Representante", role: "representante_legal", cpf: "111.111.111-11" })
      .expect(400);
  });

  it("inactivates and reactivates a client through explicit auditable actions", async () => {
    await comercial(request(app.getHttpServer()).post(`/clientes/${CLIENT_B.id}/inactivate`))
      .send({ reason: "cliente encerrou operação" })
      .expect(200)
      .expect((res) => expect(res.body.active).toBe(false));

    await comercial(request(app.getHttpServer()).post(`/clientes/${CLIENT_B.id}/activate`))
      .expect(200)
      .expect((res) => expect(res.body.active).toBe(true));
  });
});
