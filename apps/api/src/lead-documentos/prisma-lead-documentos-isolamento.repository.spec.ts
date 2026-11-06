import { ConfigService } from "@nestjs/config";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuditAppender } from "../audit/audit-appender";
import { NaoEncontrado } from "../common/errors/dominio";
import type { AuthPrincipal } from "../core/auth/auth.types";
import * as acesso from "../pipelines/acesso-comercial";
import { PrismaService } from "../prisma/prisma.service";
import { ArmazenamentoDeDocumentos } from "./armazenamento-de-documentos";
import { PrismaLeadDocumentosRepository } from "./prisma-lead-documentos.repository";

const principal: AuthPrincipal = { id: "membro", kind: "user", acesso: { plataforma: "admin", departamentos: [] } };
afterEach(() => vi.restoreAllMocks());

describe("Documentos: isolamento do negócio pai", () => {
  it("recusa listar, enviar, editar, arquivar, baixar e visualizar arquivos alheios sem acessar storage", async () => {
    const prisma = new PrismaService();
    vi.spyOn(prisma, "$queryRaw").mockResolvedValue([]);
    vi.spyOn(prisma, "$transaction").mockImplementation(async (callback: unknown) => {
      if (typeof callback !== "function") throw new Error("Transação interativa esperada.");
      return callback(prisma);
    });
    const storage = new ArmazenamentoDeDocumentos(new ConfigService());
    vi.spyOn(acesso, "lerAcessoComercial").mockResolvedValue({ podeOperar: true, admin: false, gestorEm: [] });
    vi.spyOn(prisma.deal, "findUnique").mockResolvedValue({ pipelineId: "pipeline", ownerId: "outro" } as never);
    vi.spyOn(prisma.pipeline, "findUnique").mockResolvedValue({ id: "pipeline", companyId: "plugga" } as never);
    const read = vi.spyOn(storage, "ler");
    const upload = vi.spyOn(storage, "enviar");
    const repo = new PrismaLeadDocumentosRepository(prisma, new AuditAppender(), storage);
    const operations = [
      () => repo.list("deal", principal),
      () => repo.upload("deal", "outros", { originalName: "arquivo.pdf", buffer: Buffer.from("sintético") }, principal),
      () => repo.update("deal", "doc", { category: "outros" }, principal),
      () => repo.archive("deal", "doc", principal),
      () => repo.download("deal", "doc", principal),
      () => repo.preview("deal", "doc", principal),
    ];
    for (const operation of operations) await expect(operation()).rejects.toBeInstanceOf(NaoEncontrado);
    expect(read).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });
});
