import { randomBytes, randomUUID } from "node:crypto";

import {
  acaoDoPedidoSchema,
  criarItemDeEstoqueSchema,
  criarPedidoDeCompraSchema,
  editarItemDeEstoqueSchema,
  editarPedidoDeCompraSchema,
  registrarMovimentacaoSchema,
  type Acesso,
} from "@plugga/shared";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditAppender } from "../src/audit/audit-appender.js";
import { EstadoInvalido, RequisicaoInvalida } from "../src/common/errors/dominio.js";
import { ComprasService } from "../src/compras/compras.service.js";
import { PrismaComprasRepository } from "../src/compras/prisma-compras.repository.js";
import { travarPedidoDeCompra } from "../src/compras/trava-do-pedido.js";
import type { AuthPrincipal } from "../src/core/auth/auth.types.js";
import { MovimentosDeEstoque } from "../src/estoque/movimentos-de-estoque.js";
import { PrismaEstoqueRepository } from "../src/estoque/prisma-estoque.repository.js";
import { contextoBanco } from "../src/prisma/contexto-banco.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { assertSafeTestDatabaseUrl } from "./safe-test-environment";

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
/** Corridas: a barreira desiste antes de a transação que segura expirar. */
const PRAZO_DA_BARREIRA = 20_000;
const PRAZO_DA_TRANSACAO = 40_000;

describe.skipIf(!HABILITADO)("estoque: saldo, movimentações e reservas no Postgres", () => {
  const prisma = new PrismaService();
  const auditoria = new AuditAppender();
  const movimentos = new MovimentosDeEstoque(auditoria);
  const estoque = new PrismaEstoqueRepository(prisma, auditoria, movimentos);
  const compras = new PrismaComprasRepository(prisma, auditoria, movimentos);
  const marca = `est-${randomUUID().slice(0, 8)}`;
  let principal: AuthPrincipal;
  let sessao: string;
  // A conexão é a do dono (sem RLS), mas o limite da entrada por compra lê pela
  // função restrita do banco, que confere a tela da sessão: ela precisa existir.
  const naSessao = <T>(fazer: () => Promise<T>) => contextoBanco.run({ sessionHash: sessao, agentHash: undefined }, fazer);

  const criarItem = (dados: Record<string, unknown> = {}) => estoque.criar(criarItemDeEstoqueSchema.parse({
    empresa: "plugga", codigo: `${marca}-${randomUUID().slice(0, 4)}`.toUpperCase(), nome: `${marca} item`, categoria: "material_eletrico", unidade: "m", estoqueMinimo: "10", ...dados,
  }), principal, AGORA);
  const mover = (dados: unknown) => naSessao(() => estoque.registrarMovimentacao(registrarMovimentacaoSchema.parse(dados), principal, AGORA));
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
    sessao = randomBytes(32).toString("hex");
    await prisma.session.create({ data: { userId: pessoa.id, tokenHash: sessao, expiresAt: new Date(Date.now() + 3_600_000), absoluteExpiresAt: new Date(Date.now() + 7_200_000) } });
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

    // O material chegou na sexta (20/11), mas o recebimento é registrado na segunda (23/11).
    await prisma.pedidoDeCompra.update({ where: { id: pedido }, data: { createdAt: new Date("2026-11-18T14:00:00Z") } });
    await compras.executarAcao(pedido, acaoDoPedidoSchema.parse({ acao: "confirmar_recebimento", recebidoEm: "2026-11-20" }), principal, AGORA);
    const depois = await saldo(id);
    expect([depois.emEstoque.toFixed(3), depois.reservado.toFixed(3)]).toEqual(["12.000", "0.000"]);
    const baixa = await prisma.movimentacaoDeEstoque.findFirstOrThrow({ where: { itemId: id, pedidoId: pedido, tipo: "saida" }, select: { data: true } });
    expect(baixa.data.toISOString()).toBe("2026-11-20T04:00:00.000Z");
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

  it("a análise soma as linhas do mesmo item e não conta item inativo (auditoria 27/11, S2 2)", async () => {
    const id = await criarItem({ saldoInicial: "5", custoUnitario: "2.00" });
    const pedido = await compras.criar(criarPedidoDeCompraSchema.parse({
      empresa: "plugga", titulo: `${marca} pedido`, destino: "interno", prazoEntregaDesejado: "2026-12-10",
      itens: [{ descricao: "primeira", quantidade: "4", itemDeEstoqueId: id }, { descricao: "segunda", quantidade: "4", itemDeEstoqueId: id }],
    }), principal, AGORA);
    await compras.executarAcao(pedido, acaoDoPedidoSchema.parse({ acao: "iniciar_analise" }), principal, AGORA);
    const analise = await compras.atendimento(pedido);
    // As duas linhas nascem juntas e a ordem entre elas é a do id; a primeira lida leva os 4, a outra o que sobra.
    expect(analise.itens.map((i) => [i.atende, i.motivo, i.pedidoDoItem])).toEqual([["4.000", null, "8.000"], ["1.000", "insuficiente", "8.000"]]);
    expect(analise.atendeTudo).toBe(false);
    // A análise e a reserva concordam: a reserva recusa o que a análise diz que não cobre.
    await expect(compras.executarAcao(pedido, acaoDoPedidoSchema.parse({ acao: "decidir_estoque", origem: "estoque" }), principal, AGORA)).rejects.toBeInstanceOf(EstadoInvalido);

    const inativo = await criarItem({ saldoInicial: "10", custoUnitario: "2.00" });
    const outro = await pedidoAtendidoPeloEstoque(inativo, "3");
    await estoque.mudarSituacao(inativo, false, principal);
    const doInativo = await compras.atendimento(outro);
    expect(doInativo.itens.map((i) => [i.atende, i.motivo])).toEqual([["0.000", "inativo"]]);
    expect(doInativo.atendeTudo).toBe(false);
  }, PRAZO_MS);

  it("vincular depois: a linha sem unidade adota a do item; a em outra unidade é recusada (fatia 3c)", async () => {
    const id = await criarItem();
    const pedido = await compras.criar(criarPedidoDeCompraSchema.parse({
      empresa: "plugga", titulo: `${marca} pedido`, destino: "interno", prazoEntregaDesejado: "2026-12-10",
      itens: [{ descricao: "sem unidade", quantidade: "1" }, { descricao: "em caixas", quantidade: "2", unidade: "cx" }],
    }), principal, AGORA);
    const linhas = await prisma.itemDePedido.findMany({ where: { pedidoId: pedido }, select: { id: true, descricao: true }, orderBy: { quantidade: "asc" } });
    await expect(compras.vincularItens(pedido, { itens: [{ itemDoPedidoId: linhas[1]!.id, itemDeEstoqueId: id }] }, principal)).rejects.toThrow(/“em caixas” está em cx/);
    // Ids em maiúsculas (o contrato aceita): a conferência não pode perdê-los (revisão leva 9).
    await expect(compras.vincularItens(pedido, { itens: [{ itemDoPedidoId: linhas[1]!.id.toUpperCase(), itemDeEstoqueId: id.toUpperCase() }] }, principal)).rejects.toThrow(/“em caixas” está em cx/);
    await compras.vincularItens(pedido, { itens: [{ itemDoPedidoId: linhas[0]!.id, itemDeEstoqueId: id }] }, principal);
    const depois = await prisma.itemDePedido.findMany({ where: { pedidoId: pedido }, select: { unidade: true, itemDeEstoqueId: true }, orderBy: { quantidade: "asc" } });
    expect(depois).toEqual([{ unidade: "m", itemDeEstoqueId: id }, { unidade: "cx", itemDeEstoqueId: null }]);
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
      await naSessao(() => compras.executarAcao(pedido, acaoDoPedidoSchema.parse({
        acao: "confirmar_recebimento", recebidoEm: "2026-11-23", valorFaturado: "200.00", entradaNoEstoque: [{ itemDoPedidoId: itemDoPedido, quantidade: "10", custoUnitario: "20.00" }],
      }), principal, AGORA));
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

/**
 * O mesmo Estoque no login da aplicação (sem ser dono, com RLS), com quem só
 * tem a tela de Estoque. A auditoria de 27/11/2026 (S2 1) achou que esse perfil
 * não registrava entrada ligada a pedido: o limite lia `itens_de_pedido`, que
 * a política de leitura não abre para Estoque.
 */
describe.skipIf(!HABILITADO)("estoque: operador só com a tela de Estoque, no login da aplicação", () => {
  const root = new PrismaClient();
  const marca = `estrls_${randomBytes(6).toString("hex")}`;
  const login = `${marca}_app`;
  const pessoas = new Map<string, { id: string; hash: string; acesso: Acesso }>();
  let app: PrismaService;
  let estoque: PrismaEstoqueRepository;
  let compras: PrismaComprasRepository;
  // Compras e Estoque de verdade, que seguram a transação aberta ao gravar o evento armado:
  // a operação já mudou o banco e ainda não confirmou, a janela da corrida. Sem esperas fixas:
  // o teste confere em pg_locks que a outra operação está parada numa trava e só então libera.
  let comprasLento: PrismaComprasRepository;
  let estoqueLento: PrismaEstoqueRepository;
  const lenta = new (class extends AuditAppender {
    private alvo: string | null = null;
    private avisar: ((pid: number) => void) | null = null;
    private soltar: (() => void) | null = null;
    /** A próxima gravação do evento segura a transação até `liberar()`; a promessa resolve com o PID do backend que segura. */
    armar(evento: string): Promise<number> {
      this.alvo = evento;
      return new Promise((r) => { this.avisar = r; });
    }
    liberar(): void {
      this.alvo = null;
      this.soltar?.();
      this.soltar = null;
    }
    override async append(tx: Parameters<AuditAppender["append"]>[0], evento: Parameters<AuditAppender["append"]>[1]): Promise<void> {
      await super.append(tx, evento);
      if (evento.eventName !== this.alvo) return;
      this.alvo = null;
      const [{ pid }] = (await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`) as [{ pid: number }];
      await new Promise<void>((r) => { this.soltar = r; this.avisar?.(pid); });
    }
  })();
  let ambienteValidado = false;
  const depois = (ms: number) => new Promise((r) => setTimeout(r, ms));
  /**
   * Espera um backend ficar parado numa trava SEGURADA pelo PID indicado (do
   * tipo indicado, se houver): identifica os participantes, não "alguma trava".
   * O limite fica bem abaixo do prazo das transações do teste (PRAZO_DA_TRANSACAO).
   */
  const esperandoTrava = async (quemSegura: number, tipo: "advisory" | null = null) => {
    const limite = Date.now() + PRAZO_DA_BARREIRA;
    while (Date.now() < limite) {
      const [r] = await root.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n FROM pg_locks l
        WHERE NOT l.granted AND ${quemSegura}::int = ANY(pg_blocking_pids(l.pid)) AND (${tipo}::text IS NULL OR l.locktype = ${tipo}::text)`;
      if (r!.n > 0) return;
      await depois(25);
    }
    throw new Error(`nenhuma operação ficou esperando ${tipo ?? "uma"} trava do backend ${quemSegura}`);
  };
  /** Arma o evento, dispara a operação que segura, espera chegar, dispara a concorrente e só libera quando ela está esperando a que segura. */
  const corrida = async <A, B>(evento: string, segura: () => Promise<A>, concorrente: () => Promise<B>, tipo: "advisory" | null = null) => {
    const chegou = lenta.armar(evento);
    const primeira = segura();
    const falhouAntes = primeira.then(() => { throw new Error("a operação terminou sem passar pelo evento armado"); }, (erro: unknown) => { throw erro; });
    try {
      const pid = await Promise.race([chegou, falhouAntes]);
      const segunda = concorrente();
      segunda.catch(() => undefined);
      await esperandoTrava(pid, tipo);
      lenta.liberar();
      return await Promise.allSettled([primeira, segunda]);
    } finally {
      lenta.liberar();
      falhouAntes.catch(() => undefined);
    }
  };

  const principal = (nome: string): AuthPrincipal => ({ id: pessoas.get(nome)!.id, kind: "user", acesso: pessoas.get(nome)!.acesso });
  const como = <T>(nome: string, fazer: () => Promise<T>) => contextoBanco.run({ sessionHash: pessoas.get(nome)!.hash, agentHash: undefined }, fazer);
  const criarItem = (dados: Record<string, unknown> = {}) => como("estoque", () => estoque.criar(criarItemDeEstoqueSchema.parse({
    empresa: "plugga", codigo: `${marca}-${randomBytes(2).toString("hex")}`.toUpperCase().replace(/_/g, "-"), nome: `${marca} item`, categoria: "material_eletrico", unidade: "m", estoqueMinimo: "0", ...dados,
  }), principal("estoque"), AGORA));
  const entrada = (itemId: string, quantidade: string, pedidoId: string) => como("estoque", () => estoque.registrarMovimentacao(registrarMovimentacaoSchema.parse({
    tipo: "entrada", itemId, quantidade, custoUnitario: "1.00", origem: { tipo: "compra", pedidoId },
  }), principal("estoque"), AGORA));
  const pedidoCom = (itens: { quantidade: string; itemDeEstoqueId?: string }[], empresa = "plugga") => como("compras", () => compras.criar(criarPedidoDeCompraSchema.parse({
    empresa, titulo: `${marca} pedido`, destino: "interno", prazoEntregaDesejado: "2026-12-10",
    itens: itens.map((i) => ({ descricao: "material", ...i })),
  }), principal("compras"), AGORA));
  const emEstoque = async (id: string) => (await root.itemDeEstoque.findUniqueOrThrow({ where: { id }, select: { emEstoque: true } })).emEstoque.toFixed(3);

  beforeAll(async () => {
    assertSafeTestDatabaseUrl(process.env.DATABASE_URL!, process.env.CI === "true", process.env.PLUGGA_TEST_DB_PORT);
    ambienteValidado = true;
    await root.$connect();
    if (!/^estrls_[a-f0-9]+_app$/.test(login)) throw new Error("Login de fixture inválido");
    const senha = randomBytes(32).toString("hex");
    await root.$transaction(async (t) => {
      await t.$executeRaw`SELECT set_config('plugga.test_role', ${login}, true)`;
      await t.$executeRaw`SELECT set_config('plugga.test_password', ${senha}, true)`;
      await t.$executeRawUnsafe(`DO $fixture$ BEGIN EXECUTE format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L', current_setting('plugga.test_role'), current_setting('plugga.test_password')); END $fixture$`);
    });
    await root.$executeRawUnsafe(`GRANT plugga_runtime TO "${login}"`);
    const url = new URL(process.env.DATABASE_URL!);
    url.username = login;
    url.password = senha;
    url.searchParams.set("connection_limit", "10");
    // O prazo das transações do teste cobre a barreira com folga (a de produção é a padrão do Prisma, 5 s).
    app = new PrismaService({ datasources: { db: { url: url.toString() } }, transactionOptions: { timeout: PRAZO_DA_TRANSACAO } });
    const auditoria = new AuditAppender();
    const movimentos = new MovimentosDeEstoque(auditoria);
    estoque = new PrismaEstoqueRepository(app, auditoria, movimentos);
    compras = new PrismaComprasRepository(app, auditoria, movimentos);
    comprasLento = new PrismaComprasRepository(app, lenta, new MovimentosDeEstoque(lenta));
    estoqueLento = new PrismaEstoqueRepository(app, lenta, new MovimentosDeEstoque(lenta));

    for (const id of ["plugga", "waze"]) await root.company.upsert({ where: { id }, create: { id, name: id }, update: {} });
    const perfis: Record<string, string[]> = { estoque: ["suprimentos.estoque"], compras: ["suprimentos.compras"] };
    for (const [nome, telas] of Object.entries(perfis)) {
      const pessoa = await root.user.create({ data: { name: `${marca} ${nome}`, email: `${marca}-${nome}@teste.local` } });
      const hash = randomBytes(32).toString("hex");
      await root.session.create({ data: { userId: pessoa.id, tokenHash: hash, expiresAt: new Date(Date.now() + 3_600_000), absoluteExpiresAt: new Date(Date.now() + 7_200_000) } });
      await root.userDepartamento.create({ data: { userId: pessoa.id, departamento: "suprimentos", nivel: "membro", telas } });
      pessoas.set(nome, { id: pessoa.id, hash, acesso: { plataforma: null, departamentos: [{ departamento: "suprimentos", nivel: "membro", telas }] } as Acesso });
    }
  }, PRAZO_MS);

  afterAll(async () => {
    await app?.$disconnect();
    if (ambienteValidado) {
      await root.$transaction(async (t) => {
        await t.$executeRawUnsafe("SET LOCAL session_replication_role = replica");
        const itens = (await t.itemDeEstoque.findMany({ where: { nome: { startsWith: marca } }, select: { id: true } })).map((i) => i.id);
        const pedidos = (await t.pedidoDeCompra.findMany({ where: { titulo: { startsWith: marca } }, select: { id: true } })).map((p) => p.id);
        await t.movimentacaoDeEstoque.deleteMany({ where: { OR: [{ itemId: { in: itens } }, { pedidoId: { in: pedidos } }] } });
        await t.reservaDeEstoque.deleteMany({ where: { OR: [{ itemId: { in: itens } }, { pedidoId: { in: pedidos } }] } });
        await t.pedidoDeCompra.deleteMany({ where: { id: { in: pedidos } } });
        await t.itemDeEstoque.deleteMany({ where: { id: { in: itens } } });
      });
      await root.user.deleteMany({ where: { email: { startsWith: marca } } });
      await root.$executeRawUnsafe(`DROP ROLE IF EXISTS "${login}"`);
    }
    await root.$disconnect();
  }, PRAZO_MS);

  it("registra a entrada ligada ao pedido e respeita o que o pedido pediu do item", async () => {
    const item = await criarItem();
    const pedido = await pedidoCom([{ quantidade: "6", itemDeEstoqueId: item }, { quantidade: "4", itemDeEstoqueId: item }]);
    await entrada(item, "7", pedido);
    await expect(entrada(item, "4", pedido)).rejects.toThrow(/já deu entrada de 7\.000 m deste item, de 10\.000 m pedidos/);
    await entrada(item, "3", pedido);
    expect(await emEstoque(item)).toBe("10.000");
  }, PRAZO_MS);

  it("lista só os pedidos que ainda aceitam entrada do item, com o mínimo do pedido", async () => {
    const item = await criarItem({ saldoInicial: "50", custoUnitario: "1.00" });
    const outroItem = await criarItem();
    const aberto = await pedidoCom([{ quantidade: "6", itemDeEstoqueId: item }, { quantidade: "4", itemDeEstoqueId: item }, { quantidade: "9", itemDeEstoqueId: outroItem }, { quantidade: "2" }]);
    const recebido = await pedidoCom([{ quantidade: "2", itemDeEstoqueId: item }]);
    await entrada(item, "2", recebido);
    const cancelado = await pedidoCom([{ quantidade: "3", itemDeEstoqueId: item }]);
    await como("compras", () => compras.executarAcao(cancelado, acaoDoPedidoSchema.parse({ acao: "cancelar", motivo: "Desistiu" }), principal("compras"), AGORA));
    const peloEstoque = await pedidoCom([{ quantidade: "1", itemDeEstoqueId: item }]);
    for (const acao of [{ acao: "iniciar_analise" }, { acao: "decidir_estoque", origem: "estoque" }]) {
      await como("compras", () => compras.executarAcao(peloEstoque, acaoDoPedidoSchema.parse(acao), principal("compras"), AGORA));
    }
    const semVinculo = await pedidoCom([{ quantidade: "5" }]);
    await entrada(item, "1", aberto);

    const lista = await como("estoque", () => estoque.pedidosParaEntrada(item));
    expect(lista).toEqual([{ id: aberto, numero: expect.any(Number), titulo: `${marca} pedido`, etapa: "pedido_gerado", pedida: "10.000", recebida: "1.000", falta: "9.000" }]);

    await expect(entrada(item, "1", cancelado)).rejects.toThrow(/está cancelado/);
    await expect(entrada(item, "1", peloEstoque)).rejects.toThrow(/atendido pelo estoque/);
    await expect(entrada(item, "1", semVinculo)).rejects.toBeInstanceOf(RequisicaoInvalida);
    await expect(entrada(item, "1", recebido)).rejects.toThrow(/já deu entrada de 2\.000 m deste item, de 2\.000 m pedidos/);
  }, PRAZO_MS);

  it("corrida com o cancelamento: a entrada espera o pedido e não entra em pedido cancelado (revisão leva 3, S2)", async () => {
    const item = await criarItem();
    const pedido = await pedidoCom([{ quantidade: "10", itemDeEstoqueId: item }]);
    const [cancelou, entrada1] = await corrida("compras.pedido.cancelado",
      () => como("compras", () => comprasLento.executarAcao(pedido, acaoDoPedidoSchema.parse({ acao: "cancelar", motivo: "Desistiu" }), principal("compras"), AGORA)),
      () => entrada(item, "5", pedido), "advisory");
    expect(cancelou.status).toBe("fulfilled");
    expect(entrada1).toMatchObject({ status: "rejected", reason: expect.objectContaining({ message: expect.stringMatching(/está cancelado/) }) });
    expect(await emEstoque(item)).toBe("0.000");
  }, PRAZO_MS);

  it("corrida com a edição das linhas: a entrada confere as linhas novas (revisão leva 3, S2)", async () => {
    const item = await criarItem();
    const pedido = await pedidoCom([{ quantidade: "10", itemDeEstoqueId: item }]);
    // A edição tira o vínculo com o item: apagar a linha antiga não trava o item, só o pedido.
    const [editou, entrada1] = await corrida("compras.pedido.updated",
      () => como("compras", () => comprasLento.editar(pedido, editarPedidoDeCompraSchema.parse({ itens: [{ descricao: "material", quantidade: "10" }] }), principal("compras"), AGORA)),
      () => entrada(item, "8", pedido), "advisory");
    expect(editou.status).toBe("fulfilled");
    expect(entrada1).toMatchObject({ status: "rejected", reason: expect.objectContaining({ message: expect.stringMatching(/não tem este item vinculado/) }) });
    expect(await emEstoque(item)).toBe("0.000");
  }, PRAZO_MS);

  it("duas entradas simultâneas chegando ao limite do pedido: só uma passa", async () => {
    const item = await criarItem();
    const pedido = await pedidoCom([{ quantidade: "10", itemDeEstoqueId: item }]);
    const resultados = await Promise.allSettled([entrada(item, "6", pedido), entrada(item, "6", pedido)]);
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(resultados.find((r) => r.status === "rejected")).toMatchObject({ reason: expect.any(EstadoInvalido) });
    expect(await emEstoque(item)).toBe("6.000");
  }, PRAZO_MS);

  it("a entrada espera a trava do pedido antes de travar o item, com o id do pedido em qualquer grafia (revisão leva 6)", async () => {
    const item = await criarItem();
    const pedido = await pedidoCom([{ quantidade: "10", itemDeEstoqueId: item }]);
    let entrou: Promise<unknown> | undefined;
    await root.$transaction(async (t) => {
      // Outra transação segura a trava do pedido, pedida com o id em maiúsculas.
      await travarPedidoDeCompra(t, pedido.toUpperCase());
      const [{ pid }] = (await t.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`) as [{ pid: number }];
      entrou = entrada(item, "4", pedido);
      entrou.catch(() => undefined);
      await esperandoTrava(pid, "advisory");
      // Parada na trava do pedido, a entrada ainda não pegou o item: ele está livre.
      expect(await t.$queryRaw<{ id: string }[]>`SELECT id FROM public.itens_de_estoque WHERE id = ${item}::uuid FOR UPDATE NOWAIT`).toHaveLength(1);
    }, { timeout: PRAZO_DA_TRANSACAO });
    await entrou;
    expect(await emEstoque(item)).toBe("4.000");
  }, PRAZO_MS);

  it("a função restrita não entrega nada sem sessão, nem para par item/pedido de outra empresa (revisão leva 3, S3)", async () => {
    const item = await criarItem();
    const pedido = await pedidoCom([{ quantidade: "3", itemDeEstoqueId: item }]);
    const consultar = (itemId: string, pedidoId: string | null) => app.comContexto((tx) => tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM plugga_security.pedidos_para_entrada_do_item(${itemId}::uuid, ${pedidoId}::uuid)`);
    expect(await como("estoque", () => consultar(item, pedido))).toHaveLength(1);
    // Sem sessão (o login da aplicação sem o hash): nada.
    expect(await contextoBanco.run({}, () => consultar(item, pedido))).toEqual([]);
    // Pedido da Waze com linha apontando para o item da Plugga (gravado pelo dono, fora das regras): a função não liga os dois.
    const daWaze = await pedidoCom([{ quantidade: "3" }], "waze");
    await root.itemDePedido.updateMany({ where: { pedidoId: daWaze }, data: { itemDeEstoqueId: item } });
    expect(await como("estoque", () => consultar(item, daWaze))).toEqual([]);
    await expect(entrada(item, "1", daWaze)).rejects.toBeInstanceOf(RequisicaoInvalida);
    // Item sem vínculo com o pedido pedido explicitamente: nada.
    const outro = await criarItem();
    expect(await como("estoque", () => consultar(outro, pedido))).toEqual([]);
  }, PRAZO_MS);

  describe("invariantes sob concorrência (auditoria 27/11, S2 4 e S3 das travas)", () => {
    const empresaDe = async (id: string) => (await root.itemDeEstoque.findUniqueOrThrow({ where: { id }, select: { companyId: true } })).companyId;
    const trocarEmpresa = (id: string, repo = estoque) => como("estoque", () => repo.editar(id, editarItemDeEstoqueSchema.parse({ empresa: "waze" }), principal("estoque")));

    it("a empresa do item não muda depois de vinculado a pedido, nem para quem só tem Estoque", async () => {
      const item = await criarItem();
      await pedidoCom([{ quantidade: "1", itemDeEstoqueId: item }]);
      expect((await como("estoque", () => estoque.obter(item, AGORA))).podeTrocarEmpresa).toBe(false);
      await expect(trocarEmpresa(item)).rejects.toBeInstanceOf(EstadoInvalido);
      expect(await empresaDe(item)).toBe("plugga");
    }, PRAZO_MS);

    it("a empresa não muda enquanto uma movimentação do item está gravando", async () => {
      const item = await criarItem();
      const [moveu, trocou] = await corrida("estoque.movimentacao.created",
        () => como("estoque", () => estoqueLento.registrarMovimentacao(registrarMovimentacaoSchema.parse({
          tipo: "entrada", itemId: item, quantidade: "2", custoUnitario: "1.00", origem: { tipo: "outra" },
        }), principal("estoque"), AGORA)),
        () => trocarEmpresa(item));
      expect(moveu.status).toBe("fulfilled");
      expect(trocou).toMatchObject({ status: "rejected", reason: expect.any(EstadoInvalido) });
      expect(await empresaDe(item)).toBe("plugga");
    }, PRAZO_MS);

    it("o pedido não vincula o item cuja empresa está mudando", async () => {
      const item = await criarItem();
      const [trocou, vinculou] = await corrida("estoque.item.updated", () => trocarEmpresa(item, estoqueLento), () => pedidoCom([{ quantidade: "1", itemDeEstoqueId: item }]));
      expect(trocou.status).toBe("fulfilled");
      expect(vinculou).toMatchObject({ status: "rejected", reason: expect.any(RequisicaoInvalida) });
      expect(await root.itemDePedido.count({ where: { itemDeEstoqueId: item } })).toBe(0);
    }, PRAZO_MS);

    it("reservas de dois itens em ordem inversa: a segunda espera a primeira, sem ciclo (revisão da fatia 3)", async () => {
      const [a, b] = await Promise.all([criarItem({ saldoInicial: "10", custoUnitario: "1.00" }), criarItem({ saldoInicial: "10", custoUnitario: "1.00" })]);
      const emAnalise = async (itens: string[]) => {
        const id = await pedidoCom(itens.map((item) => ({ quantidade: "2", itemDeEstoqueId: item })));
        await como("compras", () => compras.executarAcao(id, acaoDoPedidoSchema.parse({ acao: "iniciar_analise" }), principal("compras"), AGORA));
        return id;
      };
      const primeiro = await emAnalise([a!, b!]);
      const segundo = await emAnalise([b!, a!]);
      const decidir = (repo: PrismaComprasRepository, id: string) => () => como("compras", () => repo.executarAcao(id, acaoDoPedidoSchema.parse({ acao: "decidir_estoque", origem: "estoque" }), principal("compras"), AGORA));
      // O primeiro segura a transação depois da primeira reserva (os dois itens já travados); o segundo fica esperando item.
      const [r1, r2] = await corrida("estoque.reserva.created", decidir(comprasLento, primeiro), decidir(compras, segundo));
      expect([r1.status, r2.status]).toEqual(["fulfilled", "fulfilled"]);
      for (const item of [a!, b!]) {
        expect((await root.itemDeEstoque.findUniqueOrThrow({ where: { id: item }, select: { reservado: true } })).reservado.toFixed(3)).toBe("4.000");
      }
    }, PRAZO_MS);

    it("reservas simultâneas do mesmo item e entrada ligada a outro pedido não se travam em ciclo", async () => {
      const itens = await Promise.all([1, 2, 3].map(() => criarItem({ saldoInicial: "100", custoUnitario: "1.00" })));
      const emAnalise = async (item: string) => {
        const id = await pedidoCom([{ quantidade: "3", itemDeEstoqueId: item }]);
        await como("compras", () => compras.executarAcao(id, acaoDoPedidoSchema.parse({ acao: "iniciar_analise" }), principal("compras"), AGORA));
        return id;
      };
      const pedidos = await Promise.all(itens.flatMap((item) => [emAnalise(item), emAnalise(item)]));
      const outros = await Promise.all(itens.map((item) => pedidoCom([{ quantidade: "5", itemDeEstoqueId: item }])));
      const resultados = await Promise.allSettled([
        ...pedidos.map((id) => como("compras", () => compras.executarAcao(id, acaoDoPedidoSchema.parse({ acao: "decidir_estoque", origem: "estoque" }), principal("compras"), AGORA))),
        ...itens.map((item, i) => entrada(item, "5", outros[i]!)),
      ]);
      expect(resultados.flatMap((r) => (r.status === "rejected" ? [String((r.reason as Error).message).slice(-200)] : []))).toEqual([]);
      for (const item of itens) {
        const saldo = await root.itemDeEstoque.findUniqueOrThrow({ where: { id: item }, select: { emEstoque: true, reservado: true } });
        expect([saldo.emEstoque.toFixed(3), saldo.reservado.toFixed(3)]).toEqual(["105.000", "6.000"]);
      }
    }, PRAZO_MS);
  });

  it("a análise com o login de Compras: vínculo com item de outra empresa sai só com o motivo (revisão leva 5)", async () => {
    const item = await criarItem({ saldoInicial: "9", custoUnitario: "1.00" });
    const pedido = await pedidoCom([{ quantidade: "2", itemDeEstoqueId: item }, { quantidade: "1" }]);
    const servico = new ComprasService(compras, {} as never, () => AGORA);
    const antes = await como("compras", () => servico.atendimento(pedido, principal("compras")));
    expect(antes.itens.map((i) => [i.motivo, i.disponivel, i.itemDeEstoque?.id ?? null])).toEqual(expect.arrayContaining([[null, "9.000", item], ["sem_vinculo", null, null]]));
    // Vínculo inconsistente, gravado pelo dono fora das regras: o item passa a ser da Waze.
    await root.itemDeEstoque.update({ where: { id: item }, data: { companyId: "waze" } });
    const depoisDaTroca = await como("compras", () => servico.atendimento(pedido, principal("compras")));
    const linha = depoisDaTroca.itens.find((i) => i.quantidadePedida === "2.000")!;
    expect(linha).toMatchObject({ motivo: "outra_empresa", atende: "0.000", disponivel: null, pedidoDoItem: null, itemDeEstoque: null });
    expect(depoisDaTroca.atendeTudo).toBe(false);
    // Quem só tem Estoque não lê a análise de Compras.
    await expect(como("estoque", () => servico.atendimento(pedido, principal("estoque")))).rejects.toThrow();
  }, PRAZO_MS);

  describe("unidade da linha vinculada (fatia 3c: itens 2 e 3)", () => {
    const linhaDe = async (pedido: string) => root.itemDePedido.findMany({ where: { pedidoId: pedido }, select: { id: true, unidade: true, itemDeEstoqueId: true }, orderBy: { quantidade: "asc" } });
    const pedidoComUnidades = (itens: { quantidade: string; unidade?: string | null; itemDeEstoqueId?: string }[]) => como("compras", () => compras.criar(criarPedidoDeCompraSchema.parse({
      empresa: "plugga", titulo: `${marca} pedido`, destino: "interno", prazoEntregaDesejado: "2026-12-10", itens: itens.map((i) => ({ descricao: "material", ...i })),
    }), principal("compras"), AGORA));
    const agir = (pedido: string, acao: unknown) => como("compras", () => compras.executarAcao(pedido, acaoDoPedidoSchema.parse(acao), principal("compras"), AGORA));

    it("a linha vinculada adota a unidade do item; outra unidade é recusada com as duas", async () => {
      const item = await criarItem();
      const pedido = await pedidoComUnidades([{ quantidade: "1", itemDeEstoqueId: item }, { quantidade: "2", unidade: " m ", itemDeEstoqueId: item }, { quantidade: "3", unidade: "cx" }]);
      expect((await linhaDe(pedido)).map((l) => l.unidade)).toEqual(["m", "m", "cx"]);
      await expect(pedidoComUnidades([{ quantidade: "4", unidade: "cx", itemDeEstoqueId: item }])).rejects.toThrow(/está em cx, mas o item .* é controlado em m/);
      // Editar os itens: vincular a linha em "cx" é recusado; a sem unidade adota a do item.
      const editarItens = (itens: { quantidade: string; unidade?: string | null; itemDeEstoqueId?: string }[]) => como("compras", () => compras.editar(pedido,
        editarPedidoDeCompraSchema.parse({ itens: itens.map((i) => ({ descricao: "material", ...i })) }), principal("compras"), AGORA));
      await expect(editarItens([{ quantidade: "3", unidade: "cx", itemDeEstoqueId: item }])).rejects.toBeInstanceOf(RequisicaoInvalida);
      expect((await linhaDe(pedido)).map((l) => l.unidade)).toEqual(["m", "m", "cx"]);
      await editarItens([{ quantidade: "3", unidade: null, itemDeEstoqueId: item }]);
      expect((await linhaDe(pedido)).map((l) => [l.unidade, l.itemDeEstoqueId])).toEqual([["m", item]]);
    }, PRAZO_MS);

    it("a reserva recusa linha antiga em outra unidade, e a análise já diz por quê", async () => {
      const item = await criarItem({ saldoInicial: "10", custoUnitario: "1.00" });
      const pedido = await pedidoComUnidades([{ quantidade: "4", itemDeEstoqueId: item }]);
      // Linha de antes da regra: "4 cx" vinculada ao item em metros.
      await root.itemDePedido.updateMany({ where: { pedidoId: pedido }, data: { unidade: "cx" } });
      await agir(pedido, { acao: "iniciar_analise" });
      const analise = await como("compras", () => compras.atendimento(pedido));
      expect(analise.itens.map((l) => [l.motivo, l.unidadePedida, l.atende])).toEqual([["unidade_diferente", "cx", "0.000"]]);
      await expect(agir(pedido, { acao: "decidir_estoque", origem: "estoque" })).rejects.toThrow(/está em cx e o item .* é controlado em m/);
      expect(await root.reservaDeEstoque.count({ where: { pedidoId: pedido } })).toBe(0);
      expect((await root.itemDeEstoque.findUniqueOrThrow({ where: { id: item }, select: { reservado: true } })).reservado.toFixed(3)).toBe("0.000");
    }, PRAZO_MS);

    it("o vínculo com o id do item em maiúsculas passa pela mesma conferência de unidade (revisão leva 9)", async () => {
      const item = await criarItem();
      const maiusculo = item.toUpperCase();
      await expect(pedidoComUnidades([{ quantidade: "4", unidade: "cx", itemDeEstoqueId: maiusculo }])).rejects.toThrow(/está em cx, mas o item .* é controlado em m/);
      const pedido = await pedidoComUnidades([{ quantidade: "1", itemDeEstoqueId: maiusculo }]);
      expect(await linhaDe(pedido)).toEqual([expect.objectContaining({ unidade: "m", itemDeEstoqueId: item })]);
      await expect(como("compras", () => compras.editar(pedido, editarPedidoDeCompraSchema.parse({ itens: [{ descricao: "material", quantidade: "4", unidade: "cx", itemDeEstoqueId: maiusculo }] }), principal("compras"), AGORA)))
        .rejects.toBeInstanceOf(RequisicaoInvalida);
      expect((await linhaDe(pedido)).map((l) => l.unidade)).toEqual(["m"]);
    }, PRAZO_MS);

    it("pedido com linha do item em outra unidade não aceita entrada manual ligada a ele (revisão leva 9)", async () => {
      const item = await criarItem();
      const pedido = await pedidoComUnidades([{ quantidade: "4", itemDeEstoqueId: item }]);
      await root.itemDePedido.updateMany({ where: { pedidoId: pedido }, data: { unidade: "cx" } });
      expect(await como("estoque", () => estoque.pedidosParaEntrada(item))).toEqual([]);
      await expect(entrada(item, "1", pedido)).rejects.toThrow(/tem linha deste item em cx, e o item é controlado em m: .* sem pedido, com a quantidade convertida para m/);
      expect(await emEstoque(item)).toBe("0.000");
    }, PRAZO_MS);

    it("a entrada do recebimento recusa linha em outra unidade", async () => {
      const item = await criarItem();
      const pedido = await pedidoComUnidades([{ quantidade: "4", itemDeEstoqueId: item }]);
      const fornecedor = await root.fornecedor.create({ data: { nome: `${marca} fornecedor`, categoria: "servico" } });
      try {
        await agir(pedido, { acao: "iniciar_analise" });
        await agir(pedido, { acao: "decidir_estoque", origem: "aquisicao" });
        const cotacao = await como("compras", () => compras.registrarCotacao(pedido, { fornecedorId: fornecedor.id, valor: "40.00" }, { chave: `${marca}/c`, nome: "c.pdf", tamanho: 1, tipo: "application/pdf" }, principal("compras")));
        for (const acao of [{ acao: "selecionar_cotacao", cotacaoId: cotacao }, { acao: "enviar_para_aprovacao" }, { acao: "aprovar" }, { acao: "registrar_pagamento", forma: "pix" }]) await agir(pedido, acao);
        await root.itemDePedido.updateMany({ where: { pedidoId: pedido }, data: { unidade: "cx" } });
        const linha = (await linhaDe(pedido))[0]!;
        await expect(agir(pedido, { acao: "confirmar_recebimento", recebidoEm: "2026-11-23", valorFaturado: "40.00", entradaNoEstoque: [{ itemDoPedidoId: linha.id, quantidade: "4", custoUnitario: "10.00" }] }))
          .rejects.toThrow(/está em cx e o item .* é controlado em m: tire a linha da entrada/);
        expect(await emEstoque(item)).toBe("0.000");
        expect((await root.pedidoDeCompra.findUniqueOrThrow({ where: { id: pedido }, select: { etapa: true } })).etapa).toBe("retirada");
      } finally {
        await root.$transaction(async (t) => {
          await t.$executeRawUnsafe("SET LOCAL session_replication_role = replica");
          await t.pedidoDeCompra.updateMany({ where: { id: pedido }, data: { cotacaoSelecionadaId: null } });
          await t.cotacaoDeCompra.deleteMany({ where: { pedidoId: pedido } });
          await t.fornecedor.delete({ where: { id: fornecedor.id } });
        });
      }
    }, PRAZO_MS);
  });

  it("continua sem ler as linhas do pedido nem a lista de Compras", async () => {
    const item = await criarItem();
    const pedido = await pedidoCom([{ quantidade: "3", itemDeEstoqueId: item }, { quantidade: "8" }]);
    const linhas = await como("estoque", () => app.comContexto((tx) => tx.itemDePedido.findMany({ where: { pedidoId: pedido }, select: { id: true } })));
    expect(linhas).toEqual([]);
    // Quem não tem Estoque nem Compras não lê nada pela função.
    const pessoa = await root.user.create({ data: { name: `${marca} crm`, email: `${marca}-crm@teste.local` } });
    const hash = randomBytes(32).toString("hex");
    await root.session.create({ data: { userId: pessoa.id, tokenHash: hash, expiresAt: new Date(Date.now() + 3_600_000), absoluteExpiresAt: new Date(Date.now() + 7_200_000) } });
    await root.userDepartamento.create({ data: { userId: pessoa.id, departamento: "crm", nivel: "membro", telas: ["crm.clientes"] } });
    const peloCrm = await contextoBanco.run({ sessionHash: hash, agentHash: undefined }, () => app.comContexto((tx) => tx.$queryRaw<unknown[]>`
      SELECT id FROM plugga_security.pedidos_para_entrada_do_item(${item}::uuid, NULL::uuid)`));
    expect(peloCrm).toEqual([]);
  }, PRAZO_MS);
});
