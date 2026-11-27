import { randomBytes, randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";
import { relatorioPorCategoriaSchema, type CompanyKey, type RelatorioPorCategoria } from "@plugga/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditAppender } from "../src/audit/audit-appender.js";
import type { AuthPrincipal } from "../src/core/auth/auth.types.js";
import { papelNoFinanceiro } from "../src/financeiro/financeiro.rules.js";
import { PrismaConciliacaoRepository } from "../src/financeiro/prisma-conciliacao.repository.js";
import { PrismaFinanceiroRepository } from "../src/financeiro/prisma-financeiro.repository.js";
import { PrismaRelatoriosDoFinanceiroRepository, somasPorCategoria } from "../src/financeiro/prisma-relatorios-do-financeiro.repository.js";
import { periodoDoRelatorio } from "../src/financeiro/relatorio-por-categoria.rules.js";
import { contextoBanco } from "../src/prisma/contexto-banco.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { assertSafeTestDatabaseUrl } from "./safe-test-environment";

/**
 * O relatório por grupo e categoria (PLU-360) contra o Postgres: a soma de cada
 * seção bate com a soma dos lançamentos liquidados no período (pelo dia de
 * Manaus e pelo valor liquidado), fora o cancelado e a transferência, com o sem
 * categoria numa linha própria, nas duas empresas; e o RLS recorta a seção que
 * a sessão não vê. O período é de março de 2031, longe dos dados das outras
 * suítes; mesmo assim a conferência total é feita contra o banco inteiro.
 *
 *     pnpm --filter @plugga/api test:financeiro
 */
const HABILITADO = process.env.RUN_FINANCEIRO_INTEGRATION_TESTS === "true";
const PRAZO_MS = 60_000;
const AGORA = new Date("2031-04-02T14:00:00Z");
const MARCO = { de: "2031-03-01", ate: "2031-03-31" };
/** O início de um dia de Manaus (UTC-4), como a aplicação grava pago_em e recebido_em. */
const diaDeManaus = (dia: string) => new Date(`${dia}T04:00:00Z`);

describe.skipIf(!HABILITADO)("relatório por categoria no Postgres", () => {
  const prisma = new PrismaService();
  const relatorios = new PrismaRelatoriosDoFinanceiroRepository(prisma);
  const lancamentos = new PrismaFinanceiroRepository(prisma, new AuditAppender());
  const conciliacao = new PrismaConciliacaoRepository(prisma, new AuditAppender());
  const marca = `rel-${randomUUID().slice(0, 8)}`;
  const sessoes = { admin: randomBytes(32).toString("hex"), pagar: randomBytes(32).toString("hex"), relatorios: randomBytes(32).toString("hex") };
  const papel = papelNoFinanceiro({ plataforma: "admin", departamentos: [] });
  let admin: AuthPrincipal;
  const ids = {
    fornecedor: "", cliente: "", contaPlugga: "", contaPlugga2: "", contaWaze: "",
    issPlugga: "", issWaze: "", inssPlugga: "", receitaPlugga: "", receitaWaze: "", taxaPlugga: "",
  };
  const codigos = { iss: "", inss: "", receita: "", taxa: "", grupoImpostos: "", grupoReceitas: "", grupoTaxas: "" };
  const comoAdmin = <T>(fazer: () => Promise<T>) => contextoBanco.run({ sessionHash: sessoes.admin, agentHash: undefined }, fazer);
  /** Como o login da aplicação (sem BYPASSRLS), na sessão de quem pede. */
  const comoRuntime = <T>(quem: keyof typeof sessoes, fazer: (tx: Prisma.TransactionClient) => Promise<T>) => prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL ROLE plugga_runtime");
    await tx.$executeRaw`SELECT set_config('plugga.session_hash', ${sessoes[quem]}, true)`;
    return fazer(tx);
  });

  const paga = (dados: { empresa: CompanyKey; dia: string; valor: string; categoriaId: string | null; conta?: string; extra?: Partial<Prisma.LancamentoUncheckedCreateInput> }) => prisma.lancamento.create({
    data: {
      tipo: "saida", companyId: dados.empresa, fornecedorId: ids.fornecedor, categoriaId: dados.categoriaId,
      contaCorrenteId: dados.conta ?? (dados.empresa === "plugga" ? ids.contaPlugga : ids.contaWaze),
      descricao: `${marca} saída ${dados.dia}`, valor: new Prisma.Decimal(dados.valor), vencimento: diaDeManaus(dados.dia), etapa: "paga", origem: "avulsa",
      aprovadoEm: AGORA, forma: "pix", pagoEm: diaDeManaus(dados.dia), pagamentoRegistradoEm: AGORA, ...dados.extra,
    },
    select: { id: true },
  });
  const recebida = (dados: { empresa: CompanyKey; dia: string; valor: string; recebido: string; categoriaId: string; competencia: string }) => prisma.lancamento.create({
    data: {
      tipo: "entrada", companyId: dados.empresa, clientId: ids.cliente, categoriaId: dados.categoriaId,
      contaCorrenteId: dados.empresa === "plugga" ? ids.contaPlugga : ids.contaWaze,
      descricao: `${marca} entrada ${dados.competencia}`, valor: new Prisma.Decimal(dados.valor), vencimento: diaDeManaus(dados.dia), competencia: dados.competencia,
      etapa: "recebida", origem: "cobranca_manual", recebidoEm: diaDeManaus(dados.dia), recebimentoRegistradoEm: AGORA, valorRecebido: new Prisma.Decimal(dados.recebido),
    },
    select: { id: true },
  });

  /** A conferência independente: soma, em JS, o valor liquidado de cada lançamento do período no banco inteiro. */
  const somaDoBanco = async (tipo: "saida" | "entrada", empresa?: CompanyKey) => {
    const { desde, antes } = periodoDoRelatorio(MARCO.de, MARCO.ate);
    const linhas = await prisma.lancamento.findMany({
      where: { tipo, canceladoEm: null, origem: { not: "transferencia" }, liquidadoEm: { gte: desde, lt: antes }, ...(empresa ? { companyId: empresa } : {}) },
      select: { valor: true, valorRecebido: true },
    });
    return { total: linhas.reduce((t, l) => t.add(tipo === "entrada" ? (l.valorRecebido ?? l.valor) : l.valor), new Prisma.Decimal(0)).toFixed(2), quantidade: linhas.length };
  };
  const relatorio = (empresa?: CompanyKey) => comoAdmin(() => relatorios.porCategoria({ ...MARCO, ...(empresa ? { empresa } : {}) }, papel));
  const grupo = (r: RelatorioPorCategoria, secao: "entradas" | "saidas", codigo: string | null, nome?: string) =>
    r[secao]!.grupos.find((g) => g.codigo === codigo && (nome === undefined || g.nome === nome));

  beforeAll(async () => {
    assertSafeTestDatabaseUrl(process.env.DATABASE_URL!, process.env.CI === "true", process.env.PLUGGA_TEST_DB_PORT);
    await prisma.$connect();
    for (const id of ["plugga", "waze"]) await prisma.company.upsert({ where: { id }, create: { id, name: id }, update: {} });
    const papelAdmin = await prisma.role.upsert({ where: { key: "admin" }, create: { key: "admin", name: "Admin" }, update: {} });
    for (const [quem, telas] of [["admin", null], ["pagar", ["financeiro.pagar", "financeiro.relatorios"]], ["relatorios", ["financeiro.relatorios"]]] as const) {
      const pessoa = await prisma.user.create({ data: { email: `${marca}-${quem}@teste.local`, name: `${marca} ${quem}`, ...(telas ? {} : { platformRoles: { create: { roleId: papelAdmin.id } } }) } });
      if (telas) await prisma.userDepartamento.create({ data: { userId: pessoa.id, departamento: "financeiro", nivel: "membro", telas: [...telas] } });
      await prisma.session.create({ data: { userId: pessoa.id, tokenHash: sessoes[quem], expiresAt: new Date(Date.now() + 3_600_000), absoluteExpiresAt: new Date(Date.now() + 7_200_000) } });
      if (quem === "admin") admin = { id: pessoa.id, kind: "user", acesso: { plataforma: "admin", departamentos: [] } };
    }
    ids.fornecedor = (await prisma.fornecedor.create({ data: { nome: `${marca} Fornecedor`, categoria: "servico" } })).id;
    ids.cliente = (await prisma.client.create({ data: { name: `${marca} Cliente` } })).id;
    ids.contaPlugga = (await prisma.contaCorrente.create({ data: { companyId: "plugga", nome: `${marca} conta P` } })).id;
    ids.contaPlugga2 = (await prisma.contaCorrente.create({ data: { companyId: "plugga", nome: `${marca} conta P2` } })).id;
    ids.contaWaze = (await prisma.contaCorrente.create({ data: { companyId: "waze", nome: `${marca} conta W` } })).id;
    // Grupos com a marca no segundo nível, para não colidir com o seed nem com as outras suítes.
    const nivel = String(10 + (parseInt(marca.slice(4), 16) % 89));
    const sufixo = String(parseInt(marca.slice(4), 16) % 100_000);
    codigos.grupoImpostos = `8.${nivel}`;
    codigos.grupoReceitas = `7.${nivel}`;
    codigos.iss = `8.${nivel}.${sufixo}1`;
    codigos.inss = `8.${nivel}.${sufixo}2`;
    codigos.receita = `7.${nivel}.${sufixo}1`;
    codigos.grupoTaxas = `6.${nivel}`;
    codigos.taxa = `6.${nivel}.${sufixo}1`;
    const categoria = (companyId: CompanyKey, codigo: string, nome: string, tipo: "receita" | "despesa", grupoNome: string) => prisma.categoriaFinanceira.create({
      data: { companyId, codigo, nome: `${marca} ${nome}`, tipo, natureza: tipo === "receita" ? "receita" : "imposto", grupoNome: `${marca} ${grupoNome}` },
      select: { id: true },
    });
    ids.issPlugga = (await categoria("plugga", codigos.iss, "ISS", "despesa", "Impostos")).id;
    ids.issWaze = (await categoria("waze", codigos.iss, "ISS", "despesa", "Impostos")).id;
    ids.inssPlugga = (await categoria("plugga", codigos.inss, "INSS", "despesa", "Impostos")).id;
    ids.receitaPlugga = (await categoria("plugga", codigos.receita, "Gestão de energia", "receita", "Receitas")).id;
    ids.receitaWaze = (await categoria("waze", codigos.receita, "Gestão de energia", "receita", "Receitas")).id;
    ids.taxaPlugga = (await categoria("plugga", codigos.taxa, "Taxa de fim de dia", "despesa", "Taxas")).id;

    // Março de 2031, Plugga: ISS no primeiro e no último dia, INSS e uma saída sem categoria.
    await paga({ empresa: "plugga", dia: "2031-03-01", valor: "100.00", categoriaId: ids.issPlugga });
    await paga({ empresa: "plugga", dia: "2031-03-31", valor: "50.25", categoriaId: ids.issPlugga });
    await paga({ empresa: "plugga", dia: "2031-03-15", valor: "200.00", categoriaId: ids.inssPlugga });
    await paga({ empresa: "plugga", dia: "2031-03-10", valor: "7.30", categoriaId: null });
    // Virada de dia: o dia anterior e o seguinte ao período ficam fora.
    await paga({ empresa: "plugga", dia: "2031-02-28", valor: "999.00", categoriaId: ids.issPlugga });
    await paga({ empresa: "plugga", dia: "2031-04-01", valor: "888.00", categoriaId: ids.issPlugga });
    // Cancelada com pagamento registrado (estado que o banco aceita): fora.
    await paga({ empresa: "plugga", dia: "2031-03-20", valor: "777.00", categoriaId: ids.issPlugga, extra: { etapa: "aprovada", canceladoEm: AGORA, cancelamentoMotivo: "teste" } });
    // Em aberto, vencendo no período, sem pagamento: fora.
    await prisma.lancamento.create({ data: { tipo: "saida", companyId: "plugga", fornecedorId: ids.fornecedor, categoriaId: ids.issPlugga, descricao: `${marca} aberta`, valor: 666, vencimento: diaDeManaus("2031-03-20"), etapa: "aprovada", origem: "avulsa", aprovadoEm: AGORA } });
    // Waze: ISS (mesmo código e nome) e uma receita recebida em parte.
    await paga({ empresa: "waze", dia: "2031-03-05", valor: "40.00", categoriaId: ids.issWaze });
    await recebida({ empresa: "plugga", dia: "2031-03-12", valor: "1000.00", recebido: "1000.00", categoriaId: ids.receitaPlugga, competencia: "2031-02" });
    await recebida({ empresa: "waze", dia: "2031-03-12", valor: "500.00", recebido: "320.50", categoriaId: ids.receitaWaze, competencia: "2031-02" });
    // Liquidada no último instante do último dia (23:59:59.9995 em Manaus, com microssegundos): dentro.
    // E a do primeiro instante do dia seguinte: fora. O pago_em vai por SQL: o Date do JavaScript para no milissegundo.
    const noFim = await paga({ empresa: "plugga", dia: "2031-03-31", valor: "0.75", categoriaId: ids.taxaPlugga });
    await prisma.$executeRaw`UPDATE public.lancamentos SET pago_em = '2031-04-01 03:59:59.9995+00' WHERE id = ${noFim.id}::uuid`;
    await paga({ empresa: "plugga", dia: "2031-04-01", valor: "0.25", categoriaId: ids.taxaPlugga });
    // Transferência entre as contas da Plugga: as duas pernas liquidadas no período, fora das duas seções.
    await comoAdmin(() => conciliacao.criarTransferencia({ contaOrigemId: ids.contaPlugga, contaDestinoId: ids.contaPlugga2, valor: "5000.00", dia: "2031-03-18", descricao: `${marca} transferência` }, admin, AGORA));
  }, PRAZO_MS);

  afterAll(async () => {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL session_replication_role = replica");
      const contas = [ids.contaPlugga, ids.contaPlugga2, ids.contaWaze];
      const daMarca = { OR: [{ descricao: { startsWith: marca } }, { contaCorrenteId: { in: contas } }] };
      await tx.historicoDeLancamento.deleteMany({ where: { lancamento: daMarca } });
      await tx.lancamento.deleteMany({ where: daMarca });
      await tx.transferencia.deleteMany({ where: { contaOrigemId: { in: contas } } });
      await tx.categoriaFinanceira.deleteMany({ where: { nome: { startsWith: marca } } });
      await tx.contaCorrente.deleteMany({ where: { id: { in: contas } } });
      await tx.fornecedor.deleteMany({ where: { nome: { startsWith: marca } } });
      await tx.client.deleteMany({ where: { name: { startsWith: marca } } });
    });
    await prisma.session.deleteMany({ where: { tokenHash: { in: Object.values(sessoes) } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: marca } } });
    await prisma.$disconnect();
  }, PRAZO_MS);

  it("a soma de cada seção bate com a soma dos lançamentos liquidados do período, nas duas empresas e em cada uma", async () => {
    for (const empresa of [undefined, "plugga", "waze"] as const) {
      const r = relatorioPorCategoriaSchema.parse(await relatorio(empresa));
      const [saidas, entradas] = [await somaDoBanco("saida", empresa), await somaDoBanco("entrada", empresa)];
      expect([r.saidas!.total, r.saidas!.quantidade], empresa ?? "todas").toEqual([saidas.total, saidas.quantidade]);
      expect([r.entradas!.total, r.entradas!.quantidade], empresa ?? "todas").toEqual([entradas.total, entradas.quantidade]);
      // Os grupos fecham com a seção, e as categorias com o grupo.
      for (const secao of [r.saidas!, r.entradas!]) {
        const somaDosGrupos = secao.grupos.reduce((t, g) => t.add(g.total), new Prisma.Decimal(0));
        expect(somaDosGrupos.toFixed(2)).toBe(secao.total);
        for (const g of secao.grupos) expect(g.categorias.reduce((t, c) => t.add(c.total), new Prisma.Decimal(0)).toFixed(2)).toBe(g.total);
      }
      expect(r.resultado).toBe(new Prisma.Decimal(r.entradas!.total).sub(r.saidas!.total).toFixed(2));
    }
  }, PRAZO_MS);

  it("soma pelo dia de Manaus e pelo valor liquidado; cancelado, em aberto e transferência ficam fora", async () => {
    const plugga = await relatorio("plugga");
    const impostos = grupo(plugga, "saidas", codigos.grupoImpostos, `${marca} Impostos`)!;
    // 100,00 no primeiro dia + 50,25 no último; o 28/02, o 01/04, a cancelada e a em aberto não entram.
    expect(impostos.categorias.map((c) => [c.codigo, c.total, c.quantidade])).toEqual([[codigos.iss, "150.25", 2], [codigos.inss, "200.00", 1]]);
    expect(impostos.total).toBe("350.25");
    const receitas = grupo(plugga, "entradas", codigos.grupoReceitas)!;
    expect(receitas.total).toBe("1000.00");
    // A transferência de 5.000,00 não aparece em nenhuma seção.
    const todas = await relatorio();
    const comCincoMil = [...todas.saidas!.grupos, ...todas.entradas!.grupos].flatMap((g) => g.categorias).filter((c) => c.total === "5000.00" && c.categorias.length === 0);
    expect(comCincoMil).toEqual([]);
    const waze = await relatorio("waze");
    // O recebido em parte entra pelo que entrou no caixa: 320,50 dos 500,00.
    expect(grupo(waze, "entradas", codigos.grupoReceitas)!.total).toBe("320.50");
  }, PRAZO_MS);

  it("com as duas empresas, a mesma categoria soma numa linha com os ids das duas; e a lista da linha fecha com ela", async () => {
    const r = await relatorio();
    const iss = grupo(r, "saidas", codigos.grupoImpostos)!.categorias.find((c) => c.codigo === codigos.iss)!;
    expect([iss.total, iss.quantidade, [...iss.categorias].sort()]).toEqual(["190.25", 3, [ids.issPlugga, ids.issWaze].sort()]);
    const { desde, antes } = periodoDoRelatorio(MARCO.de, MARCO.ate);
    const lista = await comoAdmin(() => lancamentos.liquidadosDoRelatorio({ desde, antes, tipo: "saida", categoria: iss.categorias }, papel, 500, AGORA));
    expect([lista.total, lista.soma]).toEqual([3, "190.25"]);
    expect(lista.itens.map((i) => [i.empresa, i.liquidadoEm, i.valorLiquidado])).toEqual([["plugga", "2031-03-01", "100.00"], ["waze", "2031-03-05", "40.00"], ["plugga", "2031-03-31", "50.25"]]);
    const receita = grupo(r, "entradas", codigos.grupoReceitas)!.categorias[0]!;
    const recebidas = await comoAdmin(() => lancamentos.liquidadosDoRelatorio({ desde, antes, tipo: "entrada", categoria: receita.categorias }, papel, 500, AGORA));
    expect([recebidas.soma, receita.total]).toEqual(["1320.50", "1320.50"]);
    expect(recebidas.itens.map((i) => [i.valor, i.valorLiquidado]).sort()).toEqual([["1000.00", "1000.00"], ["500.00", "320.50"]]);
  }, PRAZO_MS);

  it("a saída sem categoria fica em Sem categoria, e a lista dela traz só as sem categoria do período", async () => {
    const plugga = await relatorio("plugga");
    const sem = grupo(plugga, "saidas", null, "Sem categoria")!;
    expect(sem.categorias.map((c) => [c.chave, c.nome, c.categorias])).toEqual([["sem", "Sem categoria", []]]);
    expect(plugga.saidas!.grupos.at(-1)!.chave).toBe("sem");
    const { desde, antes } = periodoDoRelatorio(MARCO.de, MARCO.ate);
    const lista = await comoAdmin(() => lancamentos.liquidadosDoRelatorio({ empresa: "plugga", desde, antes, tipo: "saida", categoria: "sem" }, papel, 500, AGORA));
    expect(lista.soma).toBe(sem.total);
    expect(lista.itens.every((i) => i.categoria === null)).toBe(true);
    expect(lista.itens.some((i) => i.descricao === `${marca} saída 2031-03-10`)).toBe(true);
  }, PRAZO_MS);

  it("o último dia vale até o seu último microssegundo, e o dia seguinte não entra", async () => {
    const [linha] = await prisma.$queryRaw<{ liquidado: string }[]>`SELECT to_char(liquidado_em AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS.US') AS liquidado FROM public.lancamentos WHERE categoria_id = ${ids.taxaPlugga}::uuid AND valor = 0.75`;
    expect(linha?.liquidado).toBe("2031-04-01 03:59:59.999500");
    const plugga = await relatorio("plugga");
    const taxas = grupo(plugga, "saidas", codigos.grupoTaxas)!;
    expect([taxas.total, taxas.quantidade]).toEqual(["0.75", 1]);
    const { desde, antes } = periodoDoRelatorio(MARCO.de, MARCO.ate);
    const lista = await comoAdmin(() => lancamentos.liquidadosDoRelatorio({ empresa: "plugga", desde, antes, tipo: "saida", categoria: [ids.taxaPlugga] }, papel, 500, AGORA));
    expect([lista.total, lista.soma, lista.itens.map((i) => i.liquidadoEm)]).toEqual([1, "0.75", ["2031-03-31"]]);
  }, PRAZO_MS);

  it("o RLS recorta as somas: com Contas a pagar só as saídas; com só Relatórios, nada", async () => {
    const { desde, antes } = periodoDoRelatorio(MARCO.de, MARCO.ate);
    const filtro = { empresa: "plugga" as const, desde, antes, tipos: ["saida", "entrada"] as const };
    const doPagador = await comoRuntime("pagar", (tx) => somasPorCategoria(tx, filtro));
    expect(new Set(doPagador.map((l) => l.tipo))).toEqual(new Set(["saida"]));
    const issDoPagador = doPagador.find((l) => l.categoriaId === ids.issPlugga)!;
    expect([issDoPagador.total.toFixed(2), issDoPagador.codigo]).toEqual(["150.25", codigos.iss]);
    expect(await comoRuntime("relatorios", (tx) => somasPorCategoria(tx, filtro))).toEqual([]);
    // O papel da aplicação concorda: sem Contas a receber a seção vem nula, e o resultado também.
    const soPagar = await comoAdmin(() => relatorios.porCategoria({ ...MARCO, empresa: "plugga" }, papelNoFinanceiro({ plataforma: null, departamentos: [{ departamento: "financeiro", nivel: "membro", telas: ["financeiro.pagar", "financeiro.relatorios"] }] })));
    expect([soPagar.entradas, soPagar.resultado]).toEqual([null, null]);
    expect(soPagar.saidas).not.toBeNull();
  }, PRAZO_MS);
});
