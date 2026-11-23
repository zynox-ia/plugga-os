import { randomInt, randomUUID } from "node:crypto";

import { criarFornecedorSchema, editarFornecedorSchema } from "@plugga/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditAppender } from "../src/audit/audit-appender.js";
import { Conflito, NaoEncontrado } from "../src/common/errors/dominio.js";
import type { AuthPrincipal } from "../src/core/auth/auth.types.js";
import { PrismaFornecedoresRepository } from "../src/fornecedores/prisma-fornecedores.repository.js";
import { PrismaService } from "../src/prisma/prisma.service.js";

/**
 * Cadastro de fornecedores (PLU-326) contra o Postgres de verdade: documento
 * único no cadastro todo, busca por dígitos, contagem por situação, autoria e
 * auditoria sem dado pessoal. O RLS da tabela é coberto em rls-permissoes.
 *
 *     pnpm --filter @plugga/api test:fornecedores
 *
 * Os documentos são da faixa sintética do projeto (CNPJ 99999…), gerados a
 * cada execução com dígito verificador válido.
 */
const HABILITADO = process.env.RUN_FORNECEDORES_INTEGRATION_TESTS === "true";
const PRAZO_MS = 60_000;

function digitoVerificador(base: number[], pesos: number[]): number {
  const resto = base.reduce((soma, d, i) => soma + d * pesos[i]!, 0) % 11;
  return resto < 2 ? 0 : 11 - resto;
}

function gerarCnpj(): string {
  const base = [9, 9, 9, 9, 9, ...Array.from({ length: 7 }, () => randomInt(10))];
  const d1 = digitoVerificador(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digitoVerificador([...base, d1], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return [...base, d1, d2].join("");
}

const formatarCnpj = (d: string) => `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;

describe.skipIf(!HABILITADO)("fornecedores: cadastro único no Postgres", () => {
  const prisma = new PrismaService();
  const repositorio = new PrismaFornecedoresRepository(prisma, new AuditAppender());
  const marca = `forn-${randomUUID().slice(0, 8)}`;
  let principal: AuthPrincipal;

  // Mesma validação e normalização que o controller aplica antes do repositório.
  const criar = (dados: unknown) => repositorio.criar(criarFornecedorSchema.parse(dados), principal);
  const editar = (id: string, dados: unknown) => repositorio.editar(id, editarFornecedorSchema.parse(dados), principal);

  beforeAll(async () => {
    await prisma.$connect();
    const admin = await prisma.role.upsert({ where: { key: "admin" }, create: { key: "admin", name: "Admin" }, update: {} });
    const pessoa = await prisma.user.create({
      data: { email: `${marca}@teste.local`, name: `${marca} Pessoa`, platformRoles: { create: { roleId: admin.id } } },
    });
    principal = { id: pessoa.id, kind: "user", acesso: { plataforma: "admin", departamentos: [] } };
  }, PRAZO_MS);

  afterAll(async () => {
    // O event_log é só de inserção: o rastro fica, apontando para ids únicos.
    // Cotação não sai em cascata (RESTRICT): a escolha, as cotações e os pedidos saem antes.
    const pedidos = (await prisma.pedidoDeCompra.findMany({ where: { titulo: { startsWith: marca } }, select: { id: true } })).map((p) => p.id);
    await prisma.pedidoDeCompra.updateMany({ where: { id: { in: pedidos } }, data: { cotacaoSelecionadaId: null } });
    await prisma.cotacaoDeCompra.deleteMany({ where: { pedidoId: { in: pedidos } } });
    await prisma.pedidoDeCompra.deleteMany({ where: { id: { in: pedidos } } });
    await prisma.fornecedor.deleteMany({ where: { nome: { startsWith: marca } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: marca } } });
    await prisma.$disconnect();
  }, PRAZO_MS);

  it("cadastra com autoria e audita só os nomes dos campos", async () => {
    const cnpj = gerarCnpj();
    const criado = await criar({ nome: `${marca} Solar`, categoria: "kit_solar", documento: formatarCnpj(cnpj), email: `${marca}@fornecedor.local`, formasDePagamento: ["pix"] });

    expect(criado).toMatchObject({ documento: cnpj, categoria: "kit_solar", ativo: true, cotacoes: 0, criadoPor: { id: principal.id }, atualizadoPor: { id: principal.id } });
    const eventos = await prisma.eventLog.findMany({ where: { eventName: "suprimentos.fornecedor.created", entityId: criado.id } });
    expect(eventos).toHaveLength(1);
    expect(eventos[0]?.payload).toEqual({ campos: ["categoria", "documento", "email", "formasDePagamento", "nome"] });
    expect(JSON.stringify(eventos[0]?.payload)).not.toContain(cnpj);
  }, PRAZO_MS);

  it("o documento é único no cadastro todo, também na edição e contra inativos", async () => {
    const cnpj = gerarCnpj();
    const primeiro = await criar({ nome: `${marca} Primeiro`, categoria: "servico", documento: cnpj });
    await repositorio.mudarSituacao(primeiro.id, false, principal);

    await expect(criar({ nome: `${marca} Segundo`, categoria: "servico", documento: cnpj })).rejects.toBeInstanceOf(Conflito);
    const segundo = await criar({ nome: `${marca} Segundo`, categoria: "servico" });
    await expect(editar(segundo.id, { documento: cnpj })).rejects.toBeInstanceOf(Conflito);
    // Editar mantendo o próprio documento não é conflito.
    await expect(editar(primeiro.id, { documento: cnpj, observacoes: "ok" })).resolves.toMatchObject({ observacoes: "ok" });
  }, PRAZO_MS);

  it("busca por nome ou por dígitos do documento e conta por situação sem aplicar a situação", async () => {
    const cnpj = gerarCnpj();
    const ativo = await criar({ nome: `${marca} Busca Ativo`, categoria: "material_eletrico", documento: cnpj });
    const inativo = await criar({ nome: `${marca} Busca Inativo`, categoria: "material_eletrico" });
    await repositorio.mudarSituacao(inativo.id, false, principal);

    const ativos = await repositorio.listar({ busca: `${marca} Busca`, situacao: "ativos" });
    expect(ativos.itens.map((f) => f.id)).toEqual([ativo.id]);
    expect(ativos.contagem).toEqual({ ativos: 1, inativos: 1 });

    const todos = await repositorio.listar({ busca: `${marca} Busca`, situacao: "todos" });
    expect(todos.itens.map((f) => f.id)).toEqual([ativo.id, inativo.id]);

    const porDocumento = await repositorio.listar({ busca: formatarCnpj(cnpj).slice(0, 15), situacao: "todos" });
    expect(porDocumento.itens.map((f) => f.id)).toContain(ativo.id);
  }, PRAZO_MS);

  it("guarda o endereço completo, com o CEP só em dígitos", async () => {
    const criado = await criar({ nome: `${marca} Endereço`, categoria: "servico", cep: "69.000-000", logradouro: "Rua Sintética", numero: "10", bairro: "Centro", cidade: "Manaus", uf: "AM" });
    expect(criado).toMatchObject({ cep: "69000000", logradouro: "Rua Sintética", numero: "10", complemento: null, bairro: "Centro" });
    expect((await editar(criado.id, { complemento: "Sala 2", numero: null })).numero).toBeNull();
  }, PRAZO_MS);

  it("desempenho e histórico a partir das cotações de verdade", async () => {
    const fornecedor = await criar({ nome: `${marca} Desempenho`, categoria: "kit_solar" });
    const pedido = (etapa: "cotacoes" | "pagamento" | "concluido", cancelado = false) => prisma.pedidoDeCompra.create({
      data: {
        companyId: "plugga", titulo: `${marca} pedido`, destino: "interno", solicitanteId: principal.id, prazoEntregaDesejado: new Date(), etapa,
        ...(etapa !== "cotacoes" ? { aprovadoEm: new Date() } : {}),
        ...(cancelado ? { canceladoEm: new Date(), motivoCancelamento: "teste" } : {}),
      },
      select: { id: true },
    });
    const cotar = (pedidoId: string, valor: string, frete: string | null, prazo: number | null) => prisma.cotacaoDeCompra.create({
      data: { pedidoId, fornecedorId: fornecedor.id, valor, valorFrete: frete, prazoEntregaDias: prazo, arquivoChave: marca, arquivoNome: "c.pdf" },
      select: { id: true },
    });
    const concluido = await pedido("concluido");
    const emCotacao = await pedido("cotacoes");
    const cancelado = await pedido("cotacoes", true);
    // Aprovado e cancelado depois, já no Pagamento: a vitória fica.
    const canceladoDepoisDeAprovado = await pedido("pagamento", true);
    const vencedora = await cotar(concluido.id, "100.00", "20.00", 6);
    const escolhidaEmAndamento = await cotar(emCotacao.id, "50.00", null, 2);
    const escolhidaCancelada = await cotar(cancelado.id, "999.00", null, null);
    await cotar(emCotacao.id, "60.00", null, null);
    const aprovadaECancelada = await cotar(canceladoDepoisDeAprovado.id, "40.00", null, 2);
    await prisma.pedidoDeCompra.update({ where: { id: canceladoDepoisDeAprovado.id }, data: { cotacaoSelecionadaId: aprovadaECancelada.id } });
    await prisma.pedidoDeCompra.update({ where: { id: concluido.id }, data: { cotacaoSelecionadaId: vencedora.id } });
    await prisma.pedidoDeCompra.update({ where: { id: emCotacao.id }, data: { cotacaoSelecionadaId: escolhidaEmAndamento.id } });
    await prisma.pedidoDeCompra.update({ where: { id: cancelado.id }, data: { cotacaoSelecionadaId: escolhidaCancelada.id } });

    // Vitórias: a do concluído e a aprovada-depois-cancelada. A escolhida em cotações e a cancelada antes de aprovar não.
    expect(await repositorio.desempenho(fornecedor.id)).toMatchObject({
      cotacoes: 5, vitorias: 2, percentualDeVitorias: 40, valorComprado: "120.00", prazoMedioDeEntregaDias: 3.3,
    });
    const historico = await repositorio.historicoDeCotacoes(fornecedor.id);
    expect(historico.total).toBe(5);
    expect(historico.itens.find((c) => c.id === escolhidaEmAndamento.id)).toMatchObject({ venceu: false });
    expect(historico.itens.find((c) => c.id === aprovadaECancelada.id)).toMatchObject({ venceu: true, pedido: { situacao: "cancelado" } });
    expect(historico.itens.find((c) => c.id === vencedora.id)).toMatchObject({ venceu: true, valorTotal: "120.00", pedido: { situacao: "concluido", empresa: "plugga" } });
    expect(historico.itens.find((c) => c.id === escolhidaCancelada.id)).toMatchObject({ venceu: false, pedido: { situacao: "cancelado" } });
    await expect(repositorio.desempenho(randomUUID())).rejects.toBeInstanceOf(NaoEncontrado);
  }, PRAZO_MS);

  it("edição com null apaga, edição vazia e situação repetida não gravam, id inexistente é 404", async () => {
    const criado = await criar({ nome: `${marca} Edição`, categoria: "outros", chavePix: "chave-sintetica" });
    expect((await editar(criado.id, { chavePix: null })).chavePix).toBeNull();

    await repositorio.mudarSituacao(criado.id, false, principal);
    await repositorio.mudarSituacao(criado.id, false, principal);
    expect(await prisma.eventLog.count({ where: { eventName: "suprimentos.fornecedor.inactivated", entityId: criado.id } })).toBe(1);

    await expect(repositorio.obter(randomUUID())).rejects.toBeInstanceOf(NaoEncontrado);

    const antes = await prisma.fornecedor.findUniqueOrThrow({ where: { id: criado.id }, select: { updatedAt: true } });
    await editar(criado.id, {});
    expect(await prisma.fornecedor.findUniqueOrThrow({ where: { id: criado.id }, select: { updatedAt: true } })).toEqual(antes);
    expect(await prisma.eventLog.count({ where: { eventName: "suprimentos.fornecedor.updated", entityId: criado.id } })).toBe(1);

    await Promise.all([repositorio.mudarSituacao(criado.id, true, principal), repositorio.mudarSituacao(criado.id, true, principal)]);
    expect(await prisma.eventLog.count({ where: { eventName: "suprimentos.fornecedor.reactivated", entityId: criado.id } })).toBe(1);
  }, PRAZO_MS);
});
