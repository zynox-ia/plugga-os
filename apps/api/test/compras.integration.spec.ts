import { randomUUID } from "node:crypto";

import { acaoDoPedidoSchema, criarPedidoDeCompraSchema, editarPedidoDeCompraSchema } from "@plugga/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditAppender } from "../src/audit/audit-appender.js";
import { PrismaComprasRepository } from "../src/compras/prisma-compras.repository.js";
import { EstadoInvalido, RequisicaoInvalida } from "../src/common/errors/dominio.js";
import type { AuthPrincipal } from "../src/core/auth/auth.types.js";
import { PrismaService } from "../src/prisma/prisma.service.js";

/**
 * Pedido de compra (PLU-327) contra o Postgres de verdade: numeração global,
 * passagens com uma aberta por vez, autoria, eventos, corrida entre ações e
 * os CHECK da migração. O RLS das tabelas é coberto em rls-permissoes.
 *
 *     pnpm --filter @plugga/api test:compras
 */
const HABILITADO = process.env.RUN_COMPRAS_INTEGRATION_TESTS === "true";
const PRAZO_MS = 60_000;
// Segunda, 23/11/2026, 10:00 em Manaus.
const AGORA = new Date("2026-11-23T14:00:00Z");

describe.skipIf(!HABILITADO)("compras: pedido de compra no Postgres", () => {
  const prisma = new PrismaService();
  const repositorio = new PrismaComprasRepository(prisma, new AuditAppender());
  const marca = `comp-${randomUUID().slice(0, 8)}`;
  let principal: AuthPrincipal;
  let fornecedorId: string;
  let obraPlugga: string;

  const criar = (dados: Record<string, unknown> = {}) => repositorio.criar(criarPedidoDeCompraSchema.parse({
    empresa: "plugga", titulo: `${marca} pedido`, destino: "interno",
    itens: [{ descricao: "Cabo", quantidade: "10" }], prazoEntregaDesejado: "2026-12-10", ...dados,
  }), principal, AGORA);
  const acao = (id: string, dados: unknown, quando = AGORA) => repositorio.executarAcao(id, acaoDoPedidoSchema.parse(dados), principal, quando);
  const cotar = (id: string, valor = "100.00", prazoEntregaDias: number | null = null) => repositorio.registrarCotacao(
    id, { fornecedorId, valor, valorFrete: "10.00", prazoEntregaDias }, { chave: `${marca}/${randomUUID()}`, nome: "orcamento.pdf", tamanho: 10, tipo: "application/pdf" }, principal,
  );
  const passagens = (pedidoId: string) => prisma.pedidoDeCompraEtapa.findMany({ where: { pedidoId }, orderBy: { entrouEm: "asc" } });

  beforeAll(async () => {
    await prisma.$connect();
    const admin = await prisma.role.upsert({ where: { key: "admin" }, create: { key: "admin", name: "Admin" }, update: {} });
    for (const id of ["plugga", "waze"]) await prisma.company.upsert({ where: { id }, create: { id, name: id }, update: {} });
    const pessoa = await prisma.user.create({ data: { email: `${marca}@teste.local`, name: `${marca} Pessoa`, platformRoles: { create: { roleId: admin.id } } } });
    principal = { id: pessoa.id, kind: "user", acesso: { plataforma: "admin", departamentos: [] } };
    fornecedorId = (await prisma.fornecedor.create({ data: { nome: `${marca} fornecedor`, categoria: "servico" } })).id;
    obraPlugga = (await prisma.obra.create({ data: { nome: `${marca} obra`, companyId: "plugga" } })).id;
  }, PRAZO_MS);

  afterAll(async () => {
    const pedidos = await prisma.pedidoDeCompra.findMany({ where: { titulo: { startsWith: marca } }, select: { id: true } });
    const ids = pedidos.map((pedido) => pedido.id);
    // Evidência não sai em cascata (ON DELETE RESTRICT): o teardown, como dono
    // do banco, apaga comprovantes e cotações antes dos pedidos.
    await prisma.pedidoDeCompra.updateMany({ where: { id: { in: ids } }, data: { cotacaoSelecionadaId: null } });
    await prisma.comprovanteDePagamento.deleteMany({ where: { pedidoId: { in: ids } } });
    await prisma.cotacaoDeCompra.deleteMany({ where: { pedidoId: { in: ids } } });
    await prisma.pedidoDeCompra.deleteMany({ where: { id: { in: ids } } });
    await prisma.obra.deleteMany({ where: { nome: { startsWith: marca } } });
    await prisma.fornecedor.deleteMany({ where: { nome: { startsWith: marca } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: marca } } });
    await prisma.$disconnect();
  }, PRAZO_MS);

  it("numera em sequência global, sem separar Plugga e Waze, e abre a primeira passagem", async () => {
    const primeiro = await criar();
    const segundo = await criar({ empresa: "waze" });
    const [a, b] = await Promise.all([primeiro, segundo].map((id) => prisma.pedidoDeCompra.findUniqueOrThrow({ where: { id }, select: { numero: true, companyId: true, criadoPorId: true } })));
    expect(b!.numero).toBe(a!.numero + 1);
    expect([a!.companyId, b!.companyId]).toEqual(["plugga", "waze"]);
    expect(a!.criadoPorId).toBe(principal.id);
    expect(await passagens(primeiro)).toEqual([expect.objectContaining({ etapa: "pedido_gerado", prazoDiasUteis: 2, saiuEm: null })]);
    expect(await prisma.eventLog.count({ where: { eventName: "compras.pedido.created", entityId: primeiro } })).toBe(1);
  }, PRAZO_MS);

  it("percorre a aquisição com revisão: passagens, autoria, prazo do fornecedor na retirada e conclusão", async () => {
    const id = await criar();
    await acao(id, { acao: "iniciar_analise" });
    await acao(id, { acao: "decidir_estoque", origem: "aquisicao" });
    const cotacao = await cotar(id, "100.00", 9);
    await acao(id, { acao: "selecionar_cotacao", cotacaoId: cotacao });
    await acao(id, { acao: "enviar_para_aprovacao" });
    await acao(id, { acao: "revisar", motivo: "Preço acima do orçado" });
    const revisado = await prisma.pedidoDeCompra.findUniqueOrThrow({ where: { id } });
    expect(revisado).toMatchObject({ etapa: "cotacoes", cotacaoSelecionadaId: null, valorCotado: null, selecionouCotacaoId: null });

    await acao(id, { acao: "selecionar_cotacao", cotacaoId: cotacao });
    await acao(id, { acao: "enviar_para_aprovacao" });
    await acao(id, { acao: "aprovar" });
    await acao(id, { acao: "registrar_pagamento", forma: "boleto" });
    await acao(id, { acao: "confirmar_recebimento", valorFaturado: "110.00" });

    const final = await prisma.pedidoDeCompra.findUniqueOrThrow({ where: { id } });
    expect(final).toMatchObject({ etapa: "concluido", aprovouId: principal.id, pagamentoRegistradoPorId: principal.id, recebimentoConfirmadoPorId: principal.id, formaPagamento: "boleto" });
    expect(final.valorCotado?.toFixed(2)).toBe("110.00");
    expect(final.valorFaturado?.toFixed(2)).toBe("110.00");
    expect(final.concluidoEm).toEqual(AGORA);

    const lista = await passagens(id);
    expect(lista.map((p) => p.etapa)).toEqual(["pedido_gerado", "analise_estoque", "cotacoes", "aprovacao_compra", "cotacoes", "aprovacao_compra", "pagamento", "retirada"]);
    expect(lista.every((p) => p.saiuEm !== null && p.saiuPorId === principal.id)).toBe(true);
    expect(lista[3]!.observacao).toBe("Preço acima do orçado");
    expect(lista.at(-1)!.prazoDiasUteis).toBe(9);
  }, PRAZO_MS);

  it("atendimento por estoque vai à retirada e conclui sem valor faturado", async () => {
    const id = await criar();
    await acao(id, { acao: "iniciar_analise" });
    await acao(id, { acao: "decidir_estoque", origem: "estoque" });
    await acao(id, { acao: "confirmar_recebimento" });
    expect(await prisma.pedidoDeCompra.findUniqueOrThrow({ where: { id }, select: { etapa: true, valorFaturado: true, estoqueDecididoPorId: true } }))
      .toEqual({ etapa: "concluido", valorFaturado: null, estoqueDecididoPorId: principal.id });
  }, PRAZO_MS);

  it("duas ações simultâneas na mesma etapa: uma passa, a outra é conflito, e só uma passagem fica aberta", async () => {
    const id = await criar();
    const resultados = await Promise.allSettled([acao(id, { acao: "iniciar_analise" }), acao(id, { acao: "iniciar_analise" })]);
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(resultados.find((r) => r.status === "rejected")).toMatchObject({ reason: expect.any(EstadoInvalido) });
    expect((await passagens(id)).filter((p) => p.saiuEm === null)).toHaveLength(1);
  }, PRAZO_MS);

  it("cancelar guarda a etapa e o motivo, fecha a passagem e trava o pedido", async () => {
    const id = await criar();
    await acao(id, { acao: "iniciar_analise" });
    await acao(id, { acao: "cancelar", motivo: "Cliente desistiu" });
    expect(await prisma.pedidoDeCompra.findUniqueOrThrow({ where: { id }, select: { etapa: true, motivoCancelamento: true, canceladoPorId: true } }))
      .toEqual({ etapa: "analise_estoque", motivoCancelamento: "Cliente desistiu", canceladoPorId: principal.id });
    expect((await passagens(id)).every((p) => p.saiuEm !== null)).toBe(true);
    await expect(acao(id, { acao: "decidir_estoque", origem: "estoque" })).rejects.toBeInstanceOf(EstadoInvalido);
    await expect(repositorio.editar(id, editarPedidoDeCompraSchema.parse({ titulo: `${marca} novo` }), principal)).rejects.toBeInstanceOf(EstadoInvalido);
  }, PRAZO_MS);

  it("cotação só na etapa de cotações e com fornecedor ativo", async () => {
    const id = await criar();
    await expect(cotar(id)).rejects.toBeInstanceOf(EstadoInvalido);
    await acao(id, { acao: "iniciar_analise" });
    await acao(id, { acao: "decidir_estoque", origem: "aquisicao" });
    await prisma.fornecedor.update({ where: { id: fornecedorId }, data: { ativo: false } });
    try {
      await expect(cotar(id)).rejects.toBeInstanceOf(RequisicaoInvalida);
    } finally {
      await prisma.fornecedor.update({ where: { id: fornecedorId }, data: { ativo: true } });
    }
  }, PRAZO_MS);

  it("edição: troca a empresa sem mexer no número, itens só até a análise, obra da mesma empresa", async () => {
    const id = await criar({ destino: "obra", obraId: obraPlugga });
    const antes = await prisma.pedidoDeCompra.findUniqueOrThrow({ where: { id }, select: { numero: true } });
    await expect(repositorio.editar(id, editarPedidoDeCompraSchema.parse({ empresa: "waze" }), principal)).rejects.toBeInstanceOf(RequisicaoInvalida);
    await repositorio.editar(id, editarPedidoDeCompraSchema.parse({ empresa: "waze", destino: "interno" }), principal);
    expect(await prisma.pedidoDeCompra.findUniqueOrThrow({ where: { id }, select: { numero: true, companyId: true, obraId: true } }))
      .toEqual({ numero: antes.numero, companyId: "waze", obraId: null });

    await repositorio.editar(id, editarPedidoDeCompraSchema.parse({ itens: [{ descricao: "Disjuntor", quantidade: "2" }, { descricao: "Fita", quantidade: "1.5" }] }), principal);
    expect(await prisma.itemDePedido.count({ where: { pedidoId: id } })).toBe(2);
    await acao(id, { acao: "iniciar_analise" });
    await acao(id, { acao: "decidir_estoque", origem: "aquisicao" });
    await expect(repositorio.editar(id, editarPedidoDeCompraSchema.parse({ itens: [{ descricao: "X", quantidade: "1" }] }), principal)).rejects.toBeInstanceOf(EstadoInvalido);
  }, PRAZO_MS);

  it("trocar o comprovante preserva o anterior, com quem trocou e quando, e o banco não deixa reescrevê-lo", async () => {
    const id = await criar();
    await acao(id, { acao: "iniciar_analise" });
    await acao(id, { acao: "decidir_estoque", origem: "aquisicao" });
    await acao(id, { acao: "selecionar_cotacao", cotacaoId: await cotar(id) });
    await acao(id, { acao: "enviar_para_aprovacao" });
    await acao(id, { acao: "aprovar" });
    const comprovante = (nome: string) => ({ chave: `${marca}/${randomUUID()}`, nome, tamanho: 10, tipo: "application/pdf" });
    await repositorio.registrarComprovante(id, comprovante("primeiro.pdf"), principal, AGORA);
    const depois = new Date(AGORA.getTime() + 60_000);
    await repositorio.registrarComprovante(id, comprovante("segundo.pdf"), principal, depois);

    const lista = await prisma.comprovanteDePagamento.findMany({ where: { pedidoId: id }, orderBy: { enviadoEm: "asc" } });
    expect(lista.map((c) => [c.arquivoNome, c.substituidoEm, c.substituidoPorId])).toEqual([
      ["primeiro.pdf", depois, principal.id],
      ["segundo.pdf", null, null],
    ]);
    expect((await repositorio.comprovante(id)).nome).toBe("segundo.pdf");
    await expect(prisma.comprovanteDePagamento.update({ where: { id: lista[0]!.id }, data: { arquivoNome: "outro.pdf" } })).rejects.toThrow();
    await expect(prisma.comprovanteDePagamento.update({ where: { id: lista[0]!.id }, data: { substituidoEm: null, substituidoPorId: null } })).rejects.toThrow();

    await acao(id, { acao: "registrar_pagamento", forma: "pix" });
    await expect(repositorio.registrarComprovante(id, comprovante("tarde.pdf"), principal, depois)).rejects.toBeInstanceOf(EstadoInvalido);

    // Nem o dono do banco apaga o pedido levando a evidência junto, nem apaga quem enviou o comprovante.
    await expect(prisma.pedidoDeCompra.delete({ where: { id } })).rejects.toThrow();
    await expect(prisma.user.delete({ where: { id: principal.id } })).rejects.toThrow();
    expect(await prisma.comprovanteDePagamento.count({ where: { pedidoId: id } })).toBe(2);
    expect(await prisma.cotacaoDeCompra.count({ where: { pedidoId: id } })).toBe(1);
  }, PRAZO_MS);

  it("o banco recusa cancelamento sem motivo e mais de uma passagem aberta", async () => {
    const id = await criar();
    await expect(prisma.pedidoDeCompra.update({ where: { id }, data: { canceladoEm: AGORA } })).rejects.toThrow();
    await expect(prisma.pedidoDeCompraEtapa.create({ data: { pedidoId: id, etapa: "cotacoes", entrouEm: AGORA, prazoDiasUteis: 5, prazoEm: AGORA } })).rejects.toThrow();
  }, PRAZO_MS);
});
