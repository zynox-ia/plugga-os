import type { ClientDetail } from "@plugga/shared";
import { describe, expect, it } from "vitest";

import type { AuthPrincipal } from "../core/auth/auth.types";
import { ClientesRepository } from "./clientes.repository";
import { ClientesService } from "./clientes.service";

const principal: AuthPrincipal = { id: "00000000-0000-4000-8000-000000000001", kind: "user", acesso: { plataforma: null, departamentos: [{ departamento: "crm", nivel: "membro" }] } };

const CLIENTE: ClientDetail = {
  id: "00000000-0000-4000-8000-000000000002",
  personType: "pj",
  name: "Hotel Rio Negro",
  legalName: null,
  document: null,
  phone: "92900000000",
  email: null,
  postalCode: null,
  street: null,
  addressComplement: null,
  district: null,
  city: null,
  state: null,
  owner: { id: principal.id, name: "Ana" },
  origin: null,
  notes: null,
  rg: null,
  rgIssuer: null,
  nationality: null,
  birthDate: null,
  active: true,
  contacts: [],
  createdAt: "2026-10-19T00:00:00.000Z",
  updatedAt: "2026-10-19T00:00:00.000Z",
};

function fakeRepository(overrides: Partial<ClientesRepository> = {}): ClientesRepository {
  const naoUsado = async (): Promise<never> => {
    throw new Error("not used");
  };
  return {
    list: naoUsado,
    get: naoUsado,
    create: naoUsado,
    update: naoUsado,
    activate: naoUsado,
    inactivate: naoUsado,
    duplicateCandidates: naoUsado,
    owners: naoUsado,
    addContact: naoUsado,
    updateContact: naoUsado,
    removeContact: naoUsado,
    ...overrides,
  };
}

describe("ClientesService", () => {
  it("delegates search/filter to the repository with the query untouched", async () => {
    let received: unknown;
    const repository = fakeRepository({
      list: async (query) => {
        received = query;
        return { items: [] };
      },
    });

    const query = { q: "solar", active: "true" as const };
    const result = await new ClientesService(repository).list(query);

    expect(received).toEqual(query);
    expect(result).toEqual({ items: [] });
  });

  it("surfaces duplicate candidates from create() without blocking the result", async () => {
    const repository = fakeRepository({
      create: async () => ({
        client: CLIENTE,
        duplicateCandidates: [
          { id: "00000000-0000-4000-8000-000000000003", name: "Hotel Rio Negro Ltda", personType: "pj", matchedOn: ["phone", "name"] },
        ],
      }),
    });

    const result = await new ClientesService(repository).create(
      { personType: "pj", name: "Hotel Rio Negro", phone: "92900000000" },
      principal,
    );

    // Signaled, not blocked: create() still returns the newly created client.
    expect(result.client.name).toBe("Hotel Rio Negro");
    expect(result.duplicateCandidates[0]?.matchedOn).toEqual(["phone", "name"]);
  });

  it("passes client and contact ids through to the repository", async () => {
    const chamadas: string[][] = [];
    const repository = fakeRepository({
      updateContact: async (clientId, contactId) => {
        chamadas.push([clientId, contactId]);
        return CLIENTE;
      },
      removeContact: async (clientId, contactId) => {
        chamadas.push([clientId, contactId]);
        return CLIENTE;
      },
    });
    const service = new ClientesService(repository);
    const contatoId = "00000000-0000-4000-8000-000000000201";

    await service.updateContact(CLIENTE.id, contatoId, { jobTitle: "Gerente" }, principal);
    await service.removeContact(CLIENTE.id, contatoId, principal);

    expect(chamadas).toEqual([
      [CLIENTE.id, contatoId],
      [CLIENTE.id, contatoId],
    ]);
  });
});
