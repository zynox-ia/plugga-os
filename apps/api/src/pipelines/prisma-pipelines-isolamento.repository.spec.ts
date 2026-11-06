import { afterEach, describe, expect, it, vi } from "vitest";

import { AuditAppender } from "../audit/audit-appender";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import * as acesso from "./acesso-comercial";
import { PrismaPipelinesRepository } from "./prisma-pipelines.repository";

const principal: AuthPrincipal = { id: "membro", kind: "user", acesso: { plataforma: "admin", departamentos: [] } };

function setup(gerente = false) {
  const prisma = new PrismaService();
  vi.spyOn(acesso, "lerAcessoComercial").mockResolvedValue({ podeOperar: true, admin: false, gestorEm: gerente ? ["plugga", "waze"] : [] });
  const pipelines = vi.spyOn(prisma.pipeline, "findMany").mockResolvedValue([]);
  const people = vi.spyOn(prisma.user, "findMany").mockResolvedValue([]);
  return { repo: new PrismaPipelinesRepository(prisma, new AuditAppender()), pipelines, people };
}
afterEach(() => vi.restoreAllMocks());

describe("Pipelines: metadados sem negócios de outros membros", () => {
  it("restringe contagens, membros antigos e diretório ao responsável atual", async () => {
    const { repo, pipelines, people } = setup();
    await repo.list(principal);
    expect(pipelines).toHaveBeenCalledWith(expect.objectContaining({ include: expect.objectContaining({
      stages: expect.objectContaining({ include: { _count: { select: { deals: { where: { ownerId: principal.id } } } } } }),
      _count: { select: { deals: { where: { ownerId: principal.id } } } },
      members: expect.objectContaining({ where: { userId: principal.id } }),
    }) }));
    expect(people).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: principal.id }) }));
  });

  it("mantém contagens gerais e catálogo elegível para a gestão atual do CRM", async () => {
    const { repo, pipelines, people } = setup(true);
    await repo.list(principal);
    expect(pipelines).toHaveBeenCalledWith(expect.objectContaining({
      include: expect.objectContaining({ _count: { select: { deals: { where: {} } } } }),
    }));
    expect(people.mock.calls[0]?.[0]?.where).not.toHaveProperty("id");
  });
});
