import { afterEach, describe, expect, it, vi } from "vitest";
import type { Tela } from "@plugga/shared";

import type { AuthPrincipal } from "../core/auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { PrismaAgentActionScope } from "./prisma-agent-action-scope.repository";

const entityId = "00000000-0000-4000-8000-000000000001";
const principal: AuthPrincipal = { id: "00000000-0000-4000-8000-000000000002", kind: "service", acesso: {
  plataforma: null, departamentos: [{ departamento: "crm", nivel: "membro", telas: ["crm.pipelines"] }],
} };

function setup() {
  const prisma = new PrismaService();
  const contexto = vi.spyOn(prisma, "comContexto").mockImplementation(async (callback: unknown) => {
    if (typeof callback !== "function") throw new Error("Callback de contexto esperado.");
    return callback(prisma);
  });
  const consultas = {
    client: vi.spyOn(prisma.client, "findFirst").mockResolvedValue({ id: entityId } as never),
    deal: vi.spyOn(prisma.deal, "findFirst").mockResolvedValue({ id: entityId } as never),
    opportunity: vi.spyOn(prisma.opportunity, "findFirst").mockResolvedValue({ id: entityId } as never),
    contract: vi.spyOn(prisma.contract, "findFirst").mockResolvedValue({ id: entityId } as never),
  };
  return { repo: new PrismaAgentActionScope(prisma), contexto, consultas };
}

afterEach(() => vi.restoreAllMocks());

describe("escopo da trilha de IA por tela", () => {
  it.each(["deal", "opportunity"] as const)("Pipelines autoriza trilha de %s compartilhado sem exigir ownership", async (tipo) => {
    const { repo, consultas } = setup();
    consultas[tipo].mockImplementation((args) => Promise.resolve(args?.where?.ownerId === undefined ? { id: entityId } : null) as never);
    await expect(repo.permite(principal, tipo, entityId)).resolves.toBe(true);
    expect(consultas[tipo]).toHaveBeenCalledWith({ where: { id: entityId }, select: { id: true } });
  });

  it.each([
    ["client", "crm.clientes"], ["contract", "crm.contratos"],
  ] as const)("%s exige sua própria tela e consulta somente a entidade pedida", async (tipo, tela) => {
    const { repo, contexto, consultas } = setup();
    consultas[tipo].mockImplementation((args) => Promise.resolve(args?.where?.ownerId === undefined ? { id: entityId } : null) as never);
    await expect(repo.permite(principal, tipo, entityId)).resolves.toBe(false);
    expect(contexto).not.toHaveBeenCalled();
    const autorizado = { ...principal, acesso: { plataforma: null, departamentos: [{ departamento: "crm", nivel: "membro", telas: [tela] as Tela[] }] } } as AuthPrincipal;
    await expect(repo.permite(autorizado, tipo, entityId)).resolves.toBe(true);
    expect(consultas[tipo]).toHaveBeenCalledWith({ where: { id: entityId }, select: { id: true } });
  });

  it("revogação, entidade desconhecida e UUID inválido não consultam o banco", async () => {
    const { repo, contexto } = setup();
    const revogado = { ...principal, acesso: { plataforma: null, departamentos: [] } } as AuthPrincipal;
    await expect(repo.permite(revogado, "deal", entityId)).resolves.toBe(false);
    await expect(repo.permite(principal, "users", entityId)).resolves.toBe(false);
    await expect(repo.permite(principal, "deal", "id-invalido")).resolves.toBe(false);
    expect(contexto).not.toHaveBeenCalled();
  });

  it("tela liberada não torna existente uma entidade ausente ou filtrada pelo banco", async () => {
    const { repo, consultas } = setup();
    consultas.deal.mockResolvedValue(null);
    await expect(repo.permite(principal, "deal", entityId)).resolves.toBe(false);
  });

  it("nomes herdados de Object não viram tipos de entidade nem com alcance de plataforma", async () => {
    const { repo, contexto } = setup();
    const plataforma = { ...principal, acesso: { plataforma: "admin", departamentos: [] } } as AuthPrincipal;
    for (const tipo of ["toString", "constructor", "__proto__"]) {
      await expect(repo.permite(plataforma, tipo, entityId)).resolves.toBe(false);
    }
    expect(contexto).not.toHaveBeenCalled();
  });
});
