import { randomBytes, randomUUID } from "node:crypto";

import { criarCategoriaFinanceiraSchema, criarContaCorrenteSchema, editarCategoriaFinanceiraSchema, editarContaCorrenteSchema } from "@plugga/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditAppender } from "../src/audit/audit-appender.js";
import { Conflito, EstadoInvalido, RequisicaoInvalida } from "../src/common/errors/dominio.js";
import type { AuthPrincipal } from "../src/core/auth/auth.types.js";
import { PrismaCadastrosDoFinanceiroRepository } from "../src/financeiro/prisma-cadastros-do-financeiro.repository.js";
import { contextoBanco } from "../src/prisma/contexto-banco.js";
import { PrismaService } from "../src/prisma/prisma.service.js";

/**
 * O plano de contas e as contas correntes do Plugga OS (PLU-342, S3b) contra o Postgres:
 * a gerência do Financeiro grava, o membro só lê (o RLS barra mesmo sem o controller), o
 * código é único por empresa, e código, tipo, empresa e saldo não mudam pela aplicação.
 *
 *     pnpm --filter @plugga/api test:financeiro
 */
const HABILITADO = process.env.RUN_FINANCEIRO_INTEGRATION_TESTS === "true";
const PRAZO_MS = 60_000;
const TELAS = ["financeiro.pagar", "financeiro.receber"];

describe.skipIf(!HABILITADO)("cadastros do Financeiro no Postgres", () => {
  const prisma = new PrismaService();
  const cadastros = new PrismaCadastrosDoFinanceiroRepository(prisma, new AuditAppender());
  const marca = `cad-${randomUUID().slice(0, 8)}`;
  const sufixo = String(parseInt(marca.slice(4), 16) % 90 + 10);
  const sessoes = { gerente: randomBytes(32).toString("hex"), membro: randomBytes(32).toString("hex") };
  const pessoas: Record<keyof typeof sessoes, AuthPrincipal> = {} as never;
  const como = <T>(quem: keyof typeof sessoes, fazer: () => Promise<T>) => contextoBanco.run({ sessionHash: sessoes[quem], agentHash: undefined }, fazer);
  /** Como o pool da aplicação (o RLS vale), com a sessão de quem. A conexão do teste é de superusuário. */
  const comoRuntime = <T>(fazer: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => Promise<T>, quem: keyof typeof sessoes = "gerente") => prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL ROLE plugga_runtime");
    await tx.$executeRaw`SELECT set_config('plugga.session_hash', ${sessoes[quem]}, true)`;
    return fazer(tx);
  });
  const categoria = (codigo: string, empresa: "plugga" | "waze" = "plugga") => criarCategoriaFinanceiraSchema.parse({
    empresa, codigo, nome: `${marca} ${codigo}`, tipo: "despesa", natureza: "servico", grupoNome: `${marca} grupo`,
  });

  beforeAll(async () => {
    await prisma.$connect();
    for (const id of ["plugga", "waze"]) await prisma.company.upsert({ where: { id }, create: { id, name: id }, update: {} });
    for (const nivel of ["gerente", "membro"] as const) {
      const pessoa = await prisma.user.create({ data: { email: `${marca}-${nivel}@teste.local`, name: `${marca} ${nivel}` } });
      await prisma.userDepartamento.create({ data: { userId: pessoa.id, departamento: "financeiro", nivel, telas: TELAS } });
      await prisma.session.create({ data: { userId: pessoa.id, tokenHash: sessoes[nivel], expiresAt: new Date(Date.now() + 3_600_000), absoluteExpiresAt: new Date(Date.now() + 7_200_000) } });
      pessoas[nivel] = { id: pessoa.id, kind: "user", acesso: { plataforma: null, departamentos: [{ departamento: "financeiro", nivel, telas: TELAS }] } } as never;
    }
  }, PRAZO_MS);

  afterAll(async () => {
    await prisma.omieCategoria.deleteMany({ where: { categoria: { nome: { startsWith: marca } } } });
    await prisma.categoriaFinanceira.deleteMany({ where: { nome: { startsWith: marca } } });
    await prisma.contaCorrente.deleteMany({ where: { nome: { startsWith: marca } } });
    await prisma.session.deleteMany({ where: { tokenHash: { in: Object.values(sessoes) } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: marca } } });
    await prisma.$disconnect();
  }, PRAZO_MS);

  it("a gerência cadastra e edita a categoria; o evento leva o código e os nomes dos campos", async () => {
    const criada = await como("gerente", () => cadastros.criarCategoria(categoria(`8.${sufixo}.01`), pessoas.gerente));
    expect(criada).toMatchObject({ empresa: "plugga", codigo: `8.${sufixo}.01`, tipo: "despesa", grupo: { codigo: `8.${sufixo}`, nome: `${marca} grupo` }, ativa: true });

    const editada = await como("gerente", () => cadastros.editarCategoria(criada.id, editarCategoriaFinanceiraSchema.parse({ nome: `${marca} renomeada`, ativa: false }), pessoas.gerente));
    expect(editada).toMatchObject({ nome: `${marca} renomeada`, ativa: false, codigo: `8.${sufixo}.01` });

    const eventos = await prisma.eventLog.findMany({ where: { entityId: criada.id }, orderBy: { occurredAt: "asc" }, select: { eventName: true, payload: true } });
    expect(eventos).toEqual([
      { eventName: "financeiro.categoria.created", payload: { codigo: `8.${sufixo}.01`, tipo: "despesa", tarifaBancaria: false } },
      { eventName: "financeiro.categoria.updated", payload: { codigo: `8.${sufixo}.01`, campos: ["nome", "ativa"] } },
    ]);
    // Sem mudança, sem evento.
    await como("gerente", () => cadastros.editarCategoria(criada.id, { ativa: false }, pessoas.gerente));
    expect(await prisma.eventLog.count({ where: { entityId: criada.id } })).toBe(2);
  }, PRAZO_MS);

  it("o código é único por empresa: a mesma na outra empresa entra, repetida na mesma é 409", async () => {
    await como("gerente", () => cadastros.criarCategoria(categoria(`8.${sufixo}.02`), pessoas.gerente));
    await como("gerente", () => cadastros.criarCategoria(categoria(`8.${sufixo}.02`, "waze"), pessoas.gerente));
    await expect(como("gerente", () => cadastros.criarCategoria(categoria(`8.${sufixo}.02`), pessoas.gerente))).rejects.toBeInstanceOf(Conflito);
  }, PRAZO_MS);

  it("o grupo (prefixo do código) tem um nome só: outro nome na criação é recusado, e o nome só muda com a categoria sozinha no grupo", async () => {
    const noGrupo = (codigo: string, grupoNome: string) => ({ ...categoria(codigo), grupoNome });
    const sozinha = await como("gerente", () => cadastros.criarCategoria(noGrupo(`7.${sufixo}.01`, `${marca} G1`), pessoas.gerente));
    // Sozinha no grupo, o nome muda.
    expect((await como("gerente", () => cadastros.editarCategoria(sozinha.id, { grupoNome: `${marca} G2` }, pessoas.gerente))).grupo).toEqual({ codigo: `7.${sufixo}`, nome: `${marca} G2` });
    await expect(como("gerente", () => cadastros.criarCategoria(noGrupo(`7.${sufixo}.02`, `${marca} outro`), pessoas.gerente)))
      .rejects.toMatchObject({ message: `O grupo 7.${sufixo} já se chama "${marca} G2".` });
    await como("gerente", () => cadastros.criarCategoria(noGrupo(`7.${sufixo}.02`, `${marca} G2`), pessoas.gerente));
    // Com outra no grupo, renomear só uma é recusado; o resto da edição segue.
    await expect(como("gerente", () => cadastros.editarCategoria(sozinha.id, { grupoNome: `${marca} G3` }, pessoas.gerente))).rejects.toBeInstanceOf(RequisicaoInvalida);
    expect((await como("gerente", () => cadastros.editarCategoria(sozinha.id, { nome: `${marca} renomeada no grupo` }, pessoas.gerente))).nome).toBe(`${marca} renomeada no grupo`);
    // Outra empresa tem os grupos dela.
    await como("gerente", () => cadastros.criarCategoria({ ...noGrupo(`7.${sufixo}.01`, `${marca} da Waze`), empresa: "waze" }, pessoas.gerente));
  }, PRAZO_MS);

  it("a gerência cadastra e edita a conta corrente; banco vazio vira nulo", async () => {
    const criada = await como("gerente", () => cadastros.criarConta(criarContaCorrenteSchema.parse({ empresa: "waze", nome: `${marca} caixa`, banco: "" }), pessoas.gerente));
    expect(criada).toMatchObject({ empresa: "waze", nome: `${marca} caixa`, banco: null, saldo: null, ativa: true });
    const editada = await como("gerente", () => cadastros.editarConta(criada.id, editarContaCorrenteSchema.parse({ banco: "Banco A", agencia: "0001" }), pessoas.gerente));
    expect(editada).toMatchObject({ banco: "Banco A", agencia: "0001", numero: null });
  }, PRAZO_MS);

  it("o saldo inicial: informado com o dia, editado, igual não gera evento, e removido com os dois nulos", async () => {
    const criada = await como("gerente", () => cadastros.criarConta(criarContaCorrenteSchema.parse({
      empresa: "plugga", nome: `${marca} com saldo`, saldoInicial: "-250.5", saldoInicialEm: "2026-11-01",
    }), pessoas.gerente));
    expect(criada).toMatchObject({ saldoInicial: "-250.50", saldoInicialEm: "2026-11-01" });
    // O dia é o início do dia em Manaus (UTC-4).
    expect((await prisma.contaCorrente.findUniqueOrThrow({ where: { id: criada.id } })).saldoInicialEm?.toISOString()).toBe("2026-11-01T04:00:00.000Z");

    const editar = (dados: unknown) => como("gerente", () => cadastros.editarConta(criada.id, editarContaCorrenteSchema.parse(dados), pessoas.gerente));
    expect(await editar({ saldoInicial: "1500", saldoInicialEm: "2026-11-20" })).toMatchObject({ saldoInicial: "1500.00", saldoInicialEm: "2026-11-20" });
    await editar({ saldoInicial: "1500.00", saldoInicialEm: "2026-11-20" });
    expect(await editar({ saldoInicial: null, saldoInicialEm: null })).toMatchObject({ saldoInicial: null, saldoInicialEm: null });

    const eventos = await prisma.eventLog.findMany({ where: { entityId: criada.id }, orderBy: { occurredAt: "asc" }, select: { payload: true } });
    // Sem o valor no evento: só se foi informado e os nomes dos campos.
    expect(eventos.map((e) => e.payload)).toEqual([
      { saldoInicial: true },
      { campos: ["saldoInicial", "saldoInicialEm"] },
      { campos: ["saldoInicial", "saldoInicialEm"] },
    ]);
    // O banco também exige os dois juntos.
    await expect(prisma.contaCorrente.update({ where: { id: criada.id }, data: { saldoInicial: 1 } })).rejects.toThrow(/contas_correntes_saldo_inicial_com_dia/);
  }, PRAZO_MS);

  it("RLS: a gerência grava pelo pool da aplicação; o membro lê, mas o banco recusa a gravação mesmo sem o controller", async () => {
    const inserirConta = (nome: string) => (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) =>
      tx.$executeRaw`INSERT INTO public.contas_correntes (company_id, nome, updated_at) VALUES ('plugga', ${nome}, now())`;
    const inserirCategoria = (codigo: string) => (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) =>
      tx.$executeRaw`INSERT INTO public.categorias_financeiras (company_id, codigo, nome, tipo, natureza, grupo_nome, updated_at)
        VALUES ('plugga', ${codigo}, ${`${marca} ${codigo}`}, 'despesa', 'servico', 'Teste', now())`;

    expect(await comoRuntime(inserirConta(`${marca} da gerência`), "gerente")).toBe(1);
    expect(await comoRuntime(inserirCategoria(`8.${sufixo}.03`), "gerente")).toBe(1);
    await expect(comoRuntime(inserirConta(`${marca} do membro`), "membro")).rejects.toThrow(/row-level security/);
    await expect(comoRuntime(inserirCategoria(`8.${sufixo}.05`), "membro")).rejects.toThrow(/row-level security/);

    // O membro vê a conta, mas o UPDATE não alcança a linha.
    const vistas = await comoRuntime((tx) => tx.contaCorrente.count({ where: { nome: `${marca} da gerência` } }), "membro");
    expect(vistas).toBe(1);
    const mudadas = await comoRuntime((tx) => tx.$executeRaw`UPDATE public.contas_correntes SET nome = ${`${marca} mudada`} WHERE nome = ${`${marca} da gerência`}`, "membro");
    expect(mudadas).toBe(0);
    expect(await comoRuntime((tx) => tx.$executeRaw`UPDATE public.contas_correntes SET ativa = false WHERE nome = ${`${marca} da gerência`}`, "gerente")).toBe(1);
  }, PRAZO_MS);

  it("o vínculo do OMIE (S4): a gerência insere pela importação; o membro não; e ninguém altera nem apaga o vínculo", async () => {
    const c = await como("gerente", () => cadastros.criarCategoria(categoria(`8.${sufixo}.07`), pessoas.gerente));
    const vincular = (quem: keyof typeof sessoes, codigo: string) => comoRuntime((tx) => tx.omieCategoria.create({ data: { categoriaId: c.id, companyId: "plugga", omieCodigo: codigo, lidaEm: new Date() } }), quem);
    await expect(vincular("membro", `${marca}-m`)).rejects.toThrow(/row-level security/);
    await vincular("gerente", `${marca}-g`);
    await expect(comoRuntime((tx) => tx.$executeRaw`UPDATE public.omie_categorias SET omie_codigo = 'x' WHERE categoria_id = ${c.id}::uuid`)).rejects.toThrow(/permission denied/);
    await expect(comoRuntime((tx) => tx.$executeRaw`DELETE FROM public.omie_categorias WHERE categoria_id = ${c.id}::uuid`)).rejects.toThrow(/permission denied/);
  }, PRAZO_MS);

  it("C5: a categoria de tarifas é uma por empresa; marcar outra desmarca a anterior e diz qual; inativar desmarca; só despesa ativa", async () => {
    const marcar = (id: string, dados: unknown) => como("gerente", () => cadastros.editarCategoria(id, editarCategoriaFinanceiraSchema.parse(dados), pessoas.gerente));
    const marcadas = (empresa: string) => prisma.categoriaFinanceira.findMany({ where: { companyId: empresa, tarifaBancaria: true }, select: { id: true } });
    const a = await como("gerente", () => cadastros.criarCategoria(categoria(`6.${sufixo}.01`, "waze"), pessoas.gerente));
    const b = await como("gerente", () => cadastros.criarCategoria(categoria(`6.${sufixo}.02`, "waze"), pessoas.gerente));
    const daPlugga = await como("gerente", () => cadastros.criarCategoria(categoria(`6.${sufixo}.01`), pessoas.gerente));
    expect(a.tarifaBancaria).toBe(false);

    const comA = await marcar(a.id, { tarifaBancaria: true });
    expect(comA.tarifaBancaria).toBe(true);
    await marcar(daPlugga.id, { tarifaBancaria: true });
    // A troca na mesma empresa, sem 409: a resposta diz qual perdeu a marca; a da outra empresa fica.
    const comB = await marcar(b.id, { tarifaBancaria: true });
    expect(comB).toMatchObject({ tarifaBancaria: true, desmarcada: { id: a.id, codigo: `6.${sufixo}.01`, nome: a.nome } });
    expect(await marcadas("waze")).toEqual([{ id: b.id }]);
    expect((await marcadas("plugga")).map((c) => c.id)).toEqual([daPlugga.id]);
    // Marcar de novo a mesma não gera evento nem desmarcada.
    expect(await marcar(b.id, { tarifaBancaria: true })).not.toHaveProperty("desmarcada");
    const eventosDeA = await prisma.eventLog.findMany({ where: { entityId: a.id, eventName: "financeiro.categoria.updated" }, orderBy: { occurredAt: "asc" }, select: { payload: true } });
    expect(eventosDeA.map((e) => e.payload)).toEqual([{ codigo: `6.${sufixo}.01`, campos: ["tarifaBancaria"] }, { codigo: `6.${sufixo}.01`, campos: ["tarifaBancaria"] }]);

    // Inativar a marcada tira a marca; inativa não se marca (409 com a mensagem pronta); desmarcar sem outra vale.
    expect(await marcar(b.id, { ativa: false })).toMatchObject({ ativa: false, tarifaBancaria: false });
    expect(await marcadas("waze")).toEqual([]);
    await expect(marcar(b.id, { tarifaBancaria: true })).rejects.toBeInstanceOf(EstadoInvalido);
    await expect(marcar(b.id, { tarifaBancaria: true, ativa: false })).rejects.toBeInstanceOf(EstadoInvalido);
    expect(await marcar(b.id, { tarifaBancaria: true, ativa: true })).toMatchObject({ ativa: true, tarifaBancaria: true });
    expect(await marcar(b.id, { tarifaBancaria: false })).toMatchObject({ tarifaBancaria: false });
    expect(await marcadas("waze")).toEqual([]);

    // Só despesa; a categoria nova pode nascer marcada, e a anterior perde a marca.
    const receita = await como("gerente", () => cadastros.criarCategoria({ ...categoria(`1.${sufixo}.01`, "waze"), tipo: "receita" }, pessoas.gerente));
    await expect(marcar(receita.id, { tarifaBancaria: true })).rejects.toBeInstanceOf(RequisicaoInvalida);
    await expect(como("gerente", () => cadastros.criarCategoria({ ...categoria(`1.${sufixo}.02`, "waze"), tipo: "receita", tarifaBancaria: true }, pessoas.gerente))).rejects.toBeInstanceOf(RequisicaoInvalida);
    await marcar(a.id, { tarifaBancaria: true });
    const nova = await como("gerente", () => cadastros.criarCategoria({ ...categoria(`6.${sufixo}.03`, "waze"), tarifaBancaria: true }, pessoas.gerente));
    expect(nova).toMatchObject({ tarifaBancaria: true, desmarcada: { id: a.id } });

    // O banco garante sozinho: duas marcadas na empresa, receita marcada e inativa marcada são recusadas.
    await expect(prisma.categoriaFinanceira.update({ where: { id: a.id }, data: { tarifaBancaria: true } })).rejects.toThrow(/categorias_financeiras_tarifa_bancaria_key|Unique constraint/);
    await expect(prisma.categoriaFinanceira.update({ where: { id: receita.id }, data: { tarifaBancaria: true } })).rejects.toThrow(/categorias_financeiras_tarifa_de_despesa/);
    await expect(prisma.categoriaFinanceira.update({ where: { id: nova.id }, data: { ativa: false } })).rejects.toThrow(/categorias_financeiras_tarifa_de_despesa/);
    // O membro não marca (o RLS de UPDATE é da gerência).
    expect(await comoRuntime((tx) => tx.$executeRaw`UPDATE public.categorias_financeiras SET tarifa_bancaria = false WHERE id = ${nova.id}::uuid`, "membro")).toBe(0);
  }, PRAZO_MS);

  it("o SQL que o Prisma gera no cadastro cabe nos privilégios por coluna do pool da aplicação", async () => {
    await comoRuntime(async (tx) => {
      const c = await tx.categoriaFinanceira.create({ data: { companyId: "plugga", codigo: `8.${sufixo}.06`, nome: `${marca} pelo prisma`, tipo: "despesa", natureza: "servico", grupoNome: "Teste", tarifaBancaria: false } });
      await tx.categoriaFinanceira.update({ where: { id: c.id }, data: { nome: `${marca} pelo prisma 2`, natureza: "outros", grupoNome: "Outro", tarifaBancaria: false, ativa: false } });
      const conta = await tx.contaCorrente.create({ data: { companyId: "plugga", nome: `${marca} conta pelo prisma`, banco: null, agencia: null, numero: null, saldoInicial: 10, saldoInicialEm: new Date("2026-11-01T04:00:00Z") } });
      await tx.contaCorrente.update({ where: { id: conta.id }, data: { nome: `${marca} conta pelo prisma 2`, banco: "B", agencia: "1", numero: "2", ativa: false, saldoInicial: null, saldoInicialEm: null } });
    });
    expect(await prisma.categoriaFinanceira.count({ where: { nome: `${marca} pelo prisma 2`, ativa: false } })).toBe(1);
  }, PRAZO_MS);

  it("código, tipo e empresa da categoria, e o saldo e o vínculo da conta, não mudam pela aplicação", async () => {
    const criada = await como("gerente", () => cadastros.criarCategoria(categoria(`8.${sufixo}.04`), pessoas.gerente));
    const conta = await como("gerente", () => cadastros.criarConta(criarContaCorrenteSchema.parse({ empresa: "plugga", nome: `${marca} imutável` }), pessoas.gerente));
    for (const sql of [
      `UPDATE public.categorias_financeiras SET codigo = '8.99.99' WHERE id = '${criada.id}'`,
      `UPDATE public.categorias_financeiras SET tipo = 'receita' WHERE id = '${criada.id}'`,
      `UPDATE public.categorias_financeiras SET company_id = 'waze' WHERE id = '${criada.id}'`,
      `UPDATE public.contas_correntes SET saldo = 1 WHERE id = '${conta.id}'`,
      `UPDATE public.contas_correntes SET omie_codigo = 'x' WHERE id = '${conta.id}'`,
      `DELETE FROM public.contas_correntes WHERE id = '${conta.id}'`,
    ]) {
      await expect(comoRuntime((tx) => tx.$executeRawUnsafe(sql)), sql).rejects.toThrow(/permission denied/);
    }
  }, PRAZO_MS);
});
