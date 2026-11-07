import { afterEach, describe, expect, it, vi } from "vitest";

import { AuditAppender } from "../audit/audit-appender";
import type { ClientesService } from "../clientes/clientes.service";
import { AcessoNegado, EstadoInvalido, NaoEncontrado, RequisicaoInvalida } from "../common/errors/dominio";
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
  vi.spyOn(prisma, "$executeRaw").mockResolvedValue(1);
  vi.spyOn(prisma, "comContexto").mockImplementation(async (callback: unknown) => {
    if (typeof callback !== "function") throw new Error("Callback de contexto esperado.");
    return callback(prisma);
  });
  return { prisma, repo: new PrismaNegociosRepository(prisma, new AuditAppender(), {} as ClientesService), history, list, write, create, historyWrite, auditWrite };
}

afterEach(() => vi.restoreAllMocks());

describe("Negócios: acesso por tela conforme definição do André", () => {
  it("oculta detalhe, histórico e mutações quando a tela foi revogada", async () => {
    const { repo, prisma, history, write, create, historyWrite, auditWrite } = setup();
    vi.mocked(acesso.lerAcessoComercial).mockResolvedValue({ podeOperar: false, admin: false, gestorEm: [] });
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
    expect(history).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("consulta os leads da tela sem filtro de responsável e preserva o histórico autorizado", async () => {
    const { repo, list } = setup();
    await expect(repo.list({ pipelineId: pipeline.id, status: "all" }, principal)).resolves.toEqual({ deals: [] });
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ where: { pipelineId: pipeline.id } }));
    await expect(repo.history("negocio", { limit: 30 }, principal)).resolves.toEqual({ entries: [], nextCursor: null });
  });

  it("gerente relido do banco alcança o histórico de outros responsáveis", async () => {
    const { repo } = setup();
    vi.mocked(acesso.lerAcessoComercial).mockResolvedValue({ podeOperar: true, admin: false, gestorEm: ["plugga", "waze"] });
    await expect(repo.history("negocio", { limit: 30 }, principal)).resolves.toEqual({ entries: [], nextCursor: null });
  });

  it.each(["membro", "outra-pessoa"])("preserva autoria e snapshots de um lead da tela com responsável %s", async (ownerId) => {
    const membro = { ...principal, id: "00000000-0000-4000-8000-000000000001" };
    const autor = { id: "00000000-0000-4000-8000-000000000002", name: "Autora anterior" };
    const atual = { id: membro.id, name: "Responsável atual" };
    const { repo, prisma, history } = setup(ownerId);
    history.mockResolvedValue([{
      id: "00000000-0000-4000-8000-000000000003", kind: "field_changed", occurredAt: new Date("2026-11-06T12:00:00Z"),
      actorId: autor.id, actor: autor,
      field: "ownerId", beforeValue: autor, afterValue: atual,
      fromStageName: null, toStageName: null, fromPipelineName: null, toPipelineName: null,
      fromPriority: null, toPriority: null,
    }] as never);
    // André autorizou todos os leads da tela e a preservação de sua autoria/histórico.
    const result = await repo.history("negocio", { limit: 30 }, membro);

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({ actor: autor, before: autor, after: atual });
    expect(Object.keys(result.entries[0]!.actor!)).toEqual(["id", "name"]);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("recusa cursor de outro negócio antes de consultar histórico ou autores", async () => {
    const { repo, prisma, history } = setup(principal.id);
    vi.spyOn(prisma.dealHistory, "findFirst").mockResolvedValue(null);

    await expect(repo.history("negocio", { limit: 30, cursor: "00000000-0000-4000-8000-000000000004" }, principal)).rejects.toBeInstanceOf(RequisicaoInvalida);

    expect(history).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("recusa atribuição de novo negócio a outro responsável antes de persistir", async () => {
    const { repo, create, write, historyWrite, auditWrite } = setup();
    await expect(repo.create({ pipelineId: pipeline.id, stageId: "etapa", ownerId: "outro", title: "Novo", tagIds: [], lead: { personType: "pf", name: "Lead" } } as never, principal)).rejects.toBeInstanceOf(AcessoNegado);
    expect(create).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(historyWrite).not.toHaveBeenCalled();
    expect(auditWrite).not.toHaveBeenCalled();
  });

  it("não consulta contatos de cliente sem a permissão de Clientes", async () => {
    const { repo, prisma } = setup();
    vi.spyOn(prisma.client, "findUnique").mockResolvedValue({ ownerId: "outro", contacts: [] } as never);
    await expect(repo.clientOptions("cliente", principal)).rejects.toBeInstanceOf(AcessoNegado);
    expect(prisma.client.findUnique).not.toHaveBeenCalled();
  });

  it("recusa lote com ID inexistente antes de gravar qualquer registro", async () => {
    const { repo, list, write, historyWrite, auditWrite } = setup();
    list.mockResolvedValue([{ id: "proprio", pipelineId: pipeline.id, ownerId: principal.id, stageId: "etapa", status: "open" }] as never);
    await expect(repo.bulk({ dealIds: ["proprio", "inexistente"], action: { type: "priority", priority: null } }, principal)).rejects.toBeInstanceOf(NaoEncontrado);
    expect(write).not.toHaveBeenCalled();
    expect(historyWrite).not.toHaveBeenCalled();
    expect(auditWrite).not.toHaveBeenCalled();
  });

  it("revalida a permissão da tela após esperar pelo lock da edição", async () => {
    const { repo, prisma, write } = setup(principal.id);
    vi.mocked(acesso.lerAcessoComercial).mockResolvedValueOnce({ podeOperar: true, admin: false, gestorEm: [] })
      .mockResolvedValue({ podeOperar: false, admin: false, gestorEm: [] });
    vi.mocked(prisma.deal.findUnique)
      .mockResolvedValueOnce({ id: "negocio", ownerId: principal.id, pipelineId: pipeline.id, status: "open", stageId: "etapa" } as never)
      .mockResolvedValueOnce({ ownerId: "outro", pipelineId: pipeline.id } as never);
    await expect(repo.update("negocio", { title: "Proibido" }, principal)).rejects.toBeInstanceOf(NaoEncontrado);
    expect(write).not.toHaveBeenCalled();
  });

  it("revalida o lote completo após o lock e reverte antes da primeira escrita", async () => {
    const { repo, list, write } = setup(principal.id);
    list.mockResolvedValueOnce([{ id: "negocio", pipelineId: pipeline.id, ownerId: principal.id }] as never)
      .mockResolvedValueOnce([] as never);
    await expect(repo.bulk({ dealIds: ["negocio"], action: { type: "priority", priority: "urgente" } }, principal)).rejects.toBeInstanceOf(NaoEncontrado);
    expect(write).not.toHaveBeenCalled();
  });

  it("a ordenação recusa referência que não pertence à etapa e não filtra por responsável", async () => {
    const { repo, list, write } = setup(principal.id);
    await expect(repo.moveStage("negocio", { stageId: "etapa", beforeDealId: "alheio" }, principal)).rejects.toThrow("Escolha um negócio aberto desta etapa.");
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ where: { stageId: "etapa", id: { not: "negocio" } } }));
    expect(write).not.toHaveBeenCalled();
  });
});

describe("Negócios: configuração relida depois de aguardar o lock", () => {
  function aguardarLock(prisma: PrismaService) {
    let liberar!: (count: number) => void;
    const bloqueado = new Promise<number>((resolve) => { liberar = resolve; });
    vi.mocked(prisma.$executeRaw).mockReturnValueOnce(bloqueado as never);
    return liberar;
  }

  it.each(["arquivar", "remover etapa", "remover etiqueta", "revogar acesso"] as const)("criação recusa %s ocorrido entre a leitura inicial e a aquisição do lock", async (mudanca) => {
    const { repo, prisma, create, auditWrite } = setup(principal.id);
    let atual = { ...pipeline, tags: [{ id: "tag" }] };
    vi.mocked(prisma.pipeline.findUnique).mockImplementation(() => Promise.resolve(atual) as never);
    vi.spyOn(prisma.user, "findFirst").mockResolvedValue({ id: principal.id } as never);
    create.mockRejectedValue(new Error("Persistência indevida"));
    const liberar = aguardarLock(prisma);
    const trabalho = repo.create({ pipelineId: pipeline.id, stageId: "etapa", ownerId: principal.id, title: "Novo", tagIds: ["tag"], lead: { personType: "pf", name: "Lead" } } as never, principal);
    await vi.waitFor(() => expect(prisma.$executeRaw).toHaveBeenCalledOnce());
    expect(create).not.toHaveBeenCalled();
    if (mudanca === "arquivar") atual = { ...atual, archivedAt: new Date() } as never;
    else if (mudanca === "remover etapa") atual = { ...atual, stages: [] };
    else if (mudanca === "remover etiqueta") atual = { ...atual, tags: [] };
    else vi.mocked(acesso.lerAcessoComercial).mockResolvedValue({ podeOperar: false, admin: false, gestorEm: [] });
    liberar(1);
    await expect(trabalho).rejects.toBeInstanceOf(mudanca === "arquivar" ? EstadoInvalido : mudanca === "revogar acesso" ? NaoEncontrado : RequisicaoInvalida);
    expect(create).not.toHaveBeenCalled();
    expect(auditWrite).not.toHaveBeenCalled();
  });

  it("transferência recusa destino arquivado enquanto aguardava as chaves", async () => {
    const { repo, prisma, write, auditWrite } = setup(principal.id);
    let arquivado = false;
    vi.mocked(prisma.pipeline.findUnique).mockImplementation((args) => Promise.resolve(args.where.id === pipeline.id ? pipeline : {
      ...pipeline, id: "destino", archivedAt: arquivado ? new Date() : null,
    }) as never);
    const removerTags = vi.spyOn(prisma.dealTag, "deleteMany").mockResolvedValue({ count: 0 });
    vi.spyOn(prisma.user, "findFirst").mockResolvedValue({ id: principal.id } as never);
    write.mockRejectedValue(new Error("Persistência indevida"));
    const liberar = aguardarLock(prisma);
    const trabalho = repo.transfer("negocio", { pipelineId: "destino", stageId: "etapa", convertToClient: false }, principal);
    await vi.waitFor(() => expect(prisma.$executeRaw).toHaveBeenCalledOnce());
    arquivado = true;
    liberar(1);
    await expect(trabalho).rejects.toBeInstanceOf(EstadoInvalido);
    expect(removerTags).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(auditWrite).not.toHaveBeenCalled();
  });

  it.each(["etapa", "motivo"] as const)("mutação recusa %s removido da configuração enquanto aguardava o lock", async (tipo) => {
    const { repo, prisma, write, auditWrite } = setup(principal.id);
    let removido = false;
    vi.mocked(prisma.pipeline.findUnique).mockImplementation(() => Promise.resolve({
      ...pipeline,
      stages: removido ? pipeline.stages : [...pipeline.stages, { id: "destino" }],
      lossReasons: removido ? [] : [{ id: "motivo", name: "Motivo", asksRevisitDate: false }],
    }) as never);
    write.mockRejectedValue(new Error("Persistência indevida"));
    const liberar = aguardarLock(prisma);
    const trabalho = tipo === "etapa"
      ? repo.moveStage("negocio", { stageId: "destino" }, principal)
      : repo.lose("negocio", { lossReasonId: "motivo" }, principal);
    await vi.waitFor(() => expect(prisma.$executeRaw).toHaveBeenCalledOnce());
    removido = true;
    liberar(1);
    await expect(trabalho).rejects.toBeInstanceOf(RequisicaoInvalida);
    expect(write).not.toHaveBeenCalled();
    expect(auditWrite).not.toHaveBeenCalled();
  });
});
