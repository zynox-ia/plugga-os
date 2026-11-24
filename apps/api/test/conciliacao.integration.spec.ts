import { randomBytes, randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditAppender } from "../src/audit/audit-appender.js";
import { Conflito, EstadoInvalido } from "../src/common/errors/dominio.js";
import type { AuthPrincipal } from "../src/core/auth/auth.types.js";
import { conteudoDoMovimento, type ExtratoLido } from "../src/financeiro/extrato-ofx.js";
import { PrismaConciliacaoRepository, type ContaDoExtrato } from "../src/financeiro/prisma-conciliacao.repository.js";
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
  const mov = (id: string, dia: string, valor: string, descricao = `${marca} PIX ${id}`) =>
    ({ identificador: `${marca}-${id}`, conteudo: conteudoDoMovimento(dia, valor, descricao), dia, valor, descricao });

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
      const daMarca = { lancamento: { descricao: { startsWith: marca } } };
      await tx.historicoDeLancamento.deleteMany({ where: daMarca });
      await tx.lancamento.deleteMany({ where: { descricao: { startsWith: marca } } });
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
});
