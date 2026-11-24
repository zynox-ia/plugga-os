import { randomBytes, randomUUID } from "node:crypto";

import { listarLancamentosQuerySchema } from "@plugga/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditAppender } from "../src/audit/audit-appender.js";
import { AcessoNegado, Conflito, EstadoInvalido, RequisicaoInvalida } from "../src/common/errors/dominio.js";
import type { AuthPrincipal } from "../src/core/auth/auth.types.js";
import { ConciliacaoService } from "../src/financeiro/conciliacao.service.js";
import { ReflexosDoLancamento } from "../src/financeiro/reflexo-do-lancamento.js";
import { OmieReflexoDoLancamento } from "../src/omie/omie-reflexo.js";
import { conteudoDoMovimento, type ExtratoLido } from "../src/financeiro/extrato-ofx.js";
import { papelNoFinanceiro } from "../src/financeiro/financeiro.rules.js";
import { PrismaConciliacaoRepository, type ContaDoExtrato } from "../src/financeiro/prisma-conciliacao.repository.js";
import { PrismaFinanceiroRepository } from "../src/financeiro/prisma-financeiro.repository.js";
import { contextoBanco } from "../src/prisma/contexto-banco.js";
import { PrismaService } from "../src/prisma/prisma.service.js";

/**
 * A conciliação (PLU-339), C1, contra o Postgres: o extrato e os movimentos, sem duplicar
 * entre arquivos que se sobrepõem; o mesmo arquivo recusado; o período; o evento só com
 * contagens; e o RLS da tela Conciliação, sem UPDATE nem DELETE.
 *
 *     pnpm --filter @plugga/api test:financeiro
 */
const HABILITADO = process.env.RUN_FINANCEIRO_INTEGRATION_TESTS === "true";
const PRAZO_MS = 60_000;
const AGORA = new Date("2026-11-24T14:00:00Z");

describe.skipIf(!HABILITADO)("conciliação: extrato bancário no Postgres", () => {
  const prisma = new PrismaService();
  const repositorio = new PrismaConciliacaoRepository(prisma, new AuditAppender());
  const marca = `extr-${randomUUID().slice(0, 8)}`;
  const sessoes = { conciliacao: randomBytes(32).toString("hex"), pagar: randomBytes(32).toString("hex") };
  let principal: AuthPrincipal;
  let conta: ContaDoExtrato;
  const ids = { outraConta: "", fornecedor: "", cliente: "", despesa: "", receita: "" };
  /** Uma saída paga ou uma entrada recebida nesta conta (ou noutra), como dono do banco de teste. */
  const liquidado = async (tipo: "saida" | "entrada", dia: string, valor: string, contaId = conta.id) => (await prisma.lancamento.create({
    data: tipo === "saida"
      ? { tipo, companyId: "waze", fornecedorId: ids.fornecedor, categoriaId: ids.despesa, contaCorrenteId: contaId, descricao: `${marca} conta`, valor: Number(valor), vencimento: new Date(`${dia}T04:00:00Z`), etapa: "paga", origem: "avulsa", aprovadoEm: AGORA, forma: "pix", pagoEm: new Date(`${dia}T04:00:00Z`), pagamentoRegistradoEm: AGORA }
      : { tipo, companyId: "waze", clientId: ids.cliente, categoriaId: ids.receita, contaCorrenteId: contaId, descricao: `${marca} cobrança`, valor: Number(valor), vencimento: new Date(`${dia}T04:00:00Z`), competencia: "2026-12", etapa: "recebida", origem: "cobranca_manual", recebidoEm: new Date(`${dia}T04:00:00Z`), recebimentoRegistradoEm: AGORA, valorRecebido: Number(valor) },
    select: { id: true },
  })).id;
  const comoRuntime = <T>(quem: keyof typeof sessoes, fazer: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => Promise<T>) => prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL ROLE plugga_runtime");
    await tx.$executeRaw`SELECT set_config('plugga.session_hash', ${sessoes[quem]}, true)`;
    return fazer(tx);
  });
  const arquivo = (sha: string) => ({ chave: `financeiro/extratos/waze/${conta.id}/${randomUUID()}-e.ofx`, nome: `${marca}.ofx`, tamanho: 100, sha256: sha.padEnd(64, "0"), origem: "ofx" as const });
  const lido = (movimentos: ExtratoLido["movimentos"], saldo: ExtratoLido["saldo"] = null): ExtratoLido => ({
    conta: null, periodo: { de: movimentos.map((m) => m.dia).sort()[0]!, ate: movimentos.map((m) => m.dia).sort().at(-1)! }, saldo, movimentos,
  });
  const mov = (id: string, dia: string, valor: string, descricao = `${marca} PIX ${id}`, tipoNoBanco: string | null = null) =>
    ({ identificador: `${marca}-${id}`, conteudo: conteudoDoMovimento(dia, valor, descricao), dia, valor, descricao, tipoNoBanco });

  beforeAll(async () => {
    await prisma.$connect();
    for (const id of ["plugga", "waze"]) await prisma.company.upsert({ where: { id }, create: { id, name: id }, update: {} });
    for (const [quem, telas] of [["conciliacao", ["financeiro.conciliacao"]], ["pagar", ["financeiro.pagar"]]] as const) {
      const pessoa = await prisma.user.create({ data: { email: `${marca}-${quem}@teste.local`, name: `${marca} ${quem}` } });
      await prisma.userDepartamento.create({ data: { userId: pessoa.id, departamento: "financeiro", nivel: "membro", telas: [...telas] } });
      await prisma.session.create({ data: { userId: pessoa.id, tokenHash: sessoes[quem], expiresAt: new Date(Date.now() + 3_600_000), absoluteExpiresAt: new Date(Date.now() + 7_200_000) } });
      if (quem === "conciliacao") principal = { id: pessoa.id, kind: "user", acesso: { plataforma: null, departamentos: [] } } as AuthPrincipal;
    }
    const c = await prisma.contaCorrente.create({ data: { companyId: "waze", nome: `${marca} Banco A`, numero: "99999-9" } });
    conta = { id: c.id, companyId: "waze", nome: c.nome, numero: c.numero };
    const outra = await prisma.contaCorrente.create({ data: { companyId: "waze", nome: `${marca} Banco B` } });
    ids.outraConta = outra.id;
    ids.fornecedor = (await prisma.fornecedor.create({ data: { nome: `${marca} Fornecedor`, categoria: "servico" } })).id;
    ids.cliente = (await prisma.client.create({ data: { name: `${marca} Cliente` } })).id;
    const sufixo = String(parseInt(marca.slice(5), 16) % 100_000);
    ids.despesa = (await prisma.categoriaFinanceira.create({ data: { companyId: "waze", codigo: `9.11.${sufixo}`, nome: `${marca} despesa`, tipo: "despesa", natureza: "servico", grupoNome: "Teste" } })).id;
    ids.receita = (await prisma.categoriaFinanceira.create({ data: { companyId: "waze", codigo: `9.12.${sufixo}`, nome: `${marca} receita`, tipo: "receita", natureza: "receita", grupoNome: "Teste" } })).id;
  }, PRAZO_MS);

  afterAll(async () => {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL session_replication_role = replica");
      await tx.movimentoDoExtrato.deleteMany({ where: { contaCorrenteId: conta.id } });
      await tx.extratoBancario.deleteMany({ where: { contaCorrenteId: conta.id } });
      const daMarca = { lancamento: { OR: [{ descricao: { startsWith: marca } }, { contaCorrenteId: { in: [conta.id, ids.outraConta] } }] } };
      await tx.historicoDeLancamento.deleteMany({ where: daMarca });
      // Os pedidos ao OMIE da tarifa do teste do conector (sem os gatilhos, a FK não apaga em cascata).
      await tx.omieEnvio.deleteMany({ where: daMarca });
      await tx.omieLancamento.deleteMany({ where: daMarca });
      // As tarifas do lote têm a descrição padrão: saem pela conta.
      await tx.lancamento.deleteMany({ where: { OR: [{ descricao: { startsWith: marca } }, { contaCorrenteId: { in: [conta.id, ids.outraConta] } }] } });
      await tx.categoriaFinanceira.deleteMany({ where: { nome: { startsWith: marca } } });
      await tx.fornecedor.deleteMany({ where: { nome: { startsWith: marca } } });
      await tx.client.deleteMany({ where: { name: { startsWith: marca } } });
    });
    await prisma.contaCorrente.deleteMany({ where: { nome: { startsWith: marca } } });
    await prisma.session.deleteMany({ where: { tokenHash: { in: Object.values(sessoes) } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: marca } } });
    await prisma.$disconnect();
  }, PRAZO_MS);

  it("importa o extrato; o que se sobrepõe a um arquivo anterior conta como repetido, e o mesmo arquivo é recusado", async () => {
    const primeiro = await repositorio.importar(conta, arquivo("a1"), lido([mov("1", "2026-11-10", "-100.00"), mov("2", "2026-11-12", "250.50")], { valor: "1500.00", em: "2026-11-12" }), principal, AGORA);
    expect(primeiro).toMatchObject({ movimentos: 2, novos: 2, repetidos: 0, saldoInformado: { valor: "1500.00", em: "2026-11-12" }, periodo: { de: "2026-11-10", ate: "2026-11-12" } });

    // O segundo arquivo repete o movimento 2 e traz o 3; e um FITID repetido no próprio arquivo só entra uma vez.
    const segundo = await repositorio.importar(conta, arquivo("b2"), lido([mov("2", "2026-11-12", "250.50"), mov("3", "2026-11-15", "-35.90"), mov("3", "2026-11-15", "-35.90")]), principal, AGORA);
    expect(segundo).toMatchObject({ movimentos: 3, novos: 1, repetidos: 2 });
    expect(await prisma.movimentoDoExtrato.count({ where: { contaCorrenteId: conta.id } })).toBe(3);

    await expect(repositorio.importar(conta, arquivo("a1"), lido([mov("9", "2026-11-20", "1.00")]), principal, AGORA)).rejects.toBeInstanceOf(Conflito);

    // O evento leva só contagens: nada da descrição do extrato.
    const eventos = await prisma.eventLog.findMany({ where: { eventName: "financeiro.extrato.importado", entityId: primeiro.id }, select: { payload: true } });
    expect(eventos).toEqual([{ payload: { origem: "ofx", movimentos: 2, novos: 2 } }]);
    expect(JSON.stringify(eventos)).not.toContain(marca);
  }, PRAZO_MS);

  it("FITID repetido com outro conteúdo entra (no arquivo e contra o que já entrou); com o mesmo conteúdo é repetido", async () => {
    // No mesmo arquivo: o banco repetiu o FITID 7 para dois movimentos diferentes.
    const r = await repositorio.importar(conta, arquivo("d4"), lido([mov("7", "2026-11-25", "-10.00"), mov("7", "2026-11-25", "-15.00")]), principal, AGORA);
    expect(r).toMatchObject({ movimentos: 2, novos: 2, repetidos: 0 });
    // Contra o que já entrou: o FITID 1 de antes, agora com outro valor, entra; igual, é repetido.
    const s2 = await repositorio.importar(conta, arquivo("e5"), lido([mov("1", "2026-11-10", "-100.00"), mov("1", "2026-11-26", "-99.00")]), principal, AGORA);
    expect(s2).toMatchObject({ movimentos: 2, novos: 1, repetidos: 1 });
    const comFitid = await prisma.movimentoDoExtrato.findMany({ where: { contaCorrenteId: conta.id, identificador: { startsWith: `${marca}-` } }, select: { identificador: true, valor: true } });
    expect(comFitid.filter((m) => m.identificador.startsWith(`${marca}-7`)).map((m) => m.valor.toFixed(2)).sort()).toEqual(["-10.00", "-15.00"]);
    expect(comFitid.filter((m) => m.identificador.startsWith(`${marca}-1`)).map((m) => m.valor.toFixed(2)).sort()).toEqual(["-100.00", "-99.00"]);
  }, PRAZO_MS);

  it("lista os movimentos do período, do mais recente para o mais antigo, com os arquivos que tocam o período", async () => {
    const lista = await repositorio.listar({ contaCorrenteId: conta.id, de: "2026-11-11", ate: "2026-11-30" });
    expect(lista.itens.map((m) => [m.dia, m.valor])).toEqual([
      ["2026-11-26", "-99.00"], ["2026-11-25", expect.any(String)], ["2026-11-25", expect.any(String)], ["2026-11-15", "-35.90"], ["2026-11-12", "250.50"],
    ]);
    expect(lista.itens.every((m) => m.estado === "pendente")).toBe(true);
    expect(lista.extratos.length).toBeGreaterThanOrEqual(3);
    expect((await repositorio.listar({ contaCorrenteId: conta.id, de: "2026-12-01", ate: "2026-12-31" })).itens).toEqual([]);
  }, PRAZO_MS);

  it("RLS: a tela Conciliação lê e importa; Contas a pagar não vê nada; ninguém altera nem apaga; a chave do arquivo é da empresa", async () => {
    expect(await comoRuntime("conciliacao", (tx) => tx.movimentoDoExtrato.count({ where: { contaCorrenteId: conta.id } }))).toBe(6);
    expect(await comoRuntime("pagar", (tx) => tx.movimentoDoExtrato.count({ where: { contaCorrenteId: conta.id } }))).toBe(0);
    expect(await comoRuntime("pagar", (tx) => tx.extratoBancario.count({ where: { contaCorrenteId: conta.id } }))).toBe(0);

    const novo = (quem: keyof typeof sessoes, chave: string, sha: string) => comoRuntime(quem, (tx) => tx.extratoBancario.create({
      data: {
        companyId: "waze", contaCorrenteId: conta.id, origem: "ofx", arquivoChave: chave, arquivoNome: "e.ofx", arquivoTamanho: 1, arquivoSha256: sha.padEnd(64, "0"),
        periodoDe: AGORA, periodoAte: AGORA, movimentos: 0, novos: 0,
      },
    }));
    await expect(novo("pagar", `financeiro/extratos/waze/${conta.id}/x`, "c3")).rejects.toThrow(/row-level security/);
    await novo("conciliacao", `financeiro/extratos/waze/${conta.id}/x`, "c4");
    await expect(novo("conciliacao", `financeiro/extratos/plugga/${conta.id}/x`, "c5")).rejects.toThrow(/extratos_bancarios_chave_da_empresa/);
    for (const sql of [
      // O estado e o par a C3 permite à Conciliação (com as CHECKs); o resto da linha, não.
      `UPDATE public.movimentos_do_extrato SET valor = 1 WHERE conta_corrente_id = '${conta.id}'`,
      `UPDATE public.extratos_bancarios SET arquivo_nome = 'x' WHERE conta_corrente_id = '${conta.id}'`,
      `DELETE FROM public.movimentos_do_extrato WHERE conta_corrente_id = '${conta.id}'`,
      `DELETE FROM public.extratos_bancarios WHERE conta_corrente_id = '${conta.id}'`,
    ]) {
      await expect(comoRuntime("conciliacao", (tx) => tx.$executeRawUnsafe(sql)), sql).rejects.toThrow(/permission denied/);
    }
  }, PRAZO_MS);

  it("C3: o painel sugere, aponta valor diferente e o sem par; conciliar exige o mesmo valor; a corrida diz quem chegou antes", async () => {
    const pago = await liquidado("saida", "2026-12-03", "1742.18");
    const recebido = await liquidado("entrada", "2026-12-05", "7200.00");
    const comDiferenca = await liquidado("saida", "2026-12-08", "700.00");
    // Longe (mais de 3 dias) dos outros: senão o par do valor diferente fica ambíguo e não é apontado.
    const semExtrato = await liquidado("saida", "2026-12-25", "50.00");
    await liquidado("saida", "2026-12-03", "1742.18", ids.outraConta);
    await repositorio.importar(conta, arquivo("f6"), lido([
      mov("p1", "2026-12-04", "-1742.18"), mov("r1", "2026-12-05", "7200.00"), mov("d1", "2026-12-08", "-680.00"), mov("t1", "2026-12-18", "-89.90"),
    ]), principal, AGORA);
    const escopo = { contaCorrenteId: conta.id, de: "2026-12-01", ate: "2026-12-31" };
    // Com a sessão de quem concilia: o nome do cliente vem pela função do banco, que confere a tela.
    const painel = await contextoBanco.run({ sessionHash: sessoes.conciliacao, agentHash: undefined }, () => repositorio.painel(escopo));
    expect(painel.sugeridos.map((p) => p.lancamento.id).sort()).toEqual([pago, recebido].sort());
    expect(painel.valorDiferente.map((p) => [p.lancamento.id, p.diferenca])).toEqual([[comDiferenca, "20.00"]]);
    expect(painel.semLancamento.map((m) => m.valor)).toEqual(["-89.90"]);
    expect(painel.semExtrato.map((l) => l.id)).toEqual([semExtrato]);
    // Sem candidato de nenhum lado: nem a tarifa nem o pago do dia 25 têm par possível.
    expect(painel.semLancamento.map((m) => m.candidatos)).toEqual([[]]);
    expect(painel.semExtrato.map((l) => l.candidatos)).toEqual([[]]);
    expect(painel.sugeridos.find((p) => p.lancamento.id === recebido)?.lancamento).toMatchObject({ favorecido: `${marca} Cliente`, valor: "7200.00", empresa: "waze" });
    expect(painel.resumo).toEqual({ movimentos: 4, conciliados: 0, sugeridos: 2, valorDiferente: 1, semLancamento: 1, semExtrato: 1, faltaConciliar: "9762.08" });
    // Todas as contas da empresa: o pago da outra conta aparece sem extrato, e não vira par.
    const daEmpresa = await repositorio.painel({ empresa: "waze", de: "2026-12-01", ate: "2026-12-31" });
    expect(daEmpresa.sugeridos.map((p) => p.lancamento.id).sort()).toEqual([pago, recebido].sort());

    const movDiferente = painel.valorDiferente[0]!.movimento.id;
    await expect(repositorio.conciliar(movDiferente, comDiferenca, principal, AGORA)).rejects.toMatchObject({ message: "Para conciliar, o valor tem de ser igual: extrato R$ 680,00, lançamento R$ 700,00." });

    const parPago = painel.sugeridos.find((p) => p.lancamento.id === pago)!;
    await repositorio.conciliar(parPago.movimento.id, pago, principal, AGORA);
    expect(await prisma.lancamento.findUniqueOrThrow({ where: { id: pago }, select: { etapa: true, conciliadoPorId: true } })).toEqual({ etapa: "conciliada", conciliadoPorId: principal.id });
    await expect(repositorio.conciliar(parPago.movimento.id, pago, principal, AGORA)).rejects.toMatchObject({ message: `Esta linha já foi conciliada por ${marca} conciliacao.` });
    expect(await prisma.eventLog.count({ where: { eventName: "financeiro.lancamento.conciliado", entityId: pago } })).toBe(1);

    // O lote concilia o que sobrou de sugerido (recalculado na API).
    expect(await repositorio.conciliarSugeridos(escopo, principal, AGORA)).toBe(1);
    const depois = await repositorio.painel(escopo);
    expect(depois.resumo).toMatchObject({ conciliados: 2, sugeridos: 0 });
    expect(depois.conciliados.find((p) => p.lancamento.id === pago)?.conciliadoPor?.nome).toBe(`${marca} conciliacao`);
  }, PRAZO_MS);

  it("C3: desfazer volta o lançamento a pago, com o motivo na linha do tempo; marcar pendente dos dois lados", async () => {
    const escopo = { contaCorrenteId: conta.id, de: "2026-12-01", ate: "2026-12-31" };
    const par = (await repositorio.painel(escopo)).conciliados.find((p) => p.lancamento.tipo === "saida")!;
    await repositorio.desfazer(par.movimento.id, "Pareado com a conta errada", principal, AGORA);
    expect(await prisma.lancamento.findUniqueOrThrow({ where: { id: par.lancamento.id }, select: { etapa: true, conciliadoEm: true } })).toEqual({ etapa: "paga", conciliadoEm: null });
    expect(await prisma.movimentoDoExtrato.findUniqueOrThrow({ where: { id: par.movimento.id }, select: { estado: true, lancamentoId: true } })).toEqual({ estado: "pendente", lancamentoId: null });
    expect(await prisma.historicoDeLancamento.findFirst({ where: { lancamentoId: par.lancamento.id, tipo: "conciliado" }, select: { dados: true, texto: true } }))
      .toEqual({ dados: { acao: "desfeito" }, texto: "Pareado com a conta errada" });

    // Marcado dos dois lados: não volta a ser sugerido.
    await repositorio.marcar({ lancamentoId: par.lancamento.id }, true);
    expect((await repositorio.painel(escopo)).sugeridos.map((p) => p.lancamento.id)).not.toContain(par.lancamento.id);
    await repositorio.marcar({ lancamentoId: par.lancamento.id }, false);
    await repositorio.marcar({ movimentoId: par.movimento.id }, true);
    const marcado = await repositorio.painel(escopo);
    expect(marcado.semLancamento.find((m) => m.id === par.movimento.id)?.estado).toBe("marcado");
    expect(marcado.sugeridos.map((p) => p.movimento.id)).not.toContain(par.movimento.id);
    await expect(repositorio.marcar({ movimentoId: marcado.conciliados[0]!.movimento.id }, true)).rejects.toBeInstanceOf(EstadoInvalido);
  }, PRAZO_MS);

  it("C3 no banco: a conciliação aponta só para lançamento da mesma conta, a etapa e as colunas andam juntas, e só a Conciliação concilia", async () => {
    const daOutra = await liquidado("saida", "2026-12-20", "10.00", ids.outraConta);
    const [linha] = await prisma.movimentoDoExtrato.findMany({ where: { contaCorrenteId: conta.id, estado: { not: "conciliado" } }, take: 1, select: { id: true } });
    await expect(prisma.movimentoDoExtrato.update({ where: { id: linha!.id }, data: { estado: "conciliado", lancamentoId: daOutra, conciliadoEm: AGORA } }))
      .rejects.toThrow(/movimentos_do_extrato_lancamento_da_conta_fkey|Foreign key/i);
    await expect(prisma.lancamento.update({ where: { id: daOutra }, data: { etapa: "conciliada" } })).rejects.toThrow(/lancamentos_conciliacao_coerente/);
    expect(await comoRuntime("pagar", (tx) => tx.movimentoDoExtrato.updateMany({ where: { id: linha!.id }, data: { estado: "marcado" } }))).toEqual({ count: 0 });
    expect(await comoRuntime("conciliacao", (tx) => tx.movimentoDoExtrato.updateMany({ where: { id: linha!.id }, data: { estado: "marcado" } }))).toEqual({ count: 1 });
    await expect(comoRuntime("conciliacao", (tx) => tx.$executeRaw`UPDATE public.movimentos_do_extrato SET valor = 1 WHERE id = ${linha!.id}::uuid`)).rejects.toThrow(/permission denied/);
  }, PRAZO_MS);

  it("C4: o saldo da conta é o saldo inicial (o fim do dia dele) mais todo o liquidado depois; o conciliado é o segundo número", async () => {
    const financeiro = new PrismaFinanceiroRepository(prisma, new AuditAppender());
    const saldoDaConta = async () => {
      const c = (await financeiro.opcoes(papelNoFinanceiro({ plataforma: "admin", departamentos: [] }))).contasCorrentes.find((x) => x.id === conta.id);
      return [c?.saldoCalculado, c?.saldoConciliado];
    };
    expect(await saldoDaConta()).toEqual([null, null]);
    // Depois dos testes da C3, na conta: pagos 1.742,18 (03/12, desfeita a conciliação), 700,00 (08/12) e 50,00 (25/12);
    // recebido 7.200,00 (05/12, conciliado). O pago e não conciliado já desconta do saldo.
    await prisma.contaCorrente.update({ where: { id: conta.id }, data: { saldoInicial: 1000, saldoInicialEm: new Date("2026-11-30T04:00:00Z") } });
    expect(await saldoDaConta()).toEqual(["5707.82", "8200.00"]);
    // O liquidado até o dia do saldo inicial já está nele: não conta de novo.
    await prisma.contaCorrente.update({ where: { id: conta.id }, data: { saldoInicial: -50, saldoInicialEm: new Date("2026-12-05T04:00:00Z") } });
    expect(await saldoDaConta()).toEqual(["-800.00", "-50.00"]);
    // Quem só alcança um tipo não vê o saldo: pelo RLS, ele seria parcial.
    const soPagar = papelNoFinanceiro({ plataforma: null, departamentos: [{ departamento: "financeiro", nivel: "membro", telas: ["financeiro.pagar"] }] });
    expect((await financeiro.opcoes(soPagar)).contasCorrentes.find((x) => x.id === conta.id)).toMatchObject({ saldoCalculado: null, saldoConciliado: null });
    // No resumo, a conta entra na soma do saldo nas contas.
    const resumo = await financeiro.resumo(papelNoFinanceiro({ plataforma: "admin", departamentos: [] }), "waze", AGORA);
    expect(resumo.saldoProjetado?.saldoNasContas).not.toBeNull();
    expect(resumo.saldoProjetado?.contasSemSaldoInicial).toEqual(expect.any(Number));
  }, PRAZO_MS);

  // ------------------------------------------------------------ C5: o que nasce na Conciliação
  // Só na Waze (o teste de cadastros, em paralelo, marca a categoria de tarifas da Plugga) e em
  // janeiro de 2027, depois do saldo da C4, para não mexer nos números dela.

  const naSessao = <T>(fazer: () => Promise<T>) => contextoBanco.run({ sessionHash: sessoes.conciliacao, agentHash: undefined }, fazer);
  const linhaDe = async (identificador: string) => prisma.movimentoDoExtrato.findFirstOrThrow({ where: { contaCorrenteId: conta.id, identificador: `${marca}-${identificador}` } });
  const semMarcaDeTarifas = () => prisma.categoriaFinanceira.updateMany({ where: { companyId: "waze", tarifaBancaria: true }, data: { tarifaBancaria: false } });

  it("C5: a linha que parece tarifa (pelo tipo do OFX ou pela descrição) vem marcada no painel e na lista", async () => {
    await repositorio.importar(conta, arquivo("c5a"), lido([
      mov("c5t1", "2027-01-05", "-12.90", `${marca} DEBITO PACOTE`, "FEE"),
      mov("c5t2", "2027-01-06", "-3.50", `${marca} TAR PIX ENVIADO`, "DEBIT"),
      mov("c5t3", "2027-01-07", "-4.00", `${marca} TARIFA DOC`),
      mov("c5p1", "2027-01-08", "-250.00", `${marca} PAG BOLETO`, "DEBIT"),
      mov("c5c1", "2027-01-09", "900.00", `${marca} PIX RECEBIDO`, "CREDIT"),
      mov("c5d1", "2027-01-10", "-80.00", `${marca} PIX ENVIADO`, "DEBIT"),
      mov("c5t4", "2027-01-11", "-7.00", `${marca} TARIFA AVULSA`, "FEE"),
      mov("c5c2", "2027-01-12", "300.00", `${marca} TED RECEBIDA`, "CREDIT"),
    ]), principal, AGORA);
    expect((await linhaDe("c5t1")).tipoNoBanco).toBe("FEE");
    const painel = await naSessao(() => repositorio.painel({ contaCorrenteId: conta.id, de: "2027-01-01", ate: "2027-01-31" }));
    const parece = Object.fromEntries(painel.semLancamento.map((m) => [m.descricao.replace(`${marca} `, ""), m.pareceTarifa]));
    expect(parece).toEqual({ "DEBITO PACOTE": true, "TAR PIX ENVIADO": true, "TARIFA DOC": true, "PAG BOLETO": false, "PIX RECEBIDO": false, "PIX ENVIADO": false, "TARIFA AVULSA": true, "TED RECEBIDA": false });
  }, PRAZO_MS);

  it("C5: Criar tarifa sem a categoria de tarifas pede a categoria; criada, nasce paga e conciliada, sem aprovação, e a próxima já vem sugerida", async () => {
    await semMarcaDeTarifas();
    const t1 = await linhaDe("c5t1");
    expect(await naSessao(() => repositorio.sugestaoDaTarifa(t1.id))).toMatchObject({ movimento: { id: t1.id, pareceTarifa: true }, categoria: null, fornecedor: null });
    // Sem a categoria marcada, nada nasce "para classificar".
    await expect(naSessao(() => repositorio.criarTarifa({ movimentoId: t1.id, fornecedorId: ids.fornecedor }, principal, AGORA)))
      .rejects.toMatchObject({ message: expect.stringMatching(/Escolha a categoria da tarifa/) });
    await expect(naSessao(() => repositorio.criarTarifa({ movimentoId: t1.id, fornecedorId: ids.fornecedor, categoriaId: ids.receita }, principal, AGORA))).rejects.toBeInstanceOf(RequisicaoInvalida);

    const criada = await naSessao(() => repositorio.criarTarifa({ movimentoId: t1.id, fornecedorId: ids.fornecedor, categoriaId: ids.despesa, descricao: `${marca} tarifa pacote` }, principal, AGORA));
    expect(criada).toMatchObject({ conciliado: true, lancamento: { codigo: expect.stringMatching(/^CP-\d{4,}$/) } });
    const l = await prisma.lancamento.findUniqueOrThrow({ where: { id: criada.lancamento.id } });
    expect(l).toMatchObject({ tipo: "saida", origem: "tarifa_bancaria", etapa: "conciliada", aprovadoEm: null, forma: "debito_automatico", categoriaId: ids.despesa, contaCorrenteId: conta.id, companyId: "waze" });
    expect(l.valor.toFixed(2)).toBe("12.90");
    expect(l.pagoEm?.toISOString()).toBe("2027-01-05T04:00:00.000Z");
    expect(await linhaDe("c5t1")).toMatchObject({ estado: "conciliado", lancamentoId: l.id });
    const eventos = await prisma.eventLog.findMany({ where: { entityId: l.id }, orderBy: { occurredAt: "asc" }, select: { eventName: true, payload: true } });
    expect(eventos.map((e) => e.eventName)).toEqual(["financeiro.lancamento.created", "financeiro.lancamento.pago", "financeiro.lancamento.conciliado"]);
    expect(eventos[0]!.payload).toEqual({ tipo: "saida", origem: "tarifa_bancaria" });

    // Com a categoria marcada, a sugestão traz a categoria e o fornecedor da última tarifa da conta; outra categoria é recusada.
    await prisma.categoriaFinanceira.update({ where: { id: ids.despesa }, data: { tarifaBancaria: true } });
    const t2 = await linhaDe("c5t2");
    expect(await naSessao(() => repositorio.sugestaoDaTarifa(t2.id))).toMatchObject({ categoria: { id: ids.despesa }, fornecedor: { id: ids.fornecedor } });
    const outra = await prisma.categoriaFinanceira.create({ data: { companyId: "waze", codigo: `9.13.${String(parseInt(marca.slice(5), 16) % 100_000)}`, nome: `${marca} outra`, tipo: "despesa", natureza: "servico", grupoNome: "Teste" } });
    await expect(naSessao(() => repositorio.criarTarifa({ movimentoId: t2.id, fornecedorId: ids.fornecedor, categoriaId: outra.id }, principal, AGORA)))
      .rejects.toMatchObject({ message: expect.stringMatching(/Configurações › Categorias/) });

    // A linha já conciliada diz por quem; crédito não vira tarifa.
    await expect(naSessao(() => repositorio.criarTarifa({ movimentoId: t1.id, fornecedorId: ids.fornecedor }, principal, AGORA)))
      .rejects.toMatchObject({ message: `Esta linha já foi conciliada por ${marca} conciliacao.` });
    const c1 = await linhaDe("c5c1");
    await expect(naSessao(() => repositorio.criarTarifa({ movimentoId: c1.id, fornecedorId: ids.fornecedor }, principal, AGORA))).rejects.toBeInstanceOf(EstadoInvalido);

    // A marca consultável: a lista filtra a saída paga sem aprovação.
    const financeiro = new PrismaFinanceiroRepository(prisma, new AuditAppender());
    const admin = papelNoFinanceiro({ plataforma: "admin", departamentos: [] });
    const semAprovacao = await financeiro.listar(listarLancamentosQuerySchema.parse({ busca: `${marca} tarifa`, pagoSemAprovacao: "true" }), admin, AGORA);
    expect(semAprovacao.itens.map((i) => [i.id, i.pagoSemAprovacao, i.origem.tipo])).toEqual([[l.id, true, "tarifa_bancaria"]]);
    expect((await financeiro.listar(listarLancamentosQuerySchema.parse({ busca: `${marca} tarifa`, pagoSemAprovacao: "false" }), admin, AGORA)).itens).toEqual([]);
  }, PRAZO_MS);

  it("C5: as tarifas em lote, uma transação por linha: a que falha vai em recusadas e as outras ficam", async () => {
    const [t2, t3, c1] = [await linhaDe("c5t2"), await linhaDe("c5t3"), await linhaDe("c5c1")];
    const r = await naSessao(() => repositorio.criarTarifas([t2.id, c1.id, t3.id], {}, principal, AGORA));
    expect(r).toEqual({ criadas: 2, recusadas: [{ movimentoId: c1.id, mensagem: "A tarifa vem de uma linha de débito do extrato." }] });
    for (const t of [t2, t3]) {
      const linha = await prisma.movimentoDoExtrato.findUniqueOrThrow({ where: { id: t.id }, include: { lancamento: true } });
      expect(linha.lancamento).toMatchObject({ origem: "tarifa_bancaria", etapa: "conciliada", categoriaId: ids.despesa, fornecedorId: ids.fornecedor, descricao: "Tarifa bancária" });
    }
    // De novo: as duas já foram.
    expect((await naSessao(() => repositorio.criarTarifas([t2.id], {}, principal, AGORA))).recusadas[0]!.mensagem).toMatch(/já foi conciliada/);
  }, PRAZO_MS);

  it("C5: a criação guiada: a despesa paga é da gerência; com o valor da linha concilia, com outro só sem conciliar; a receita nasce recebida no mês do crédito", async () => {
    const servico = new ConciliacaoService(repositorio, {} as never, () => AGORA);
    const [p1, c1, d1, c5c2] = [await linhaDe("c5p1"), await linhaDe("c5c1"), await linhaDe("c5d1"), await linhaDe("c5c2")];
    const saida = { tipo: "saida" as const, movimentoId: p1.id, fornecedorId: ids.fornecedor, descricao: `${marca} boleto guiado`, conciliar: true };
    await expect(naSessao(() => servico.criarLancamento(saida, principal))).rejects.toBeInstanceOf(AcessoNegado);
    const gerente = { ...principal, acesso: { plataforma: null, departamentos: [{ departamento: "financeiro", nivel: "gerente", telas: ["financeiro.conciliacao"] }] } } as AuthPrincipal;

    // Outro valor com conciliar: 409 com a mensagem pronta; sem conciliar, nasce pago e a linha fica sem par.
    await expect(naSessao(() => servico.criarLancamento({ ...saida, valor: "245.00" }, gerente))).rejects.toMatchObject({ message: "O valor é diferente do da linha do extrato (R$ 250,00): use o valor da linha, ou crie sem conciliar." });
    const solto = await naSessao(() => servico.criarLancamento({ ...saida, movimentoId: d1.id, valor: "75.00", conciliar: false, descricao: `${marca} pix guiado` }, gerente));
    expect(solto.conciliado).toBe(false);
    expect(await prisma.lancamento.findUniqueOrThrow({ where: { id: solto.lancamento.id } })).toMatchObject({ etapa: "paga", origem: "conciliacao", aprovadoEm: null, categoriaId: null });
    expect((await linhaDe("c5d1")).estado).toBe("pendente");
    const painel = await naSessao(() => repositorio.painel({ contaCorrenteId: conta.id, de: "2027-01-01", ate: "2027-01-31" }));
    expect(painel.semExtrato.map((l) => l.id)).toContain(solto.lancamento.id);

    const paga = await naSessao(() => servico.criarLancamento({ ...saida, categoriaId: ids.despesa, forma: "boleto" }, gerente));
    expect(paga.conciliado).toBe(true);
    expect(await prisma.lancamento.findUniqueOrThrow({ where: { id: paga.lancamento.id } })).toMatchObject({ etapa: "conciliada", origem: "conciliacao", forma: "boleto" });
    // O sentido da linha manda: débito não vira receita.
    await expect(naSessao(() => servico.criarLancamento({ tipo: "entrada", movimentoId: p1.id, clienteId: ids.cliente, categoriaId: ids.receita, descricao: `${marca} x`, conciliar: true }, principal))).rejects.toBeInstanceOf(EstadoInvalido);

    // A receita, por quem tem a tela: recebida no dia do crédito, competência do mês dele, conciliada.
    const receita = await naSessao(() => servico.criarLancamento({ tipo: "entrada", movimentoId: c1.id, clienteId: ids.cliente, categoriaId: ids.receita, descricao: `${marca} receita guiada`, conciliar: true }, principal));
    const r = await prisma.lancamento.findUniqueOrThrow({ where: { id: receita.lancamento.id } });
    expect(r).toMatchObject({ tipo: "entrada", origem: "conciliacao", etapa: "conciliada", competencia: "2027-01", clientId: ids.cliente });
    expect([r.valorRecebido?.toFixed(2), r.recebidoEm?.toISOString()]).toEqual(["900.00", "2027-01-09T04:00:00.000Z"]);
    expect(receita.lancamento.codigo).toMatch(/^CR-/);

    // Outra linha do mesmo cliente no mesmo mês: a cobrança da competência já existe; 409 com ela, para conciliar a linha com a existente.
    await expect(naSessao(() => servico.criarLancamento({ tipo: "entrada", movimentoId: (c5c2.id), clienteId: ids.cliente, categoriaId: ids.receita, descricao: `${marca} segunda`, valor: "300.00", conciliar: true }, principal)))
      .rejects.toMatchObject({
        constructor: Conflito,
        message: `Já existe a cobrança ${receita.lancamento.codigo} deste cliente em 01/2027: concilie a linha com ela (ou registre o recebimento nela).`,
        extras: { existente: { id: receita.lancamento.id, codigo: receita.lancamento.codigo } },
      });
    expect((await linhaDe("c5c2")).estado).toBe("pendente");
  }, PRAZO_MS);

  it("C5 no conector: a tarifa com a empresa conectada pede ao OMIE o título e a baixa, nessa ordem, na transação da criação", async () => {
    const reflexos = new ReflexosDoLancamento();
    reflexos.inscrever(new OmieReflexoDoLancamento(async () => true));
    const comOmie = new PrismaConciliacaoRepository(prisma, new AuditAppender(), reflexos);
    const t4 = await linhaDe("c5t4");
    const criada = await naSessao(() => comOmie.criarTarifa({ movimentoId: t4.id, fornecedorId: ids.fornecedor, descricao: `${marca} tarifa com omie` }, principal, AGORA));
    const envios = await prisma.omieEnvio.findMany({ where: { lancamentoId: criada.lancamento.id }, orderBy: { ordem: "asc" }, select: { operacao: true, estado: true } });
    expect(envios).toEqual([{ operacao: "upsert", estado: "pendente" }, { operacao: "baixa", estado: "pendente" }]);
  }, PRAZO_MS);

  it("C5 no banco: só a tela Conciliação cria o que nasce pago nela, a despesa guiada só com a gerência, e as CHECKs seguram a origem", async () => {
    const base = { companyId: "waze", fornecedorId: ids.fornecedor, contaCorrenteId: conta.id, descricao: `${marca} rls`, valor: 1, vencimento: AGORA, tipo: "saida" as const, etapa: "paga" as const, pagoEm: AGORA, pagamentoRegistradoEm: AGORA };
    const desfeito = new Error("desfeito");
    const tentar = (quem: keyof typeof sessoes, data: Parameters<typeof prisma.lancamento.create>[0]["data"]) =>
      comoRuntime(quem, async (tx) => { await tx.lancamento.create({ data, select: { id: true } }); throw desfeito; });
    // A tarifa: quem tem a Conciliação cria; quem só tem Contas a pagar não cria, nem pela política dele.
    await expect(tentar("conciliacao", { ...base, origem: "tarifa_bancaria" })).rejects.toBe(desfeito);
    await expect(tentar("pagar", { ...base, origem: "tarifa_bancaria" })).rejects.toThrow(/row-level security/);
    await expect(tentar("pagar", { ...base, origem: "conciliacao" })).rejects.toThrow(/row-level security/);
    // A despesa guiada pede a gerência; o membro da Conciliação não cria.
    await expect(tentar("conciliacao", { ...base, origem: "conciliacao" })).rejects.toThrow(/row-level security/);
    // As CHECKs: a avulsa paga continua pedindo a aprovação; o que nasce na Conciliação nasce liquidado; tarifa é saída.
    await expect(prisma.lancamento.create({ data: { ...base, origem: "avulsa" } })).rejects.toThrow(/lancamentos_aprovacao_coerente/);
    await expect(prisma.lancamento.create({ data: { ...base, origem: "conciliacao", etapa: "aberta", pagoEm: null, pagamentoRegistradoEm: null } })).rejects.toThrow(/lancamentos_nasce_liquidado/);
    await expect(prisma.lancamento.create({ data: { ...base, tipo: "entrada", fornecedorId: null, clientId: ids.cliente, categoriaId: ids.receita, competencia: "2027-01", etapa: "recebida", pagoEm: null, pagamentoRegistradoEm: null, recebidoEm: AGORA, recebimentoRegistradoEm: AGORA, valorRecebido: 1, origem: "tarifa_bancaria" } })).rejects.toThrow(/lancamentos_tarifa_e_saida/);
  }, PRAZO_MS);
});
