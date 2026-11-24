import { randomBytes, randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditAppender } from "../src/audit/audit-appender.js";
import { Conflito } from "../src/common/errors/dominio.js";
import type { AuthPrincipal } from "../src/core/auth/auth.types.js";
import type { ExtratoLido } from "../src/financeiro/extrato-ofx.js";
import { PrismaConciliacaoRepository, type ContaDoExtrato } from "../src/financeiro/prisma-conciliacao.repository.js";
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
  const comoRuntime = <T>(quem: keyof typeof sessoes, fazer: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => Promise<T>) => prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL ROLE plugga_runtime");
    await tx.$executeRaw`SELECT set_config('plugga.session_hash', ${sessoes[quem]}, true)`;
    return fazer(tx);
  });
  const arquivo = (sha: string) => ({ chave: `financeiro/extratos/waze/${conta.id}/${randomUUID()}-e.ofx`, nome: `${marca}.ofx`, tamanho: 100, sha256: sha.padEnd(64, "0"), origem: "ofx" as const });
  const lido = (movimentos: ExtratoLido["movimentos"], saldo: ExtratoLido["saldo"] = null): ExtratoLido => ({
    conta: null, periodo: { de: movimentos.map((m) => m.dia).sort()[0]!, ate: movimentos.map((m) => m.dia).sort().at(-1)! }, saldo, movimentos,
  });
  const mov = (id: string, dia: string, valor: string) => ({ identificador: `${marca}-${id}`, dia, valor, descricao: `${marca} PIX ${id}` });

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
  }, PRAZO_MS);

  afterAll(async () => {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL session_replication_role = replica");
      await tx.movimentoDoExtrato.deleteMany({ where: { contaCorrenteId: conta.id } });
      await tx.extratoBancario.deleteMany({ where: { contaCorrenteId: conta.id } });
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

  it("lista os movimentos do período, do mais recente para o mais antigo, com os arquivos que tocam o período", async () => {
    const lista = await repositorio.listar({ contaCorrenteId: conta.id, de: "2026-11-11", ate: "2026-11-30" });
    expect(lista.itens.map((m) => [m.dia, m.valor, m.estado])).toEqual([["2026-11-15", "-35.90", "pendente"], ["2026-11-12", "250.50", "pendente"]]);
    expect(lista.extratos.map((e) => e.novos).sort()).toEqual([1, 2]);
    expect((await repositorio.listar({ contaCorrenteId: conta.id, de: "2026-12-01", ate: "2026-12-31" })).itens).toEqual([]);
  }, PRAZO_MS);

  it("RLS: a tela Conciliação lê e importa; Contas a pagar não vê nada; ninguém altera nem apaga; a chave do arquivo é da empresa", async () => {
    expect(await comoRuntime("conciliacao", (tx) => tx.movimentoDoExtrato.count({ where: { contaCorrenteId: conta.id } }))).toBe(3);
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
      `UPDATE public.movimentos_do_extrato SET estado = 'conciliado' WHERE conta_corrente_id = '${conta.id}'`,
      `UPDATE public.extratos_bancarios SET arquivo_nome = 'x' WHERE conta_corrente_id = '${conta.id}'`,
      `DELETE FROM public.movimentos_do_extrato WHERE conta_corrente_id = '${conta.id}'`,
      `DELETE FROM public.extratos_bancarios WHERE conta_corrente_id = '${conta.id}'`,
    ]) {
      await expect(comoRuntime("conciliacao", (tx) => tx.$executeRawUnsafe(sql)), sql).rejects.toThrow(/permission denied/);
    }
  }, PRAZO_MS);
});
