import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaService } from "../src/prisma/prisma.service.js";

/**
 * O vínculo das categorias e das contas correntes com o OMIE (PLU-342, S3a) contra o
 * Postgres: o backfill da própria migration, a empresa amarrada ao cadastro, o código
 * único por empresa e a aplicação só lendo.
 *
 *     pnpm --filter @plugga/api test:financeiro
 */
const HABILITADO = process.env.RUN_FINANCEIRO_INTEGRATION_TESTS === "true";
const PRAZO_MS = 60_000;
const MIGRATION = "../prisma/migrations/20261124500500_omie_mapeamentos/migration.sql";

describe.skipIf(!HABILITADO)("vínculos do OMIE com os cadastros do Financeiro", () => {
  const prisma = new PrismaService();
  const marca = `mapa-${randomUUID().slice(0, 8)}`;
  const sufixo = String(parseInt(marca.slice(5), 16) % 100_000);
  const sessao = randomBytes(32).toString("hex");
  const ids = { lida: "", manual: "", contaDoOmie: "", contaManual: "" };
  const comoRuntime = <T>(fazer: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => Promise<T>) => prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL ROLE plugga_runtime");
    await tx.$executeRaw`SELECT set_config('plugga.session_hash', ${sessao}, true)`;
    return fazer(tx);
  });

  beforeAll(async () => {
    await prisma.$connect();
    for (const id of ["plugga", "waze"]) await prisma.company.upsert({ where: { id }, create: { id, name: id }, update: {} });
    const admin = await prisma.role.upsert({ where: { key: "admin" }, create: { key: "admin", name: "Admin" }, update: {} });
    const pessoa = await prisma.user.create({ data: { email: `${marca}@teste.local`, name: `${marca} Pessoa`, platformRoles: { create: { roleId: admin.id } } } });
    await prisma.session.create({ data: { userId: pessoa.id, tokenHash: sessao, expiresAt: new Date(Date.now() + 3_600_000), absoluteExpiresAt: new Date(Date.now() + 7_200_000) } });
    const categoria = (codigo: string, lidaEm: Date | null) => prisma.categoriaFinanceira.create({
      data: { companyId: "plugga", codigo, nome: `${marca} ${codigo}`, tipo: "despesa", natureza: "servico", grupoNome: "Teste", lidaEm },
    });
    ids.lida = (await categoria(`9.06.${sufixo}`, new Date("2026-11-20T12:00:00Z"))).id;
    ids.manual = (await categoria(`9.07.${sufixo}`, null)).id;
    ids.contaDoOmie = (await prisma.contaCorrente.create({ data: { companyId: "plugga", omieCodigo: `${marca}-c`, nome: `${marca} conta do OMIE` } })).id;
    ids.contaManual = (await prisma.contaCorrente.create({ data: { companyId: "plugga", nome: `${marca} conta manual` } })).id;
  }, PRAZO_MS);

  afterAll(async () => {
    await prisma.omieCategoria.deleteMany({ where: { categoria: { nome: { startsWith: marca } } } });
    await prisma.omieContaCorrente.deleteMany({ where: { contaCorrente: { nome: { startsWith: marca } } } });
    await prisma.categoriaFinanceira.deleteMany({ where: { nome: { startsWith: marca } } });
    await prisma.contaCorrente.deleteMany({ where: { nome: { startsWith: marca } } });
    await prisma.session.deleteMany({ where: { tokenHash: sessao } });
    await prisma.user.deleteMany({ where: { email: { startsWith: marca } } });
    await prisma.$disconnect();
  }, PRAZO_MS);

  it("o backfill (o SQL da migration): vincula o que veio do OMIE, deixa o cadastro próprio sem vínculo e pode rodar de novo", async () => {
    const sql = readFileSync(join(__dirname, MIGRATION), "utf8").replace(/\r\n/g, "\n");
    const backfill = /-- backfill:inicio\n([\s\S]*?)-- backfill:fim/.exec(sql)?.[1];
    expect(backfill).toMatch(/INSERT INTO public\.omie_categorias/);
    expect(backfill).toMatch(/INSERT INTO public\.omie_contas_correntes/);
    // Dois comandos: o $executeRawUnsafe roda um por vez.
    const comandos = backfill!.split(/;\s*\n/).map((c) => c.replace(/^\s*--.*$/gm, "").trim()).filter(Boolean);
    expect(comandos).toHaveLength(2);
    for (let vez = 0; vez < 2; vez++) for (const comando of comandos) await prisma.$executeRawUnsafe(comando);

    const categorias = await prisma.omieCategoria.findMany({ where: { categoriaId: { in: [ids.lida, ids.manual] } } });
    expect(categorias).toEqual([expect.objectContaining({ categoriaId: ids.lida, companyId: "plugga", omieCodigo: `9.06.${sufixo}`, lidaEm: new Date("2026-11-20T12:00:00Z") })]);
    const contas = await prisma.omieContaCorrente.findMany({ where: { contaCorrenteId: { in: [ids.contaDoOmie, ids.contaManual] } } });
    expect(contas).toEqual([expect.objectContaining({ contaCorrenteId: ids.contaDoOmie, companyId: "plugga", omieCodigo: `${marca}-c` })]);
  }, PRAZO_MS);

  it("o vínculo já existente não é sobrescrito pelo backfill", async () => {
    await prisma.omieCategoria.update({ where: { categoriaId: ids.lida }, data: { omieCodigo: `${marca}-outro` } });
    const sql = readFileSync(join(__dirname, MIGRATION), "utf8").replace(/\r\n/g, "\n");
    const primeiro = /INSERT INTO public\.omie_categorias[\s\S]*?DO NOTHING/.exec(sql)?.[0];
    await prisma.$executeRawUnsafe(primeiro!);
    expect((await prisma.omieCategoria.findUniqueOrThrow({ where: { categoriaId: ids.lida } })).omieCodigo).toBe(`${marca}-outro`);
  }, PRAZO_MS);

  it("a empresa do vínculo é a do cadastro, e o código do OMIE não se repete na empresa", async () => {
    await expect(prisma.omieCategoria.create({ data: { categoriaId: ids.manual, companyId: "waze", omieCodigo: `${marca}-w` } })).rejects.toThrow(/omie_categorias_da_empresa_fkey|Foreign key/i);
    await expect(prisma.omieContaCorrente.create({ data: { contaCorrenteId: ids.contaManual, companyId: "plugga", omieCodigo: `${marca}-c` } })).rejects.toThrow(/Unique constraint/i);
    // Com um código livre na empresa, o vínculo entra.
    await prisma.omieContaCorrente.create({ data: { contaCorrenteId: ids.contaManual, companyId: "plugga", omieCodigo: `${marca}-c2` } });
  }, PRAZO_MS);

  it("a aplicação só lê o vínculo; quem grava é a importação", async () => {
    const lidas = await comoRuntime((tx) => tx.omieCategoria.findMany({ where: { categoriaId: ids.lida } }));
    expect(lidas).toHaveLength(1);
    await expect(comoRuntime((tx) => tx.$executeRaw`INSERT INTO public.omie_categorias (categoria_id, company_id, omie_codigo) VALUES (${ids.manual}::uuid, 'plugga', 'x')`))
      .rejects.toThrow(/permission denied/);
    await expect(comoRuntime((tx) => tx.$executeRaw`UPDATE public.omie_contas_correntes SET omie_codigo = 'x' WHERE conta_corrente_id = ${ids.contaDoOmie}::uuid`))
      .rejects.toThrow(/permission denied/);
    // Sem sessão, o RLS do cadastro esconde o vínculo.
    const semSessao = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL ROLE plugga_runtime");
      return tx.omieContaCorrente.count({ where: { contaCorrenteId: ids.contaDoOmie } });
    });
    expect(semSessao).toBe(0);
  }, PRAZO_MS);
});
