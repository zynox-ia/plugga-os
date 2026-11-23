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

  it("edição com null apaga, inativar é idempotente e id inexistente é 404", async () => {
    const criado = await criar({ nome: `${marca} Edição`, categoria: "outros", chavePix: "chave-sintetica" });
    expect((await editar(criado.id, { chavePix: null })).chavePix).toBeNull();

    await repositorio.mudarSituacao(criado.id, false, principal);
    await repositorio.mudarSituacao(criado.id, false, principal);
    expect(await prisma.eventLog.count({ where: { eventName: "suprimentos.fornecedor.inactivated", entityId: criado.id } })).toBe(1);

    await expect(repositorio.obter(randomUUID())).rejects.toBeInstanceOf(NaoEncontrado);
  }, PRAZO_MS);
});
