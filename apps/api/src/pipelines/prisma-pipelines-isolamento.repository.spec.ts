import { afterEach, describe, expect, it, vi } from "vitest";
import { pipelineParaEdicao, updatePipelineRequestSchema } from "@plugga/shared";

import { AuditAppender } from "../audit/audit-appender";
import { AcessoNegado } from "../common/errors/dominio";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import * as acesso from "./acesso-comercial";
import { PrismaPipelinesRepository } from "./prisma-pipelines.repository";

const principal: AuthPrincipal = { id: "membro", kind: "user", acesso: { plataforma: "admin", departamentos: [] } };

function setup(gerente = false) {
  const prisma = new PrismaService();
  vi.spyOn(prisma, "comContexto").mockImplementation(async (callback: unknown) => {
    if (typeof callback !== "function") throw new Error("Callback de contexto esperado.");
    return callback(prisma);
  });
  vi.spyOn(acesso, "lerAcessoComercial").mockResolvedValue({ podeOperar: true, admin: false, gestorEm: gerente ? ["plugga", "waze"] : [] });
  const pipelines = vi.spyOn(prisma.pipeline, "findMany").mockResolvedValue([]);
  const people = vi.spyOn(prisma.user, "findMany").mockResolvedValue([]);
  return { repo: new PrismaPipelinesRepository(prisma, new AuditAppender()), prisma, pipelines, people };
}
afterEach(() => vi.restoreAllMocks());

describe("Pipelines: metadados compartilhados da tela autorizada", () => {
  it("inclui contagens e membros de toda a tela sem expor e-mail no diretório", async () => {
    const { repo, pipelines, people } = setup();
    await repo.list(principal);
    expect(pipelines).toHaveBeenCalledWith(expect.objectContaining({ include: expect.objectContaining({
      stages: expect.objectContaining({ include: { _count: { select: { deals: true } } } }),
      _count: { select: { deals: true } },
      members: expect.objectContaining({ include: { user: { select: { id: true, name: true } } } }),
    }) }));
    expect(people.mock.calls[0]?.[0]?.where).not.toHaveProperty("id");
    expect(people).toHaveBeenCalledWith(expect.objectContaining({ select: { id: true, name: true } }));
  });

  it("mantém contagens gerais e catálogo elegível para a gestão atual do CRM", async () => {
    const { repo, pipelines, people } = setup(true);
    await repo.list(principal);
    expect(pipelines).toHaveBeenCalledWith(expect.objectContaining({
      include: expect.objectContaining({ _count: { select: { deals: true } } }),
    }));
    expect(people.mock.calls[0]?.[0]?.where).not.toHaveProperty("id");
  });

  it("revogação da tela impede ler contagens e diretório mesmo com papel antigo na sessão", async () => {
    const { repo, pipelines, people } = setup();
    vi.mocked(acesso.lerAcessoComercial).mockResolvedValue({ podeOperar: false, admin: false, gestorEm: [] });
    await expect(repo.list(principal)).rejects.toBeInstanceOf(AcessoNegado);
    await expect(repo.people({ companyId: "plugga" }, principal)).rejects.toBeInstanceOf(AcessoNegado);
    expect(pipelines).not.toHaveBeenCalled();
    expect(people).not.toHaveBeenCalled();
  });
});

describe("Configuração compartilha o lock transacional dos negócios", () => {
  const linha = {
    id: "00000000-0000-4000-8000-000000000100", companyId: "plugga", name: "Pipeline", description: null,
    valueLabel: "Valor", color: "#0077FF", wonLabel: "Ganho", lostLabel: "Perdido", archivedAt: null,
    updatedAt: new Date("2026-11-06T00:00:00Z"), updatedBy: null, tags: [], lossReasons: [], members: [], _count: { deals: 0 },
    stages: [{ id: "00000000-0000-4000-8000-000000000101", name: "Etapa", color: "#0077FF", position: 0, staleAfterDays: null, asksClientConversion: false, _count: { deals: 0 } }],
  };

  it.each(["update", "archive", "restore"] as const)("%s aguarda a mesma chave antes de alterar o pipeline", async (operation) => {
    const { repo, prisma, pipelines } = setup(true);
    const atual = { ...linha, archivedAt: operation === "restore" ? new Date() : null };
    vi.spyOn(prisma.pipeline, "findUnique").mockResolvedValue(atual as never);
    pipelines.mockResolvedValue([atual] as never);
    const parada = new Error("Parada após o lock; não persiste fixture.");
    const gravar = operation === "update" ? "updateMany" : "update";
    const escrita = vi.spyOn(prisma.pipeline, gravar).mockRejectedValue(parada);
    let liberar!: (count: number) => void;
    const bloqueado = new Promise<number>((resolve) => { liberar = resolve; });
    const lock = vi.spyOn(prisma, "$executeRaw").mockReturnValue(bloqueado as never);
    const [pipeline] = (await repo.list(principal)).pipelines;
    const executar = () => operation === "update"
      ? repo.update(linha.id, updatePipelineRequestSchema.parse(pipelineParaEdicao(pipeline!)), principal)
      : repo[operation](linha.id, principal);
    const trabalho = executar();
    await vi.waitFor(() => expect(lock).toHaveBeenCalledOnce());
    expect(escrita).not.toHaveBeenCalled();
    liberar(1);
    await expect(trabalho).rejects.toBe(parada);
    expect(escrita).toHaveBeenCalledOnce();
    expect(lock.mock.calls[0]?.[1]).toBe(`plugga:pipeline:${linha.id}`);
  });
});
