import { describe, expect, it } from "vitest";

import type { AuditAppender } from "../audit/audit-appender";
import type { PrismaService } from "../prisma/prisma.service";
import type { MovimentosDeEstoque } from "../estoque/movimentos-de-estoque";
import { PrismaComprasRepository } from "./prisma-compras.repository";

// Os filtros são puros: montam o `where` sem tocar no banco.
const repositorio = new PrismaComprasRepository({} as PrismaService, {} as AuditAppender, {} as MovimentosDeEstoque);

describe("detalhe", () => {
  it("acha a conta a pagar do pedido consultado com o id em maiúsculas (revisão leva 13)", async () => {
    const ID = "1e7c3a5b-0000-4000-8000-00000000000a";
    const conta = { id: "c0000000-0000-4000-8000-000000000001", codigo: "CP-0001", etapa: "aprovada", cancelado: false };
    const tx = { pedidoDeCompra: { findUnique: async () => ({ id: ID, clientId: null }) } };
    const prisma = { comContexto: (fazer: (t: unknown) => Promise<unknown>) => fazer(tx) } as unknown as PrismaService;
    // O Financeiro devolve as contas pelo id do banco (minúsculas).
    const contaDaCompra = { criarNaAprovacao: async () => null, cancelarComOPedido: async () => undefined, contasDosPedidos: async () => new Map([[ID, conta]]) };
    const comConta = new PrismaComprasRepository(prisma, {} as AuditAppender, {} as MovimentosDeEstoque, contaDaCompra as never);
    expect((await comConta.detalhe(ID.toUpperCase())).contaAPagar).toEqual(conta);
  });
});

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
