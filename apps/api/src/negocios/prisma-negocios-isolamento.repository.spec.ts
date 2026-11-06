import { afterEach, describe, expect, it, vi } from "vitest";

import { AuditAppender } from "../audit/audit-appender";
import type { ClientesService } from "../clientes/clientes.service";
import { AcessoNegado, NaoEncontrado } from "../common/errors/dominio";
import type { AuthPrincipal } from "../core/auth/auth.types";
import * as acesso from "../pipelines/acesso-comercial";
import { PrismaService } from "../prisma/prisma.service";
import { PrismaNegociosRepository } from "./prisma-negocios.repository";

const principal: AuthPrincipal = { id: "membro", kind: "user", acesso: { plataforma: "admin", departamentos: [] } };
const pipeline = { id: "pipeline", archivedAt: null, stages: [{ id: "etapa" }], tags: [], lossReasons: [] };

function setup(ownerId = "outra-pessoa") {
  const prisma = new PrismaService();
  vi.spyOn(acesso, "lerAcessoComercial").mockResolvedValue({ podeOperar: true, admin: false, gestorEm: [] });
  vi.spyOn(prisma.pipeline, "findUnique").mockResolvedValue(pipeline as never);
  vi.spyOn(prisma.deal, "findUnique").mockResolvedValue({ id: "negocio", ownerId, pipelineId: pipeline.id, status: "open", stageId: "etapa" } as never);
  const history = vi.spyOn(prisma.dealHistory, "findMany").mockResolvedValue([]);
  const list = vi.spyOn(prisma.deal, "findMany").mockResolvedValue([]);
  const write = vi.spyOn(prisma.deal, "update");
  const create = vi.spyOn(prisma.deal, "create");
  const historyWrite = vi.spyOn(prisma.dealHistory, "createMany");
  const auditWrite = vi.spyOn(prisma.eventLog, "createMany");
  vi.spyOn(prisma.deal, "findUniqueOrThrow").mockRejectedValue(new Error("Leitura de conteúdo não autorizada."));
  vi.spyOn(prisma, "$queryRaw").mockResolvedValue([]);
  vi.spyOn(prisma, "comContexto").mockImplementation(async (callback: unknown) => {
    if (typeof callback !== "function") throw new Error("Callback de contexto esperado.");
    return callback(prisma);
  });
  return { prisma, repo: new PrismaNegociosRepository(prisma, new AuditAppender(), {} as ClientesService), history, list, write, create, historyWrite, auditWrite };
}

afterEach(() => vi.restoreAllMocks());

describe("Negócios: isolamento por responsável com acesso atual", () => {
  it("oculta detalhe, histórico e todas as mutações do negócio de outro membro", async () => {
    const { repo, write, create, historyWrite, auditWrite } = setup();
    const operations = [
      () => repo.get("negocio", principal),
      () => repo.history("negocio", { limit: 30 }, principal),
      () => repo.update("negocio", { title: "Alterado" }, principal),
      () => repo.convert("negocio", {}, principal),
      () => repo.moveStage("negocio", { stageId: "etapa" }, principal),
      () => repo.setPriority("negocio", { priority: null }, principal),
      () => repo.win("negocio", { convertToClient: false }, principal),
      () => repo.lose("negocio", { lossReasonId: "motivo" }, principal),
      () => repo.transfer("negocio", { pipelineId: "destino", stageId: "etapa", convertToClient: false }, principal),
    ];
    for (const operation of operations) await expect(operation()).rejects.toBeInstanceOf(NaoEncontrado);
    expect(write).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(historyWrite).not.toHaveBeenCalled();
    expect(auditWrite).not.toHaveBeenCalled();
  });

  it("filtra lista pelo dono mesmo com sessão antiga de admin e mantém histórico próprio", async () => {
    const { repo, list } = setup(principal.id);
    await expect(repo.list({ pipelineId: pipeline.id, status: "all" }, principal)).resolves.toEqual({ deals: [] });
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ where: { pipelineId: pipeline.id, ownerId: principal.id } }));
    await expect(repo.history("negocio", { limit: 30 }, principal)).resolves.toEqual({ entries: [], nextCursor: null });
  });

  it("gerente relido do banco alcança o histórico de outros responsáveis", async () => {
    const { repo } = setup();
    vi.mocked(acesso.lerAcessoComercial).mockResolvedValue({ podeOperar: true, admin: false, gestorEm: ["plugga", "waze"] });
    await expect(repo.history("negocio", { limit: 30 }, principal)).resolves.toEqual({ entries: [], nextCursor: null });
  });

  it("recusa atribuição de novo negócio a outro responsável antes de persistir", async () => {
    const { repo, create, write, historyWrite, auditWrite } = setup();
    await expect(repo.create({ pipelineId: pipeline.id, stageId: "etapa", ownerId: "outro", title: "Novo", tagIds: [], lead: { personType: "pf", name: "Lead" } } as never, principal)).rejects.toBeInstanceOf(AcessoNegado);
    expect(create).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(historyWrite).not.toHaveBeenCalled();
    expect(auditWrite).not.toHaveBeenCalled();
  });

  it("oculta contatos do cliente de outro responsável", async () => {
    const { repo, prisma } = setup();
    vi.spyOn(prisma.client, "findUnique").mockResolvedValue({ ownerId: "outro", contacts: [] } as never);
    await expect(repo.clientOptions("cliente", principal)).rejects.toBeInstanceOf(NaoEncontrado);
  });

  it("recusa lote misto antes de gravar qualquer registro", async () => {
    const { repo, list, write, historyWrite, auditWrite } = setup();
    list.mockResolvedValue([{ id: "proprio", pipelineId: pipeline.id, ownerId: principal.id, stageId: "etapa", status: "open" }, { id: "alheio", pipelineId: pipeline.id, ownerId: "outro", stageId: "etapa", status: "open" }] as never);
    await expect(repo.bulk({ dealIds: ["proprio", "alheio"], action: { type: "priority", priority: null } }, principal)).rejects.toBeInstanceOf(NaoEncontrado);
    expect(write).not.toHaveBeenCalled();
    expect(historyWrite).not.toHaveBeenCalled();
    expect(auditWrite).not.toHaveBeenCalled();
  });

  it("revalida o responsável após esperar pelo lock da edição", async () => {
    const { repo, prisma, write } = setup(principal.id);
    vi.mocked(prisma.deal.findUnique)
      .mockResolvedValueOnce({ id: "negocio", ownerId: principal.id, pipelineId: pipeline.id, status: "open", stageId: "etapa" } as never)
      .mockResolvedValueOnce({ ownerId: "outro", pipelineId: pipeline.id } as never);
    await expect(repo.update("negocio", { title: "Proibido" }, principal)).rejects.toBeInstanceOf(NaoEncontrado);
    expect(write).not.toHaveBeenCalled();
  });

  it("revalida o lote completo após o lock e reverte antes da primeira escrita", async () => {
    const { repo, list, write } = setup(principal.id);
    list.mockResolvedValueOnce([{ id: "negocio", pipelineId: pipeline.id, ownerId: principal.id }] as never)
      .mockResolvedValueOnce([{ id: "negocio", ownerId: "outro" }] as never);
    await expect(repo.bulk({ dealIds: ["negocio"], action: { type: "priority", priority: "urgente" } }, principal)).rejects.toBeInstanceOf(NaoEncontrado);
    expect(write).not.toHaveBeenCalled();
  });

  it("a ordenação não aceita negócio alheio como referência nem o inclui no rebalanceamento", async () => {
    const { repo, list, write } = setup(principal.id);
    await expect(repo.moveStage("negocio", { stageId: "etapa", beforeDealId: "alheio" }, principal)).rejects.toThrow("Escolha um negócio aberto desta etapa.");
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ where: { stageId: "etapa", ownerId: principal.id, id: { not: "negocio" } } }));
    expect(write).not.toHaveBeenCalled();
  });
});
