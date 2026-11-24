import { describe, expect, it } from "vitest";

import type { AuditAppender } from "../audit/audit-appender";
import type { PrismaService } from "../prisma/prisma.service";
import type { MovimentosDeEstoque } from "../estoque/movimentos-de-estoque";
import { PrismaComprasRepository } from "./prisma-compras.repository";

// Os filtros são puros: montam o `where` sem tocar no banco.
const repositorio = new PrismaComprasRepository({} as PrismaService, {} as AuditAppender, {} as MovimentosDeEstoque);

describe("filtroDaLista", () => {
  it("etapa e situação se somam, não se sobrescrevem", () => {
    expect(repositorio.filtroDaLista({ etapa: "cotacoes", situacao: "em_andamento" })).toEqual({
      AND: [{}, { etapa: "cotacoes" }, { canceladoEm: null }, { NOT: { etapa: "concluido" } }],
    });
    expect(repositorio.filtroDaLista({ etapa: "cotacoes", situacao: "concluido" })).toEqual({
      AND: [{}, { etapa: "cotacoes" }, { etapa: "concluido" }],
    });
  });

  it("busca por título ou pelo número, com ou sem o prefixo PC", () => {
    const busca = (termo: string) => repositorio.filtroDaLista({ busca: termo }).AND;
    expect(busca("PC-0131")).toContainEqual({ OR: [{ titulo: { contains: "PC-0131", mode: "insensitive" } }, { numero: 131 }] });
    expect(busca("cabos")).toContainEqual({ OR: [{ titulo: { contains: "cabos", mode: "insensitive" } }] });
  });

  it("empresa, responsável e período entram como condições próprias", () => {
    const filtro = repositorio.filtroDaLista({ empresa: "waze", de: "2026-11-01", situacao: "cancelado" });
    expect(filtro.AND).toEqual([
      { companyId: "waze" },
      { createdAt: { gte: new Date("2026-11-01T04:00:00.000Z") } },
      { canceladoEm: { not: null } },
    ]);
  });
});
