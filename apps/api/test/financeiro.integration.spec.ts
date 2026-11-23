import { randomUUID } from "node:crypto";

import { acaoDoLancamentoSchema, criarContaAPagarSchema, listarLancamentosQuerySchema, quadroFinanceiroQuerySchema } from "@plugga/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditAppender } from "../src/audit/audit-appender.js";
import { AcessoNegado, EstadoInvalido, NaoEncontrado, RequisicaoInvalida } from "../src/common/errors/dominio.js";
import type { AuthPrincipal } from "../src/core/auth/auth.types.js";
import { papelNoFinanceiro } from "../src/financeiro/financeiro.rules.js";
import { PrismaFinanceiroRepository } from "../src/financeiro/prisma-financeiro.repository.js";
import { PrismaService } from "../src/prisma/prisma.service.js";

/**
 * Financeiro (PLU-336) contra o Postgres de verdade: numeração por tipo, guardas
 * do banco (categoria e conta da mesma empresa, campos imutáveis, uma cobrança
 * por competência), aprovação concorrente, cancelamento, filtros, metric cards e
 * quadro. O RLS por tipo fica em rls-permissoes.
 *
 *     pnpm --filter @plugga/api test:financeiro
 */
const HABILITADO = process.env.RUN_FINANCEIRO_INTEGRATION_TESTS === "true";
const PRAZO_MS = 60_000;
// 23/11/2026, 10h em Manaus.
const AGORA = new Date("2026-11-23T14:00:00Z");

describe.skipIf(!HABILITADO)("financeiro: lançamentos no Postgres", () => {
  const prisma = new PrismaService();
  const repositorio = new PrismaFinanceiroRepository(prisma, new AuditAppender());
  const marca = `fin-${randomUUID().slice(0, 8)}`;
  let principal: AuthPrincipal;
  const papel = papelNoFinanceiro({ plataforma: "admin", departamentos: [] });
  const ids = { fornecedor: "", cliente: "", despesaPlugga: "", despesaWaze: "", receitaPlugga: "", contaPlugga: "", contaWaze: "" };

  const novaConta = (dados: Record<string, unknown> = {}) => repositorio.criarContaAPagar(criarContaAPagarSchema.parse({
    empresa: "plugga", fornecedorId: ids.fornecedor, categoriaId: ids.despesaPlugga, contaCorrenteId: ids.contaPlugga,
    descricao: `${marca} conta`, valor: "100.00", vencimento: "2026-11-30", forma: "boleto", ...dados,
  }), principal);
  const agir = (id: string, acao: unknown) => repositorio.executarAcao(id, acaoDoLancamentoSchema.parse(acao), principal, papel, AGORA);
  const novaCobranca = async (competencia: string) => (await prisma.lancamento.create({
    data: { tipo: "entrada", companyId: "plugga", clientId: ids.cliente, categoriaId: ids.receitaPlugga, descricao: `${marca} cobrança ${competencia}`, valor: 50, vencimento: AGORA, competencia, etapa: "gerada", origem: "cobranca_manual" },
    select: { id: true },
  })).id;
  const listar = (q: Record<string, unknown> = {}) => repositorio.listar(listarLancamentosQuerySchema.parse({ busca: marca, ...q }), papel, AGORA);

  beforeAll(async () => {
    await prisma.$connect();
    const admin = await prisma.role.upsert({ where: { key: "admin" }, create: { key: "admin", name: "Admin" }, update: {} });
    for (const id of ["plugga", "waze"]) await prisma.company.upsert({ where: { id }, create: { id, name: id }, update: {} });
    const pessoa = await prisma.user.create({ data: { email: `${marca}@teste.local`, name: `${marca} Pessoa`, platformRoles: { create: { roleId: admin.id } } } });
    principal = { id: pessoa.id, kind: "user", acesso: { plataforma: "admin", departamentos: [] } };
    ids.fornecedor = (await prisma.fornecedor.create({ data: { nome: `${marca} Fornecedor`, categoria: "servico" } })).id;
    ids.cliente = (await prisma.client.create({ data: { name: `${marca} Cliente` } })).id;
    const categoria = (companyId: string, codigo: string, tipo: "receita" | "despesa") => prisma.categoriaFinanceira.create({
      data: { companyId, codigo, nome: `${marca} ${codigo}`, tipo, natureza: tipo === "receita" ? "receita" : "servico", grupoNome: "Teste" },
    });
    // Códigos com a marca no último nível, para não colidir com o seed.
    const sufixo = String(parseInt(marca.slice(4), 16) % 100_000);
    ids.despesaPlugga = (await categoria("plugga", `9.01.${sufixo}`, "despesa")).id;
    ids.despesaWaze = (await categoria("waze", `9.01.${sufixo}`, "despesa")).id;
    ids.receitaPlugga = (await categoria("plugga", `9.02.${sufixo}`, "receita")).id;
    ids.contaPlugga = (await prisma.contaCorrente.create({ data: { companyId: "plugga", omieCodigo: `${marca}-p`, nome: `${marca} conta P` } })).id;
    ids.contaWaze = (await prisma.contaCorrente.create({ data: { companyId: "waze", omieCodigo: `${marca}-w`, nome: `${marca} conta W` } })).id;
  }, PRAZO_MS);

  afterAll(async () => {
    // Lançamento não se apaga pela aplicação; o teardown, como dono do banco de teste, apaga o que criou.
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL session_replication_role = replica");
      await tx.lancamento.deleteMany({ where: { descricao: { startsWith: marca } } });
      await tx.categoriaFinanceira.deleteMany({ where: { nome: { startsWith: marca } } });
      await tx.contaCorrente.deleteMany({ where: { nome: { startsWith: marca } } });
      await tx.fornecedor.deleteMany({ where: { nome: { startsWith: marca } } });
      await tx.client.deleteMany({ where: { name: { startsWith: marca } } });
    });
    await prisma.user.deleteMany({ where: { email: { startsWith: marca } } });
    await prisma.$disconnect();
  }, PRAZO_MS);

  it("conta avulsa nasce aberta, com número da sequência da saída e evento sem texto livre", async () => {
    const a = await repositorio.obter(await novaConta(), papel, AGORA);
    const b = await repositorio.obter(await novaConta(), papel, AGORA);
    expect(a).toMatchObject({ tipo: "saida", etapa: "aberta", origem: { tipo: "avulsa", pedidoDeCompra: null }, valor: "100.00", vencimento: "2026-11-30" });
    expect(Number(b.codigo.slice(3))).toBe(Number(a.codigo.slice(3)) + 1);
    expect(a.codigo).toMatch(/^CP-\d{4,}$/);
    expect(a.acoesPermitidas).toEqual(["aprovar", "cancelar"]);
    const evento = await prisma.eventLog.findFirstOrThrow({ where: { entityId: a.id, eventName: "financeiro.lancamento.created" } });
    expect(evento.payload).toEqual({ tipo: "saida", origem: "avulsa" });
  }, PRAZO_MS);

  it("categoria e conta têm de ser da empresa e do tipo certos", async () => {
    await expect(novaConta({ categoriaId: ids.despesaWaze })).rejects.toBeInstanceOf(RequisicaoInvalida);
    await expect(novaConta({ contaCorrenteId: ids.contaWaze })).rejects.toBeInstanceOf(RequisicaoInvalida);
    await expect(novaConta({ categoriaId: ids.receitaPlugga })).rejects.toBeInstanceOf(RequisicaoInvalida);
  }, PRAZO_MS);

  it("o banco recusa categoria de outra empresa mesmo sem passar pela aplicação", async () => {
    await expect(prisma.lancamento.create({
      data: { tipo: "saida", companyId: "plugga", fornecedorId: ids.fornecedor, categoriaId: ids.despesaWaze, descricao: `${marca} x`, valor: 1, vencimento: AGORA, etapa: "aberta", origem: "avulsa" },
    })).rejects.toThrow();
  }, PRAZO_MS);

  it("tipo, número, empresa e origem não mudam", async () => {
    const id = await novaConta();
    await expect(prisma.lancamento.update({ where: { id }, data: { numero: 999_999 } })).rejects.toThrow();
    await expect(prisma.lancamento.update({ where: { id }, data: { companyId: "waze", categoriaId: ids.despesaWaze, contaCorrenteId: ids.contaWaze } })).rejects.toThrow();
  }, PRAZO_MS);

  it("duas aprovações simultâneas: uma passa, a outra é conflito, e há um evento só", async () => {
    const id = await novaConta();
    const resultados = await Promise.allSettled([agir(id, { acao: "aprovar" }), agir(id, { acao: "aprovar" })]);
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(resultados.find((r) => r.status === "rejected")).toMatchObject({ reason: expect.any(EstadoInvalido) });
    const detalhe = await repositorio.obter(id, papel, AGORA);
    expect(detalhe.etapa).toBe("aprovada");
    expect(detalhe.marcos.aprovado?.por?.id).toBe(principal.id);
    expect(await prisma.eventLog.count({ where: { entityId: id, eventName: "financeiro.lancamento.aprovado" } })).toBe(1);
  }, PRAZO_MS);

  it("cancelar guarda o motivo e a etapa em que parou; o evento não leva o motivo", async () => {
    const id = await novaConta();
    await agir(id, { acao: "aprovar" });
    await agir(id, { acao: "cancelar", motivo: "Fatura duplicada" });
    const detalhe = await repositorio.obter(id, papel, AGORA);
    expect(detalhe).toMatchObject({ cancelado: true, etapa: "aprovada", prazo: null, acoesPermitidas: [], podeEditar: false });
    expect(detalhe.marcos.cancelado?.motivo).toBe("Fatura duplicada");
    const evento = await prisma.eventLog.findFirstOrThrow({ where: { entityId: id, eventName: "financeiro.lancamento.cancelado" } });
    expect(JSON.stringify(evento.payload)).not.toContain("duplicada");
    await expect(agir(id, { acao: "cancelar", motivo: "de novo" })).rejects.toBeInstanceOf(EstadoInvalido);
    await expect(repositorio.editar(id, { descricao: `${marca} nova` }, principal, papel)).rejects.toBeInstanceOf(EstadoInvalido);
  }, PRAZO_MS);

  it("membro não aprova nem troca o fornecedor da conta aprovada (403, não 409)", async () => {
    const membro = papelNoFinanceiro({ plataforma: null, departamentos: [{ departamento: "financeiro", nivel: "membro", telas: ["financeiro.pagar"] }] });
    const id = await novaConta();
    await expect(repositorio.executarAcao(id, acaoDoLancamentoSchema.parse({ acao: "aprovar" }), principal, membro, AGORA)).rejects.toBeInstanceOf(AcessoNegado);
    await agir(id, { acao: "aprovar" });
    const outro = (await prisma.fornecedor.create({ data: { nome: `${marca} Outro`, categoria: "servico" } })).id;
    await expect(repositorio.editar(id, { fornecedorId: outro }, principal, membro)).rejects.toBeInstanceOf(AcessoNegado);
    await expect(repositorio.editar(id, { vencimento: "2026-12-20" }, principal, membro)).rejects.toBeInstanceOf(AcessoNegado);
    await repositorio.editar(id, { descricao: `${marca} só o texto` }, principal, membro);
    const detalhe = await repositorio.obter(id, papel, AGORA);
    expect([detalhe.favorecido.id, detalhe.vencimento, detalhe.etapa]).toEqual([ids.fornecedor, "2026-11-30", "aprovada"]);
    await repositorio.editar(id, { fornecedorId: outro }, principal, papel);
    expect((await repositorio.obter(id, papel, AGORA)).favorecido.id).toBe(outro);
  }, PRAZO_MS);

  it("as ações da PLU-337 ainda são recusadas com conflito", async () => {
    const id = await novaConta();
    await expect(agir(id, { acao: "corrigir_valor", valor: "10.00", motivo: "x" })).rejects.toBeInstanceOf(EstadoInvalido);
  }, PRAZO_MS);

  it("editar grava só os campos enviados; sem campo, nada muda", async () => {
    const id = await novaConta();
    await repositorio.editar(id, {}, principal, papel);
    expect(await prisma.eventLog.count({ where: { entityId: id, eventName: "financeiro.lancamento.updated" } })).toBe(0);
    await repositorio.editar(id, { vencimento: "2026-12-05", descricao: `${marca} editada` }, principal, papel);
    const detalhe = await repositorio.obter(id, papel, AGORA);
    expect([detalhe.vencimento, detalhe.descricao]).toEqual(["2026-12-05", `${marca} editada`]);
    const evento = await prisma.eventLog.findFirstOrThrow({ where: { entityId: id, eventName: "financeiro.lancamento.updated" } });
    expect(evento.payload).toEqual({ campos: ["descricao", "vencimento"] });
  }, PRAZO_MS);

  it("uma cobrança por cliente, empresa e competência, fora as canceladas", async () => {
    const cobranca = (competencia: string) => prisma.lancamento.create({
      data: { tipo: "entrada", companyId: "plugga", clientId: ids.cliente, categoriaId: ids.receitaPlugga, descricao: `${marca} cobrança`, valor: 50, vencimento: AGORA, competencia, etapa: "gerada", origem: "cobranca_manual" },
    });
    const primeira = await cobranca("2026-10");
    await expect(cobranca("2026-10")).rejects.toThrow();
    await prisma.lancamento.update({ where: { id: primeira.id }, data: { canceladoEm: AGORA, cancelamentoMotivo: "teste" } });
    await expect(cobranca("2026-10")).resolves.toMatchObject({ tipo: "entrada" });
    expect((await cobranca("2026-11")).numero).toBeGreaterThan(0);
  }, PRAZO_MS);

  it("filtros, busca pelo código, metric cards e o dia liquidado", async () => {
    const vencida = await novaConta({ vencimento: "2026-11-20", valor: "40.00" });
    const hoje = await novaConta({ vencimento: "2026-11-23", valor: "60.00" });
    const paga = await novaConta({ vencimento: "2026-11-21", valor: "70.00" });
    await prisma.lancamento.update({
      where: { id: paga },
      data: { etapa: "paga", aprovadoEm: AGORA, pagoEm: new Date("2026-11-22T04:00:00Z"), pagamentoRegistradoEm: AGORA },
    });

    const vencidos = await listar({ situacao: "vencidos" });
    expect(vencidos.itens.map((i) => i.id)).toContain(vencida);
    expect(vencidos.itens.map((i) => i.id)).not.toContain(paga);
    expect((await listar({ vencimento: "hoje", tipo: "saida" })).itens.map((i) => i.id)).toEqual([hoje]);

    const lista = await listar();
    const pagaNaLista = lista.itens.find((i) => i.id === paga)!;
    expect(pagaNaLista).toMatchObject({ liquidadoEm: "2026-11-22", prazo: null, coluna: "liquidado" });
    // Em aberto primeiro, por vencimento; depois os liquidados.
    expect(lista.itens.findIndex((i) => i.id === vencida)).toBeLessThan(lista.itens.findIndex((i) => i.id === paga));
    expect(lista.itens.some((i) => i.cancelado)).toBe(false);

    const codigo = lista.itens.find((i) => i.id === hoje)!.codigo;
    const peloCodigo = await repositorio.listar(listarLancamentosQuerySchema.parse({ busca: codigo }), papel, AGORA);
    expect(peloCodigo.itens.map((i) => i.id)).toEqual([hoje]);

    expect(lista.resumo.ate).toBe("2026-11-30");
    expect(Number(lista.resumo.vencidos.aPagar)).toBeGreaterThanOrEqual(40);
    expect(lista.alcance).toEqual({ saidas: true, entradas: true });
  }, PRAZO_MS);

  it("quem só tem Contas a pagar não vê entradas nem o a receber", async () => {
    const soPagar = papelNoFinanceiro({ plataforma: null, departamentos: [{ departamento: "financeiro", nivel: "membro", telas: ["financeiro.pagar"] }] });
    const resposta = await repositorio.listar(listarLancamentosQuerySchema.parse({ busca: marca }), soPagar, AGORA);
    expect(resposta.itens.every((i) => i.tipo === "saida")).toBe(true);
    expect(resposta.resumo).toMatchObject({ aReceber: null, saldoProjetado: null, vencidos: { aReceber: null } });
    expect(resposta.alcance).toEqual({ saidas: true, entradas: false });
    const entrada = await novaCobranca("2027-01");
    await expect(repositorio.obter(entrada, soPagar, AGORA)).rejects.toBeInstanceOf(NaoEncontrado);
    // Com Conciliação o RLS deixa alterar a entrada; quem barra é a aplicação, que opera só o tipo da tela.
    const pagarEConciliar = papelNoFinanceiro({ plataforma: null, departamentos: [{ departamento: "financeiro", nivel: "membro", telas: ["financeiro.pagar", "financeiro.conciliacao"] }] });
    await expect(repositorio.executarAcao(entrada, acaoDoLancamentoSchema.parse({ acao: "cancelar", motivo: "x" }), principal, pagarEConciliar, AGORA)).rejects.toBeInstanceOf(NaoEncontrado);
    await expect(repositorio.editar(entrada, { descricao: `${marca} y` }, principal, pagarEConciliar)).rejects.toBeInstanceOf(NaoEncontrado);
  }, PRAZO_MS);

  it("o quadro tem as quatro colunas, totais por tipo e deixa os cancelados de fora", async () => {
    await novaConta();
    await novaCobranca("2027-02");
    const quadro = await repositorio.quadro(quadroFinanceiroQuerySchema.parse({ busca: marca }), papel, AGORA);
    expect(quadro.colunas.map((c) => c.id)).toEqual(["preparo", "aberto", "liquidado", "conciliado"]);
    const todos = quadro.colunas.flatMap((c) => c.itens);
    expect(todos.some((i) => i.cancelado)).toBe(false);
    for (const coluna of quadro.colunas) expect(coluna.itens.every((i) => i.coluna === coluna.id)).toBe(true);
    const preparo = quadro.colunas[0]!;
    expect(Number(preparo.totalSaidas)).toBeGreaterThan(0);
    expect(Number(preparo.totalEntradas)).toBeGreaterThan(0);
  }, PRAZO_MS);
});
