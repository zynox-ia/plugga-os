import { describe, expect, it } from "vitest";

import type { AuthPrincipal } from "../core/auth/auth.types";
import { ClientesRepository } from "./clientes.repository";
import { ClientesService } from "./clientes.service";

const principal: AuthPrincipal = { id: "00000000-0000-4000-8000-000000000001", kind: "user", roles: ["comercial"] };

function fakeRepository(overrides: Partial<ClientesRepository> = {}): ClientesRepository {
  return {
    list: async () => { throw new Error("not used"); },
    get: async () => { throw new Error("not used"); },
    create: async () => { throw new Error("not used"); },
    update: async () => { throw new Error("not used"); },
    activate: async () => { throw new Error("not used"); },
    inactivate: async () => { throw new Error("not used"); },
    duplicateCandidates: async () => { throw new Error("not used"); },
    ficha: async () => { throw new Error("not used"); },
    ...overrides,
  };
}

describe("ClientesService", () => {
  it("delegates search/filter to the repository with the query untouched", async () => {
    let received: unknown;
    const repository = fakeRepository({
      list: async (query) => {
        received = query;
        return { mode: "mock", items: [] };
      },
    });

    const query = { q: "solar", segment: "opm" as const, active: "true" as const };
    const result = await new ClientesService(repository).list(query);

    expect(received).toEqual(query);
    expect(result).toEqual({ mode: "mock", items: [] });
  });

  it("surfaces duplicate candidates from create() without blocking the result", async () => {
    const repository = fakeRepository({
      create: async () => ({
        mode: "mock",
        client: {
          id: "00000000-0000-4000-8000-000000000002",
          name: "Hotel Rio Negro",
          company: null,
          phone: "+55 92 90000-0000",
          email: null,
          externalId: null,
          segment: "prospect",
          active: true,
          createdAt: "2026-08-07T00:00:00.000Z",
          updatedAt: "2026-08-07T00:00:00.000Z",
        },
        duplicateCandidates: [
          {
            id: "00000000-0000-4000-8000-000000000003",
            name: "Hotel Rio Negro Ltda",
            company: null,
            phone: "+55 92 90000-0000",
            email: null,
            externalId: null,
            segment: "prospect",
            active: true,
            createdAt: "2026-08-01T00:00:00.000Z",
            updatedAt: "2026-08-01T00:00:00.000Z",
            matchedOn: ["phone", "name"],
          },
        ],
      }),
    });

    const result = await new ClientesService(repository).create(
      { name: "Hotel Rio Negro", phone: "+55 92 90000-0000" },
      principal,
    );

    // Signaled, not blocked: create() still returns the newly created client.
    expect(result.client.name).toBe("Hotel Rio Negro");
    expect(result.duplicateCandidates).toHaveLength(1);
    expect(result.duplicateCandidates[0]?.matchedOn).toEqual(["phone", "name"]);
  });

  it("delegates the ficha aggregator by id", async () => {
    let requestedId: string | undefined;
    const repository = fakeRepository({
      ficha: async (id) => {
        requestedId = id;
        return {
          mode: "mock",
          resumo: {
            id,
            name: "Amazonas Clean",
            company: null,
            phone: null,
            email: null,
            externalId: null,
            segment: "prospect",
            active: true,
            createdAt: "2026-08-07T00:00:00.000Z",
            updatedAt: "2026-08-07T00:00:00.000Z",
          },
          contatos: [],
          oportunidades: [],
          contratos: [],
          energiaOpm: { available: false, reason: "sem dados" },
          pluggamob: { available: false, reason: "sem dados" },
          financeiro: { status: "em_breve", message: "em breve" },
          documentos: { status: "em_breve", message: "em breve" },
          timeline: [],
          acoesDoAgente: [],
        };
      },
    });

    const result = await new ClientesService(repository).ficha("00000000-0000-4000-8000-000000000004");

    expect(requestedId).toBe("00000000-0000-4000-8000-000000000004");
    expect(result.resumo.name).toBe("Amazonas Clean");
    expect(result.energiaOpm).toEqual({ available: false, reason: "sem dados" });
    expect(result.financeiro).toEqual({ status: "em_breve", message: "em breve" });
  });
});
