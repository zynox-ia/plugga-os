import { randomUUID } from "node:crypto";

import { acaoDoPedidoSchema, criarItemDeEstoqueSchema, criarPedidoDeCompraSchema, registrarMovimentacaoSchema } from "@plugga/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditAppender } from "../src/audit/audit-appender.js";
import { EstadoInvalido, RequisicaoInvalida } from "../src/common/errors/dominio.js";
import { PrismaComprasRepository } from "../src/compras/prisma-compras.repository.js";
import type { AuthPrincipal } from "../src/core/auth/auth.types.js";
import { MovimentosDeEstoque } from "../src/estoque/movimentos-de-estoque.js";
import { PrismaEstoqueRepository } from "../src/estoque/prisma-estoque.repository.js";
import { PrismaService } from "../src/prisma/prisma.service.js";

/**
 * Estoque (PLU-332) contra o Postgres de verdade: saldo acumulado igual à soma
 * do livro de movimentações, custo médio, concorrência entre duas saídas do
 * mesmo item, imutabilidade das movimentações e a ligação com o pedido de
 * compra (reserva, baixa, liberação e entrada no recebimento). O RLS fica em
 * rls-permissoes.
 *
 *     pnpm --filter @plugga/api test:estoque
 */
const HABILITADO = process.env.RUN_ESTOQUE_INTEGRATION_TESTS === "true";
const PRAZO_MS = 60_000;
const AGORA = new Date("2026-11-23T14:00:00Z");

describe.skipIf(!HABILITADO)("estoque: saldo, movimentações e reservas no Postgres", () => {
  const prisma = new PrismaService();
  const auditoria = new AuditAppender();
  const movimentos = new MovimentosDeEstoque(auditoria);
  const estoque = new PrismaEstoqueRepository(prisma, auditoria, movimentos);
  const compras = new PrismaComprasRepository(prisma, auditoria, movimentos);
  const marca = `est-${randomUUID().slice(0, 8)}`;
  let principal: AuthPrincipal;

  const criarItem = (dados: Record<string, unknown> = {}) => estoque.criar(criarItemDeEstoqueSchema.parse({
    empresa: "plugga", codigo: `${marca}-${randomUUID().slice(0, 4)}`.toUpperCase(), nome: `${marca} item`, categoria: "material_eletrico", unidade: "m", estoqueMinimo: "10", ...dados,
  }), principal, AGORA);
  const mover = (dados: unknown) => estoque.registrarMovimentacao(registrarMovimentacaoSchema.parse(dados), principal, AGORA);
  const saldo = (id: string) => prisma.itemDeEstoque.findUniqueOrThrow({ where: { id }, select: { emEstoque: true, reservado: true, custoMedio: true } });
  const livro = async (id: string) => {
    const linhas = await prisma.movimentacaoDeEstoque.findMany({ where: { itemId: id }, select: { tipo: true, quantidade: true, reservaId: true } });
    let emEstoque = 0;
    let reservado = 0;
    for (const m of linhas) {
      const q = Number(m.quantidade);
      if (m.tipo === "entrada" || m.tipo === "ajuste") emEstoque += q;
      if (m.tipo === "saida") { emEstoque -= q; if (m.reservaId) reservado -= q; }
      if (m.tipo === "reserva") reservado += q;
      if (m.tipo === "liberacao") reservado -= q;
    }
    return { emEstoque, reservado };
  };
  const pedidoAtendidoPeloEstoque = async (itemId: string, quantidade: string) => {
    const id = await compras.criar(criarPedidoDeCompraSchema.parse({
      empresa: "plugga", titulo: `${marca} pedido`, destino: "interno", prazoEntregaDesejado: "2026-12-10",
      itens: [{ descricao: "material", quantidade, itemDeEstoqueId: itemId }],
    }), principal, AGORA);
    await compras.executarAcao(id, acaoDoPedidoSchema.parse({ acao: "iniciar_analise" }), principal, AGORA);
    return id;
  };

  beforeAll(async () => {
    await prisma.$connect();
    const admin = await prisma.role.upsert({ where: { key: "admin" }, create: { key: "admin", name: "Admin" }, update: {} });
    for (const id of ["plugga", "waze"]) await prisma.company.upsert({ where: { id }, create: { id, name: id }, update: {} });
    const pessoa = await prisma.user.create({ data: { email: `${marca}@teste.local`, name: `${marca} Pessoa`, platformRoles: { create: { roleId: admin.id } } } });
    principal = { id: pessoa.id, kind: "user", acesso: { plataforma: "admin", departamentos: [] } };
  }, PRAZO_MS);

  afterAll(async () => {
    // Movimentação é só de inserção (trigger) e a evidência não sai em cascata: o
    // teardown, como dono do banco de teste, desliga as triggers só nesta sessão.
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL session_replication_role = replica");
      const itens = (await tx.itemDeEstoque.findMany({ where: { nome: { startsWith: marca } }, select: { id: true } })).map((i) => i.id);
      const pedidos = (await tx.pedidoDeCompra.findMany({ where: { titulo: { startsWith: marca } }, select: { id: true } })).map((p) => p.id);
      await tx.movimentacaoDeEstoque.deleteMany({ where: { OR: [{ itemId: { in: itens } }, { pedidoId: { in: pedidos } }] } });
      await tx.reservaDeEstoque.deleteMany({ where: { OR: [{ itemId: { in: itens } }, { pedidoId: { in: pedidos } }] } });
      await tx.pedidoDeCompra.deleteMany({ where: { id: { in: pedidos } } });
      await tx.itemDeEstoque.deleteMany({ where: { id: { in: itens } } });
    });
    await prisma.user.deleteMany({ where: { email: { startsWith: marca } } });
    await prisma.$disconnect();
  }, PRAZO_MS);

  it("saldo inicial, entrada com custo médio ponderado e o saldo igual ao livro", async () => {
    const id = await criarItem({ saldoInicial: "10", custoUnitario: "10.00" });
    await mover({ tipo: "entrada", itemId: id, quantidade: "30", custoUnitario: "14.00", origem: { tipo: "outra" } });
    await mover({ tipo: "ajuste", itemId: id, saldoContado: "38", observacao: "Contagem" });
    const atual = await saldo(id);
    expect(atual.emEstoque.toFixed(3)).toBe("38.000");
    expect(atual.custoMedio?.toFixed(4)).toBe("13.0000");
    expect(await livro(id)).toEqual({ emEstoque: 38, reservado: 0 });
  }, PRAZO_MS);

  it("código gerado em sequência por empresa", async () => {
    const a = await criarItem({ codigo: undefined, empresa: "waze" });
    const b = await criarItem({ codigo: undefined, empresa: "waze" });
    const [ca, cb] = await Promise.all([a, b].map(async (id) => (await prisma.itemDeEstoque.findUniqueOrThrow({ where: { id }, select: { codigo: true } })).codigo));
    expect(Number(cb!.slice(4))).toBe(Number(ca!.slice(4)) + 1);
  }, PRAZO_MS);

  it("duas saídas simultâneas do mesmo item: o disponível nunca fica negativo", async () => {
    const id = await criarItem({ saldoInicial: "10", custoUnitario: "1.00" });
    const resultados = await Promise.allSettled([
      mover({ tipo: "saida", itemId: id, quantidade: "7", destino: { tipo: "interno" } }),
      mover({ tipo: "saida", itemId: id, quantidade: "7", destino: { tipo: "interno" } }),
    ]);
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(resultados.find((r) => r.status === "rejected")).toMatchObject({ reason: expect.any(EstadoInvalido) });
    expect((await saldo(id)).emEstoque.toFixed(3)).toBe("3.000");
    expect(await livro(id)).toEqual({ emEstoque: 3, reservado: 0 });
  }, PRAZO_MS);

  it("a movimentação não se edita nem se apaga, nem pelo dono do banco", async () => {
    const id = await criarItem({ saldoInicial: "1", custoUnitario: "1.00" });
    const m = await prisma.movimentacaoDeEstoque.findFirstOrThrow({ where: { itemId: id } });
    await expect(prisma.movimentacaoDeEstoque.update({ where: { id: m.id }, data: { quantidade: 5 } })).rejects.toThrow();
    await expect(prisma.movimentacaoDeEstoque.delete({ where: { id: m.id } })).rejects.toThrow();
  }, PRAZO_MS);

  it("atender pelo estoque reserva, o recebimento baixa e o saldo bate com o livro", async () => {
    const id = await criarItem({ saldoInicial: "20", custoUnitario: "2.00" });
    const pedido = await pedidoAtendidoPeloEstoque(id, "8");
    expect((await compras.atendimento(pedido)).atendeTudo).toBe(true);
    await compras.executarAcao(pedido, acaoDoPedidoSchema.parse({ acao: "decidir_estoque", origem: "estoque" }), principal, AGORA);
    expect(await saldo(id)).toMatchObject({ emEstoque: expect.anything(), reservado: expect.anything() });
    expect((await saldo(id)).reservado.toFixed(3)).toBe("8.000");
    await expect(mover({ tipo: "saida", itemId: id, quantidade: "13", destino: { tipo: "interno" } })).rejects.toBeInstanceOf(EstadoInvalido);
    await expect(estoque.mudarSituacao(id, false, principal)).rejects.toBeInstanceOf(EstadoInvalido);

    await compras.executarAcao(pedido, acaoDoPedidoSchema.parse({ acao: "confirmar_recebimento" }), principal, AGORA);
    const depois = await saldo(id);
    expect([depois.emEstoque.toFixed(3), depois.reservado.toFixed(3)]).toEqual(["12.000", "0.000"]);
    expect(await prisma.reservaDeEstoque.findFirst({ where: { pedidoId: pedido }, select: { estado: true } })).toEqual({ estado: "baixada" });
    expect(await livro(id)).toEqual({ emEstoque: 12, reservado: 0 });
  }, PRAZO_MS);

  it("cancelar o pedido libera a reserva", async () => {
    const id = await criarItem({ saldoInicial: "5", custoUnitario: "2.00" });
    const pedido = await pedidoAtendidoPeloEstoque(id, "5");
    await compras.executarAcao(pedido, acaoDoPedidoSchema.parse({ acao: "decidir_estoque", origem: "estoque" }), principal, AGORA);
    await compras.executarAcao(pedido, acaoDoPedidoSchema.parse({ acao: "cancelar", motivo: "Desistiu" }), principal, AGORA);
    expect((await saldo(id)).reservado.toFixed(3)).toBe("0.000");
    expect(await prisma.reservaDeEstoque.findFirst({ where: { pedidoId: pedido }, select: { estado: true } })).toEqual({ estado: "liberada" });
    expect(await livro(id)).toEqual({ emEstoque: 5, reservado: 0 });
  }, PRAZO_MS);

  it("não dá para atender pelo estoque o que o estoque não tem, e a etapa não muda", async () => {
    const id = await criarItem({ saldoInicial: "2", custoUnitario: "2.00" });
    const pedido = await pedidoAtendidoPeloEstoque(id, "5");
    expect((await compras.atendimento(pedido)).atendeTudo).toBe(false);
    await expect(compras.executarAcao(pedido, acaoDoPedidoSchema.parse({ acao: "decidir_estoque", origem: "estoque" }), principal, AGORA)).rejects.toBeInstanceOf(EstadoInvalido);
    expect(await prisma.pedidoDeCompra.findUniqueOrThrow({ where: { id: pedido }, select: { etapa: true } })).toEqual({ etapa: "analise_estoque" });
    expect(await prisma.reservaDeEstoque.count({ where: { pedidoId: pedido } })).toBe(0);
  }, PRAZO_MS);

  it("o recebimento de aquisição dá entrada com o custo da compra", async () => {
    const id = await criarItem({ saldoInicial: "10", custoUnitario: "10.00" });
    const pedido = await pedidoAtendidoPeloEstoque(id, "10");
    const itemDoPedido = (await prisma.itemDePedido.findFirstOrThrow({ where: { pedidoId: pedido }, select: { id: true } })).id;
    await compras.executarAcao(pedido, acaoDoPedidoSchema.parse({ acao: "decidir_estoque", origem: "aquisicao" }), principal, AGORA);
    const fornecedor = await prisma.fornecedor.create({ data: { nome: `${marca} fornecedor`, categoria: "servico" } });
    try {
      const cotacao = await compras.registrarCotacao(pedido, { fornecedorId: fornecedor.id, valor: "200.00" }, { chave: `${marca}/c`, nome: "c.pdf", tamanho: 1, tipo: "application/pdf" }, principal);
      for (const acao of [{ acao: "selecionar_cotacao", cotacaoId: cotacao }, { acao: "enviar_para_aprovacao" }, { acao: "aprovar" }, { acao: "registrar_pagamento", forma: "pix" }]) {
        await compras.executarAcao(pedido, acaoDoPedidoSchema.parse(acao), principal, AGORA);
      }
      await compras.executarAcao(pedido, acaoDoPedidoSchema.parse({
        acao: "confirmar_recebimento", valorFaturado: "200.00", entradaNoEstoque: [{ itemDoPedidoId: itemDoPedido, quantidade: "10", custoUnitario: "20.00" }],
      }), principal, AGORA);
      const depois = await saldo(id);
      expect([depois.emEstoque.toFixed(3), depois.custoMedio?.toFixed(4)]).toEqual(["20.000", "15.0000"]);
      expect(await prisma.movimentacaoDeEstoque.findFirst({ where: { itemId: id, pedidoId: pedido }, select: { tipo: true, origem: true } })).toEqual({ tipo: "entrada", origem: "compra" });
    } finally {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL session_replication_role = replica");
        await tx.pedidoDeCompra.updateMany({ where: { id: pedido }, data: { cotacaoSelecionadaId: null } });
        await tx.cotacaoDeCompra.deleteMany({ where: { pedidoId: pedido } });
        await tx.fornecedor.delete({ where: { id: fornecedor.id } });
      });
    }
  }, PRAZO_MS);

  it("um pedido não entra no estoque mais do que pediu: entrada manual + recebimento", async () => {
    const id = await criarItem();
    const pedido = await pedidoAtendidoPeloEstoque(id, "10");
    await mover({ tipo: "entrada", itemId: id, quantidade: "6", custoUnitario: "1.00", origem: { tipo: "compra", pedidoId: pedido } });
    await expect(mover({ tipo: "entrada", itemId: id, quantidade: "5", custoUnitario: "1.00", origem: { tipo: "compra", pedidoId: pedido } }))
      .rejects.toThrow(/já deu entrada de 6\.000 m/);
    await mover({ tipo: "entrada", itemId: id, quantidade: "4", custoUnitario: "1.00", origem: { tipo: "compra", pedidoId: pedido } });
    expect((await saldo(id)).emEstoque.toFixed(3)).toBe("10.000");

    const outro = await criarItem();
    await expect(mover({ tipo: "entrada", itemId: outro, quantidade: "1", custoUnitario: "1.00", origem: { tipo: "compra", pedidoId: pedido } }))
      .rejects.toBeInstanceOf(RequisicaoInvalida);
  }, PRAZO_MS);

  it("item de estoque de outra empresa não pode ser vinculado ao pedido", async () => {
    const daWaze = await criarItem({ empresa: "waze" });
    await expect(compras.criar(criarPedidoDeCompraSchema.parse({
      empresa: "plugga", titulo: `${marca} pedido`, destino: "interno", prazoEntregaDesejado: "2026-12-10",
      itens: [{ descricao: "x", quantidade: "1", itemDeEstoqueId: daWaze }],
    }), principal, AGORA)).rejects.toBeInstanceOf(RequisicaoInvalida);
  }, PRAZO_MS);
});
