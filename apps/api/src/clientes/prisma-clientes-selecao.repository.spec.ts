import { describe, expect, it, vi } from "vitest";

import { AuditAppender } from "../audit/audit-appender";
import type { AuthPrincipal } from "../core/auth/auth.types";
import type { PrismaService } from "../prisma/prisma.service";
import { ClientesController } from "./clientes.controller";
import { ClientesService } from "./clientes.service";
import { PrismaClientesRepository } from "./prisma-clientes.repository";

const id = "00000000-0000-4000-8000-000000000001";
const gerentePipelines: AuthPrincipal = { id, kind: "user", acesso: { plataforma: null, departamentos: [
  { departamento: "crm", nivel: "gerente", telas: ["crm.pipelines"] },
  { departamento: "energia-opm", nivel: "membro" },
] } };
const registros = [id, "00000000-0000-4000-8000-000000000002", null].map((ownerId, index) => ({
  id: `00000000-0000-4000-8000-00000000010${index}`, ownerId, name: `Hotel ${index}`, personType: "pf", document: "99999900100",
  legalName: null, phone: "92999990000", email: "privado@example.test", city: "Manaus", state: "AM", active: true,
  updatedAt: new Date(), owner: ownerId ? { id: ownerId, name: "Responsável" } : null,
  contacts: [{ name: "Contato principal", isPrimary: true, createdAt: new Date() }],
}));

function setup() {
  const findMany = vi.fn(async ({ where }) => registros.filter((row) => where.ownerId === undefined || row.ownerId === where.ownerId));
  const banco = { client: { findMany } };
  const prisma = { comContexto: <T>(fn: (tx: typeof banco) => Promise<T>) => fn(banco) };
  const service = new ClientesService(new PrismaClientesRepository(prisma as unknown as PrismaService, new AuditAppender()));
  return { controller: new ClientesController(service), service, findMany };
}

describe("Seleção de clientes para negócios", () => {
  it("gerente só de Pipelines seleciona clientes próprios, alheios e compartilhados com projeção mínima", async () => {
    const { controller, findMany } = setup();
    const result = await controller.selecaoNegocio({ q: "Hotel" }, gerentePipelines);
    expect(result.items.map((item) => item.id)).toEqual(registros.map((row) => row.id));
    expect(Object.keys(result.items[0]!).sort()).toEqual(["city", "documentDisplay", "id", "name", "primaryContactName"]);
    expect(result.items[0]?.documentDisplay).not.toBe(registros[0]?.document);
    expect(findMany.mock.calls[0]?.[0]).toMatchObject({ where: { active: true }, take: 8 });
    expect(findMany.mock.calls[0]?.[0].where).not.toHaveProperty("ownerId");
    expect(findMany.mock.calls[0]?.[0]).not.toHaveProperty("include");
  });

  it("a seleção não amplia a listagem geral para gerência só de Pipelines com leitura de membro em Energia", async () => {
    const { service } = setup();
    const result = await service.list({ q: "Hotel" }, gerentePipelines);
    expect(result.items.map((item) => item.id)).toEqual([registros[0]!.id]);
  });

  it("gerência em Energia não amplia a seleção do membro de Pipelines", async () => {
    const { controller } = setup();
    const membroPipelines: AuthPrincipal = { ...gerentePipelines, acesso: { plataforma: null, departamentos: [
      { departamento: "crm", nivel: "membro", telas: ["crm.pipelines"] },
      { departamento: "energia-opm", nivel: "gerente" },
    ] } };
    const result = await controller.selecaoNegocio({ q: "Hotel" }, membroPipelines);
    expect(result.items.map((item) => item.id)).toEqual([registros[0]!.id]);
  });
});
