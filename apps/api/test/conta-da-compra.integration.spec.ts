import { randomBytes, randomUUID } from "node:crypto";

import { acaoDoPedidoSchema, criarPedidoDeCompraSchema } from "@plugga/shared";
import type { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditAppender } from "../src/audit/audit-appender.js";
import type { AuthPrincipal } from "../src/core/auth/auth.types.js";
import { PrismaComprasRepository } from "../src/compras/prisma-compras.repository.js";
import { MovimentosDeEstoque } from "../src/estoque/movimentos-de-estoque.js";
import { papelNoFinanceiro } from "../src/financeiro/financeiro.rules.js";
import { PrismaContaDaCompraRepository } from "../src/financeiro/prisma-conta-da-compra.repository.js";
import { PrismaFinanceiroRepository } from "../src/financeiro/prisma-financeiro.repository.js";
import { contextoBanco } from "../src/prisma/contexto-banco.js";
import { PrismaService } from "../src/prisma/prisma.service.js";

/**
 * W3 (PLU-341), fatia (a), contra o Postgres: a aprovação do pedido de compra cria a
 * conta a pagar no Financeiro, pela função do banco, mesmo para quem só tem Compras;
 * a ficha de Compras vê a conta e a do Financeiro vê o pedido; com o Financeiro
 * desligado, nada muda em Compras.
 *
 *     pnpm --filter @plugga/api test:financeiro
 */
const HABILITADO = process.env.RUN_FINANCEIRO_INTEGRATION_TESTS === "true";
const PRAZO_MS = 60_000;
// Segunda, 23/11/2026, 10:00 em Manaus.
const AGORA = new Date("2026-11-23T14:00:00Z");

describe.skipIf(!HABILITADO)("conta a pagar do pedido de compra aprovado", () => {
  const prisma = new PrismaService();
  const auditoria = new AuditAppender();
  const portao = (ligado: boolean) => new PrismaContaDaCompraRepository({ get: () => ligado } as unknown as ConfigService, auditoria);
  const compras = (ligado: boolean) => new PrismaComprasRepository(prisma, auditoria, new MovimentosDeEstoque(auditoria), portao(ligado));
  const financeiro = new PrismaFinanceiroRepository(prisma, auditoria);
  const papel = papelNoFinanceiro({ plataforma: "admin", departamentos: [] });
  const marca = `w3-${randomUUID().slice(0, 8)}`;
  const sessoes = { admin: randomBytes(32).toString("hex"), comprador: randomBytes(32).toString("hex"), outro: randomBytes(32).toString("hex") };
  const pessoas = {} as Record<keyof typeof sessoes, AuthPrincipal>;
  let fornecedorId: string;
  const como = <T>(quem: keyof typeof sessoes, fazer: () => Promise<T>) => contextoBanco.run({ sessionHash: sessoes[quem], agentHash: undefined }, fazer);
  const comoRuntime = <T>(quem: keyof typeof sessoes, fazer: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => Promise<T>) => prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL ROLE plugga_runtime");
    await tx.$executeRaw`SELECT set_config('plugga.session_hash', ${sessoes[quem]}, true)`;
    return fazer(tx);
  });

  /** Leva um pedido até a aprovação, por quem, com o portão do Financeiro ligado ou não. */
  const aprovado = async (quem: keyof typeof sessoes, ligado: boolean) => {
    const repositorio = compras(ligado);
    const acao = (id: string, dados: unknown) => como(quem, () => repositorio.executarAcao(id, acaoDoPedidoSchema.parse(dados), pessoas[quem], AGORA));
    const id = await como(quem, () => repositorio.criar(criarPedidoDeCompraSchema.parse({
      empresa: "plugga", titulo: `${marca} cabos`, destino: "interno", itens: [{ descricao: "Cabo", quantidade: "10" }], prazoEntregaDesejado: "2026-12-10",
    }), pessoas[quem], AGORA));
    await acao(id, { acao: "iniciar_analise" });
    await acao(id, { acao: "decidir_estoque", origem: "aquisicao" });
    const cotacao = await como(quem, () => repositorio.registrarCotacao(id, { fornecedorId, valor: "100.00", valorFrete: "10.00", prazoEntregaDias: null },
      { chave: `${marca}/${randomUUID()}`, nome: "orcamento.pdf", tamanho: 10, tipo: "application/pdf" }, pessoas[quem]));
    await acao(id, { acao: "selecionar_cotacao", cotacaoId: cotacao });
    await acao(id, { acao: "enviar_para_aprovacao" });
    await acao(id, { acao: "aprovar" });
    return id;
  };

  const cancelar = (id: string, quem: keyof typeof sessoes, ligado: boolean, motivo = "Compra desistida") =>
    como(quem, () => compras(ligado).executarAcao(id, acaoDoPedidoSchema.parse({ acao: "cancelar", motivo }), pessoas[quem], AGORA));
  let contaCorrenteId: string;

  beforeAll(async () => {
    await prisma.$connect();
    for (const id of ["plugga", "waze"]) await prisma.company.upsert({ where: { id }, create: { id, name: id }, update: {} });
    const admin = await prisma.role.upsert({ where: { key: "admin" }, create: { key: "admin", name: "Admin" }, update: {} });
    for (const quem of Object.keys(sessoes) as (keyof typeof sessoes)[]) {
      const pessoa = await prisma.user.create({
        data: { email: `${marca}-${quem}@teste.local`, name: `${marca} ${quem}`, ...(quem === "admin" ? { platformRoles: { create: { roleId: admin.id } } } : {}) },
      });
      // O comprador só tem Compras (não lê o Financeiro); o outro só tem Estoque.
      if (quem === "comprador") await prisma.userDepartamento.create({ data: { userId: pessoa.id, departamento: "suprimentos", nivel: "gerente", telas: ["suprimentos.compras"] } });
      if (quem === "outro") await prisma.userDepartamento.create({ data: { userId: pessoa.id, departamento: "suprimentos", nivel: "membro", telas: ["suprimentos.estoque"] } });
      await prisma.session.create({ data: { userId: pessoa.id, tokenHash: sessoes[quem], expiresAt: new Date(Date.now() + 3_600_000), absoluteExpiresAt: new Date(Date.now() + 7_200_000) } });
      pessoas[quem] = { id: pessoa.id, kind: "user", acesso: { plataforma: quem === "admin" ? "admin" : null, departamentos: [] } } as AuthPrincipal;
    }
    fornecedorId = (await prisma.fornecedor.create({ data: { nome: `${marca} fornecedor`, categoria: "servico" } })).id;
    contaCorrenteId = (await prisma.contaCorrente.create({ data: { companyId: "plugga", nome: `${marca} conta` } })).id;
  }, PRAZO_MS);

  afterAll(async () => {
    const ids = (await prisma.pedidoDeCompra.findMany({ where: { titulo: { startsWith: marca } }, select: { id: true } })).map((p) => p.id);
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL session_replication_role = replica");
      await tx.omieEnvio.deleteMany({ where: { lancamento: { pedidoDeCompraId: { in: ids } } } });
      await tx.anexoDeLancamento.deleteMany({ where: { lancamento: { pedidoDeCompraId: { in: ids } } } });
      await tx.historicoDeLancamento.deleteMany({ where: { lancamento: { pedidoDeCompraId: { in: ids } } } });
      await tx.lancamento.deleteMany({ where: { pedidoDeCompraId: { in: ids } } });
      await tx.pedidoDeCompra.updateMany({ where: { id: { in: ids } }, data: { cotacaoSelecionadaId: null } });
      await tx.cotacaoDeCompra.deleteMany({ where: { pedidoId: { in: ids } } });
      await tx.pedidoDeCompra.deleteMany({ where: { id: { in: ids } } });
    });
    await prisma.fornecedor.deleteMany({ where: { nome: { startsWith: marca } } });
    await prisma.contaCorrente.deleteMany({ where: { nome: { startsWith: marca } } });
    await prisma.session.deleteMany({ where: { tokenHash: { in: Object.values(sessoes) } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: marca } } });
    await prisma.$disconnect();
  }, PRAZO_MS);

  it("a aprovação cria a conta: já aprovada, sem categoria, com o fornecedor e o valor da cotação e o vencimento no prazo do pagamento", async () => {
    const id = await aprovado("admin", true);
    const pedido = await prisma.pedidoDeCompra.findUniqueOrThrow({ where: { id }, select: { numero: true, etapas: { where: { etapa: "pagamento" }, select: { prazoEm: true } } } });
    const conta = await prisma.lancamento.findUniqueOrThrow({ where: { pedidoDeCompraId: id } });
    expect(conta).toMatchObject({
      tipo: "saida", companyId: "plugga", fornecedorId, categoriaId: null, contaCorrenteId: null, etapa: "aprovada", forma: null,
      origem: "pedido_de_compra", criadoPorId: pessoas.admin.id, aprovadoPorId: pessoas.admin.id,
      descricao: `PC-${String(pedido.numero).padStart(4, "0")} · ${marca} cabos`,
    });
    expect(conta.valor.toFixed(2)).toBe("110.00");
    expect(conta.aprovadoEm).not.toBeNull();
    // O início do dia de Manaus (UTC-4) do fim do prazo da etapa de pagamento.
    const prazo = pedido.etapas[0]!.prazoEm;
    const diaEmManaus = new Date(prazo.getTime() - 4 * 3_600_000).toISOString().slice(0, 10);
    expect(conta.vencimento.toISOString()).toBe(`${diaEmManaus}T04:00:00.000Z`);
    // Sem categoria, nada vai ao OMIE ainda.
    expect(await prisma.omieEnvio.count({ where: { lancamentoId: conta.id } })).toBe(0);

    // A ficha de Compras vê a conta; a do Financeiro vê o pedido, com o valor original, e pede a categoria.
    const { contaAPagar } = await como("admin", () => compras(true).detalhe(id));
    expect(contaAPagar).toEqual({ id: conta.id, codigo: `CP-${String(conta.numero).padStart(4, "0")}`, etapa: "aprovada", cancelado: false });
    const ficha = await como("admin", () => financeiro.obter(conta.id, papel, AGORA));
    expect(ficha.origem).toEqual({ tipo: "pedido_de_compra", pedidoDeCompra: { id, numero: pedido.numero, valor: "110.00" } });
    expect(ficha.pendencias[0]).toEqual({ texto: "Classificar a categoria", feito: false });

    // Chamar de novo devolve a mesma conta.
    const [denovo] = await como("admin", () => prisma.comContexto((tx) => tx.$queryRaw<{ id: string }[]>`SELECT id FROM plugga_security.financeiro_conta_da_compra(${id}::uuid)`));
    expect(denovo?.id).toBe(conta.id);
    expect(await prisma.lancamento.count({ where: { pedidoDeCompraId: id } })).toBe(1);
    // Um evento de criação só, com o ator que aprovou, mesmo chamando de novo pela aplicação.
    await como("admin", () => prisma.comContexto((tx) => portao(true).criarNaAprovacao(tx, id, pessoas.admin)));
    const eventos = await prisma.eventLog.findMany({ where: { entityId: conta.id, eventName: "financeiro.lancamento.created" }, select: { actorId: true, payload: true } });
    expect(eventos).toEqual([{ actorId: pessoas.admin.id, payload: { tipo: "saida", origem: "pedido_de_compra" } }]);
  }, PRAZO_MS);

  it("com o Financeiro desligado, a aprovação segue como antes: sem conta, e a ficha de Compras sem o campo", async () => {
    const id = await aprovado("admin", false);
    expect(await prisma.lancamento.count({ where: { pedidoDeCompraId: id } })).toBe(0);
    expect((await prisma.pedidoDeCompra.findUniqueOrThrow({ where: { id } })).etapa).toBe("pagamento");
    expect((await como("admin", () => compras(false).detalhe(id))).contaAPagar).toBeNull();
  }, PRAZO_MS);

  it("pelo pool da aplicação: quem só tem Compras cria e vê a conta pela função, sem ler lançamentos; quem não tem Compras nem Financeiro não vê", async () => {
    // Aprovado pelo comprador com o portão desligado, para a conta nascer aqui, como plugga_runtime.
    const id = await aprovado("comprador", false);
    const [criada] = await comoRuntime("comprador", (tx) => tx.$queryRaw<{ id: string }[]>`SELECT id FROM plugga_security.financeiro_conta_da_compra(${id}::uuid)`);
    expect(criada?.id).toEqual(expect.any(String));
    expect(await comoRuntime("comprador", (tx) => tx.lancamento.count({ where: { id: criada!.id } }))).toBe(0);
    expect(await comoRuntime("comprador", (tx) => tx.$queryRaw<{ id: string }[]>`SELECT id FROM plugga_security.contas_a_pagar_dos_pedidos(${[id]}::uuid[])`))
      .toEqual([{ id: criada!.id }]);
    expect(await comoRuntime("outro", (tx) => tx.$queryRaw`SELECT id FROM plugga_security.contas_a_pagar_dos_pedidos(${[id]}::uuid[])`)).toEqual([]);
    expect(await comoRuntime("outro", (tx) => tx.$queryRaw`SELECT id FROM plugga_security.pedidos_das_contas(${[id]}::uuid[])`)).toEqual([]);
  }, PRAZO_MS);

  it("cancelar o pedido aprovado cancela a conta junto, com o motivo e o evento; o Financeiro não cancela a conta de um pedido", async () => {
    const id = await aprovado("admin", true);
    const conta = await prisma.lancamento.findUniqueOrThrow({ where: { pedidoDeCompraId: id }, select: { id: true } });
    await expect(como("admin", () => financeiro.executarAcao(conta.id, { acao: "cancelar", motivo: "x" }, pessoas.admin, papel, AGORA)))
      .rejects.toMatchObject({ codigo: "CONFLITO_ESTADO", message: expect.stringMatching(/^Esta conta é do pedido PC-\d{4}: cancele o pedido em Compras/) });

    await cancelar(id, "admin", true);
    const cancelada = await prisma.lancamento.findUniqueOrThrow({ where: { id: conta.id } });
    expect(cancelada).toMatchObject({ canceladoPorId: pessoas.admin.id, cancelamentoMotivo: "Compra desistida" });
    expect(cancelada.canceladoEm).not.toBeNull();
    expect(await prisma.eventLog.findMany({ where: { entityId: conta.id, eventName: "financeiro.lancamento.cancelado" }, select: { payload: true } }))
      .toEqual([{ payload: { etapa: "aprovada", comMotivo: true, origem: "pedido_de_compra" } }]);
    expect((await como("admin", () => compras(true).detalhe(id))).contaAPagar).toMatchObject({ cancelado: true });
  }, PRAZO_MS);

  it("a conta já paga fica como está quando o pedido é cancelado; com o Financeiro desligado, o cancelamento não toca a conta", async () => {
    const pago = await aprovado("admin", true);
    const conta = await prisma.lancamento.findUniqueOrThrow({ where: { pedidoDeCompraId: pago }, select: { id: true } });
    await como("admin", () => financeiro.registrarAnexo(conta.id, "comprovante", { chave: `${marca}/${randomUUID()}.pdf`, nome: "c.pdf", tamanho: 1, tipo: "application/pdf" }, pessoas.admin, papel, AGORA));
    await como("admin", () => financeiro.executarAcao(conta.id, { acao: "registrar_pagamento", forma: "pix", contaCorrenteId, pagoEm: "2026-11-23" }, pessoas.admin, papel, AGORA));
    await cancelar(pago, "admin", true);
    expect(await prisma.lancamento.findUniqueOrThrow({ where: { id: conta.id }, select: { etapa: true, canceladoEm: true } })).toEqual({ etapa: "paga", canceladoEm: null });

    const desligado = await aprovado("admin", true);
    await cancelar(desligado, "admin", false);
    expect((await prisma.lancamento.findUniqueOrThrow({ where: { pedidoDeCompraId: desligado }, select: { canceladoEm: true } })).canceladoEm).toBeNull();
  }, PRAZO_MS);

  it("pelo pool da aplicação: quem só tem Compras cancela a conta pela função; outra pessoa, ou pedido não cancelado, é recusado", async () => {
    const id = await aprovado("comprador", false);
    await comoRuntime("comprador", (tx) => tx.$queryRaw`SELECT id FROM plugga_security.financeiro_conta_da_compra(${id}::uuid)`);
    // Pedido ainda não cancelado: recusa.
    await expect(comoRuntime("comprador", (tx) => tx.$queryRaw`SELECT id FROM plugga_security.financeiro_cancelar_conta_da_compra(${id}::uuid, 'x')`))
      .rejects.toThrow(/CANCELAMENTO_DA_COMPRA_SO_COM_O_PEDIDO/);
    await cancelar(id, "comprador", false);
    await expect(comoRuntime("outro", (tx) => tx.$queryRaw`SELECT id FROM plugga_security.financeiro_cancelar_conta_da_compra(${id}::uuid, 'x')`))
      .rejects.toThrow(/CANCELAMENTO_DA_COMPRA_SO_COM_O_PEDIDO/);
    const canceladas = await comoRuntime("comprador", (tx) => tx.$queryRaw<{ etapa: string }[]>`SELECT etapa FROM plugga_security.financeiro_cancelar_conta_da_compra(${id}::uuid, 'Compra desistida')`);
    expect(canceladas).toEqual([{ etapa: "aprovada" }]);
    // De novo, nada: já está cancelada.
    expect(await comoRuntime("comprador", (tx) => tx.$queryRaw`SELECT etapa FROM plugga_security.financeiro_cancelar_conta_da_compra(${id}::uuid, 'x')`)).toEqual([]);
    // O reflexo do OMIE pela função do conector também vale para quem só tem Compras.
    const conta = await prisma.lancamento.findUniqueOrThrow({ where: { pedidoDeCompraId: id }, select: { id: true } });
    await comoRuntime("comprador", (tx) => tx.$executeRaw`SELECT plugga_security.omie_reflexo_do_cancelamento(${conta.id}::uuid)`);
    // Quem não tem Compras nem o Financeiro não chama o reflexo.
    await expect(comoRuntime("outro", (tx) => tx.$executeRaw`SELECT plugga_security.omie_reflexo_do_cancelamento(${conta.id}::uuid)`)).rejects.toThrow(/REFLEXO_DO_CANCELAMENTO_SEM_ACESSO/);
  }, PRAZO_MS);

  it("a função só cria a conta do pedido recém-aprovado, e só para quem aprovou", async () => {
    const id = await aprovado("comprador", false);
    // Outra pessoa não cria a conta do pedido que não aprovou.
    await expect(comoRuntime("outro", (tx) => tx.$queryRaw`SELECT plugga_security.financeiro_conta_da_compra(${id}::uuid)`)).rejects.toThrow(/CONTA_DA_COMPRA_SO_NA_APROVACAO/);
    // Nem de pedido que não está aprovado.
    const emAndamento = await como("admin", () => compras(true).criar(criarPedidoDeCompraSchema.parse({
      empresa: "plugga", titulo: `${marca} ainda não`, destino: "interno", itens: [{ descricao: "Cabo", quantidade: "1" }], prazoEntregaDesejado: "2026-12-10",
    }), pessoas.admin, AGORA));
    await expect(comoRuntime("admin", (tx) => tx.$queryRaw`SELECT plugga_security.financeiro_conta_da_compra(${emAndamento}::uuid)`)).rejects.toThrow(/CONTA_DA_COMPRA_SO_NA_APROVACAO/);
    // Sem sessão, nada.
    await expect(prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL ROLE plugga_runtime");
      return tx.$queryRaw`SELECT plugga_security.financeiro_conta_da_compra(${id}::uuid)`;
    })).rejects.toThrow(/CONTA_DA_COMPRA_SEM_SESSAO/);
    expect(await prisma.lancamento.count({ where: { pedidoDeCompraId: { in: [id, emAndamento] } } })).toBe(0);
    // Pela aplicação, a recusa do cancelamento também vira 409 com mensagem clara.
    await expect(como("comprador", () => prisma.comContexto((tx) => portao(true).cancelarComOPedido(tx, id, "x", pessoas.comprador))))
      .rejects.toMatchObject({ codigo: "CONFLITO_ESTADO", message: "Não foi possível cancelar a conta a pagar deste pedido; avise o Financeiro." });
    // Pela aplicação, a recusa vira um 409 com mensagem clara, e não um erro cru.
    await expect(como("admin", () => prisma.comContexto((tx) => portao(true).criarNaAprovacao(tx, emAndamento, pessoas.admin))))
      .rejects.toMatchObject({ codigo: "CONFLITO_ESTADO", message: "Não foi possível gerar a conta a pagar deste pedido; avise o Financeiro." });
  }, PRAZO_MS);
});
