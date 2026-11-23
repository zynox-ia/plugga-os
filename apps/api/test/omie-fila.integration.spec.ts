import { randomBytes, randomUUID } from "node:crypto";

import type { IntegrationMode } from "@plugga/shared";
import { acaoDoLancamentoSchema, criarContaAPagarSchema } from "@plugga/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditAppender } from "../src/audit/audit-appender.js";
import { EstadoInvalido } from "../src/common/errors/dominio.js";
import type { AuthPrincipal } from "../src/core/auth/auth.types.js";
import { papelNoFinanceiro } from "../src/financeiro/financeiro.rules.js";
import { PrismaFinanceiroRepository } from "../src/financeiro/prisma-financeiro.repository.js";
import type { IntegrationGate } from "../src/integrations/integration-gate.js";
import type { EnqueueOptions, JobsQueue } from "../src/jobs/queue/jobs-queue.port.js";
import type { OmieEscrita, PedidoDeEnvioAoOmie } from "../src/omie/omie-escrita.js";
import { OmieFilaService } from "../src/omie/omie-fila.service.js";
import { OmieFalhouError } from "../src/omie/omie.port.js";
import { PrismaService } from "../src/prisma/prisma.service.js";

/**
 * Fila do OMIE (PLU-342) contra o Postgres de verdade: o outbox gravado na transação
 * do lançamento, o estado do lançamento derivado pelo gatilho, o despacho que só
 * enfileira em `write`, a ordem dos envios, o destino de cada falha, a pausa por
 * empresa e método, o "Tentar de novo" e quem pode mexer em quê. O OMIE é um dublê:
 * nenhuma chamada sai.
 *
 *     pnpm --filter @plugga/api test:financeiro
 */
const HABILITADO = process.env.RUN_FINANCEIRO_INTEGRATION_TESTS === "true";
const PRAZO_MS = 60_000;
const AGORA = new Date("2026-11-23T14:00:00Z");

describe.skipIf(!HABILITADO)("fila do OMIE no Postgres", () => {
  const prisma = new PrismaService();
  const repositorio = new PrismaFinanceiroRepository(prisma, new AuditAppender());
  const marca = `fila-${randomUUID().slice(0, 8)}`;
  const sessao = randomBytes(32).toString("hex");
  const papel = papelNoFinanceiro({ plataforma: "admin", departamentos: [] });
  const ids = { fornecedor: "", despesa: "", conta: "" };
  let principal: AuthPrincipal;

  // Dublês: o modo da integração, a fila de jobs e a escrita no OMIE.
  let modo: IntegrationMode = "mock";
  const enfileirados: { jobKey: string; payload: { envioId: string }; options?: EnqueueOptions }[] = [];
  let responder: (pedido: PedidoDeEnvioAoOmie) => Promise<{ codigo: string | null }> = async () => ({ codigo: null });
  const chamadas: PedidoDeEnvioAoOmie[] = [];
  const gate = { modoDe: async () => modo } as unknown as IntegrationGate;
  const jobs = { enqueue: async (jobKey: string, payload: { envioId: string }, options?: EnqueueOptions) => { enfileirados.push({ jobKey, payload, options }); return { jobId: "x", jobKey, deduped: false }; } } as unknown as JobsQueue;
  const escrita = { enviar: async (p: PedidoDeEnvioAoOmie) => { chamadas.push(p); return responder(p); } } as unknown as OmieEscrita;
  const fila = new OmieFilaService(prisma, gate, jobs, escrita);

  const novaConta = async () => repositorio.criarContaAPagar(criarContaAPagarSchema.parse({
    empresa: "plugga", fornecedorId: ids.fornecedor, categoriaId: ids.despesa, contaCorrenteId: ids.conta,
    descricao: `${marca} conta`, valor: "100.00", vencimento: "2026-11-30", forma: "boleto",
  }), principal);
  const agir = (id: string, acao: unknown) => repositorio.executarAcao(id, acaoDoLancamentoSchema.parse(acao), principal, papel, AGORA);
  const envios = (lancamentoId: string) => prisma.omieEnvio.findMany({ where: { lancamentoId }, orderBy: { ordem: "asc" } });
  const noOmie = async (id: string) => (await prisma.lancamento.findUniqueOrThrow({ where: { id }, select: { omieEstado: true, omieCodigo: true, omieMotivo: true } }));
  /** Despacha e envia, com o dublê, só os envios deste lançamento. */
  const rodarFila = async (lancamentoId: string) => {
    enfileirados.length = 0;
    await fila.despachar(new Date());
    const meus = new Set((await envios(lancamentoId)).map((e) => e.id));
    for (const job of enfileirados.filter((j) => meus.has(j.payload.envioId))) await fila.enviar(job.payload.envioId, new Date());
  };
  const comoRuntime = <T>(fazer: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => Promise<T>) => prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL ROLE plugga_runtime");
    await tx.$executeRaw`SELECT set_config('plugga.session_hash', ${sessao}, true)`;
    return fazer(tx);
  });

  beforeAll(async () => {
    await prisma.$connect();
    const admin = await prisma.role.upsert({ where: { key: "admin" }, create: { key: "admin", name: "Admin" }, update: {} });
    for (const id of ["plugga", "waze"]) await prisma.company.upsert({ where: { id }, create: { id, name: id }, update: {} });
    const pessoa = await prisma.user.create({ data: { email: `${marca}@teste.local`, name: `${marca} Pessoa`, platformRoles: { create: { roleId: admin.id } } } });
    principal = { id: pessoa.id, kind: "user", acesso: { plataforma: "admin", departamentos: [] } };
    await prisma.session.create({ data: { userId: pessoa.id, tokenHash: sessao, expiresAt: new Date(Date.now() + 3_600_000), absoluteExpiresAt: new Date(Date.now() + 7_200_000) } });
    ids.fornecedor = (await prisma.fornecedor.create({ data: { nome: `${marca} Fornecedor`, categoria: "servico" } })).id;
    const sufixo = String(parseInt(marca.slice(5), 16) % 100_000);
    ids.despesa = (await prisma.categoriaFinanceira.create({ data: { companyId: "plugga", codigo: `9.05.${sufixo}`, nome: `${marca} despesa`, tipo: "despesa", natureza: "servico", grupoNome: "Teste" } })).id;
    ids.conta = (await prisma.contaCorrente.create({ data: { companyId: "plugga", omieCodigo: `${marca}-p`, nome: `${marca} conta` } })).id;
  }, PRAZO_MS);

  afterAll(async () => {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL session_replication_role = replica");
      const lancamentos = { lancamento: { descricao: { startsWith: marca } } };
      await tx.omieEnvio.deleteMany({ where: lancamentos });
      await tx.anexoDeLancamento.deleteMany({ where: lancamentos });
      await tx.historicoDeLancamento.deleteMany({ where: lancamentos });
      await tx.lancamento.deleteMany({ where: { descricao: { startsWith: marca } } });
      await tx.omiePausa.deleteMany({ where: { companyId: "plugga", motivo: { in: ["limite_de_consumo", "credenciais_invalidas"] } } });
      await tx.categoriaFinanceira.deleteMany({ where: { nome: { startsWith: marca } } });
      await tx.contaCorrente.deleteMany({ where: { nome: { startsWith: marca } } });
      await tx.fornecedor.deleteMany({ where: { nome: { startsWith: marca } } });
    });
    await prisma.session.deleteMany({ where: { tokenHash: sessao } });
    await prisma.user.deleteMany({ where: { email: { startsWith: marca } } });
    await prisma.$disconnect();
  }, PRAZO_MS);

  it("aprovar grava o pedido na transação; editar junta no mesmo pendente; o lançamento segue não enviado", async () => {
    const id = await novaConta();
    expect(await envios(id)).toEqual([]);
    await agir(id, { acao: "aprovar" });
    await repositorio.editar(id, { descricao: `${marca} conta editada` }, principal, papel);
    const lista = await envios(id);
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ operacao: "upsert", estado: "pendente", tentativas: 0, companyId: "plugga", criadoPorId: principal.id });
    expect(await noOmie(id)).toEqual({ omieEstado: "nao_enviado", omieCodigo: null, omieMotivo: null });
  }, PRAZO_MS);

  it("fora do modo write o despacho não enfileira nada e o OMIE não é chamado", async () => {
    const id = await novaConta();
    await agir(id, { acao: "aprovar" });
    for (const m of ["mock", "read_only", "bridge"] as const) {
      modo = m;
      enfileirados.length = 0;
      expect(await fila.despachar(new Date())).toEqual({ skipped: true, motivo: `modo_${m}` });
      expect(enfileirados).toEqual([]);
      const [envio] = await envios(id);
      expect(await fila.enviar(envio!.id, new Date())).toEqual({ skipped: true, motivo: `modo_${m}` });
    }
    expect(chamadas.filter((c) => c.lancamentoId === id)).toEqual([]);
    expect((await envios(id))[0]?.estado).toBe("pendente");
  }, PRAZO_MS);

  it("em write: a conta sai antes da baixa; o lançamento vai a enviado com o código e depois a baixado", async () => {
    modo = "write";
    responder = async (p) => ({ codigo: p.operacao === "upsert" ? `${marca.slice(5)}-cod` : null });
    const id = await novaConta();
    await agir(id, { acao: "aprovar" });
    // Pagar exige o comprovante anexado.
    await repositorio.registrarAnexo(id, "comprovante", { chave: `${marca}/${randomUUID()}.pdf`, nome: "c.pdf", tamanho: 1, tipo: "application/pdf" }, principal, papel, AGORA);
    await agir(id, { acao: "registrar_pagamento", forma: "pix", contaCorrenteId: ids.conta, pagoEm: "2026-11-23" });
    const [upsert, baixa] = await envios(id);
    expect([upsert?.operacao, baixa?.operacao]).toEqual(["upsert", "baixa"]);

    // A baixa espera a conta: o primeiro despacho só leva o upsert.
    enfileirados.length = 0;
    await fila.despachar(new Date());
    expect(enfileirados.map((j) => j.payload.envioId)).toContain(upsert!.id);
    expect(enfileirados.map((j) => j.payload.envioId)).not.toContain(baixa!.id);
    expect(enfileirados.find((j) => j.payload.envioId === upsert!.id)?.options).toMatchObject({ dedupeKey: `omie:envio:${upsert!.id}`, attempts: 1 });
    // Fora da vez o worker também recusa: o banco confere a ordem.
    expect(await fila.enviar(baixa!.id, new Date())).toEqual({ skipped: true, motivo: "fora_da_vez" });
    await fila.enviar(upsert!.id, new Date());
    expect(await noOmie(id)).toEqual({ omieEstado: "enviando", omieCodigo: `${marca.slice(5)}-cod`, omieMotivo: null });

    await rodarFila(id);
    expect((await envios(id)).map((e) => e.estado)).toEqual(["enviado", "enviado"]);
    expect(await noOmie(id)).toMatchObject({ omieEstado: "baixado", omieCodigo: `${marca.slice(5)}-cod` });
    expect(chamadas.filter((c) => c.lancamentoId === id).map((c) => `${c.tipo}:${c.operacao}`)).toEqual(["saida:upsert", "saida:baixa"]);
  }, PRAZO_MS);

  it("dois reenvios da mesma conta em momentos diferentes são dois envios, com chaves distintas", async () => {
    modo = "write";
    responder = async () => ({ codigo: "c1" });
    const id = await novaConta();
    await agir(id, { acao: "aprovar" });
    await rodarFila(id);
    await agir(id, { acao: "corrigir_valor", valor: "120.00", motivo: "reajuste" });
    const lista = await envios(id);
    expect(lista.map((e) => `${e.operacao}:${e.estado}`)).toEqual(["upsert:enviado", "upsert:pendente"]);
    // Pendente de um título que já está no OMIE: o lançamento mostra que está saindo.
    expect((await noOmie(id)).omieEstado).toBe("enviando");
    enfileirados.length = 0;
    await fila.despachar(new Date());
    const chaves = enfileirados.filter((j) => lista.some((e) => e.id === j.payload.envioId)).map((j) => j.options?.dedupeKey);
    expect(chaves).toEqual([`omie:envio:${lista[1]!.id}`]);
  }, PRAZO_MS);

  it("falha permanente vai a erro com o motivo; Tentar de novo devolve à fila e fica na linha do tempo", async () => {
    modo = "write";
    responder = async () => { throw new OmieFalhouError("recusada"); };
    const id = await novaConta();
    await agir(id, { acao: "aprovar" });
    await rodarFila(id);
    expect((await envios(id))[0]).toMatchObject({ estado: "erro", ultimoErro: "recusada", tentativas: 0 });
    expect(await noOmie(id)).toEqual({ omieEstado: "erro", omieCodigo: null, omieMotivo: "recusada" });

    await repositorio.tentarDeNovoNoOmie(id, principal, papel, AGORA);
    expect((await envios(id))[0]).toMatchObject({ estado: "pendente", ultimoErro: null, tentativas: 0 });
    expect((await noOmie(id)).omieEstado).toBe("nao_enviado");
    const detalhe = await repositorio.obter(id, papel, AGORA);
    expect(detalhe.linhaDoTempo.find((e) => e.tipo === "omie")).toMatchObject({ resumo: "Envio ao OMIE pedido de novo", por: { id: principal.id } });
    await expect(repositorio.tentarDeNovoNoOmie(id, principal, papel, AGORA)).rejects.toBeInstanceOf(EstadoInvalido);
  }, PRAZO_MS);

  it("falha transitória volta à fila contando a tentativa e com a próxima no futuro", async () => {
    modo = "write";
    responder = async () => { throw new Error("socket hang up"); };
    const id = await novaConta();
    await agir(id, { acao: "aprovar" });
    const antes = Date.now();
    await rodarFila(id);
    const [envio] = await envios(id);
    expect(envio).toMatchObject({ estado: "pendente", tentativas: 1, ultimoErro: "indisponivel" });
    expect(envio!.proximaTentativaEm.getTime()).toBeGreaterThan(antes + 20_000);
    // Ainda não venceu: o despacho seguinte não o leva.
    enfileirados.length = 0;
    await fila.despachar(new Date());
    expect(enfileirados.map((j) => j.payload.envioId)).not.toContain(envio!.id);
    expect(await noOmie(id)).toEqual({ omieEstado: "nao_enviado", omieCodigo: null, omieMotivo: "indisponivel" });
  }, PRAZO_MS);

  it("cancelar descarta o que não saiu; o que já chegou ao OMIE pede o cancelamento lá", async () => {
    modo = "write";
    responder = async () => ({ codigo: "c2" });
    const naoSaiu = await novaConta();
    await agir(naoSaiu, { acao: "aprovar" });
    await agir(naoSaiu, { acao: "cancelar", motivo: "duplicada" });
    expect((await envios(naoSaiu)).map((e) => `${e.operacao}:${e.estado}`)).toEqual(["upsert:descartado"]);

    const chegou = await novaConta();
    await agir(chegou, { acao: "aprovar" });
    await rodarFila(chegou);
    await agir(chegou, { acao: "cancelar", motivo: "duplicada" });
    expect((await envios(chegou)).map((e) => `${e.operacao}:${e.estado}`)).toEqual(["upsert:enviado", "cancelar:pendente"]);
  }, PRAZO_MS);

  it("a aplicação não grava o estado no OMIE nem marca envio como enviado; os jobs só pelas funções", async () => {
    const id = await novaConta();
    await agir(id, { acao: "aprovar" });
    await expect(comoRuntime((tx) => tx.$executeRaw`UPDATE public.lancamentos SET omie_estado = 'enviado' WHERE id = ${id}::uuid`))
      .rejects.toThrow(/ESTADO_NO_OMIE_SO_PELO_OUTBOX/);
    const marcados = await comoRuntime((tx) => tx.$executeRaw`UPDATE public.omie_envios SET estado = 'enviando' WHERE lancamento_id = ${id}::uuid`).catch((e: unknown) => e);
    expect(marcados instanceof Error ? marcados.message : String(marcados)).toMatch(/row-level security|^0$/);
    expect((await envios(id))[0]?.estado).toBe("pendente");
    // Nem o código do OMIE num pendente: esse campo é só do worker.
    await expect(comoRuntime((tx) => tx.$executeRaw`UPDATE public.omie_envios SET codigo_omie = 'falso' WHERE lancamento_id = ${id}::uuid`))
      .rejects.toThrow(/ENVIO_AO_OMIE_SO_PELO_WORKER/);
    await expect(prisma.omieEnvio.deleteMany({ where: { lancamentoId: id } })).rejects.toThrow(/não se apaga/);

    const comoJobs = <T>(fazer: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => Promise<T>) => prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL ROLE plugga_jobs_runtime");
      return fazer(tx);
    });
    await expect(comoJobs((tx) => tx.$queryRaw`SELECT id FROM public.omie_envios LIMIT 1`)).rejects.toThrow(/permission denied/);
    await expect(comoJobs((tx) => tx.$queryRaw`SELECT id FROM public.lancamentos LIMIT 1`)).rejects.toThrow(/permission denied/);
    const devidos = await comoJobs((tx) => tx.$queryRaw<{ id: string; lancamento_id: string }[]>`SELECT id, lancamento_id FROM plugga_security.omie_envios_devidos(500)`);
    expect(devidos.some((d) => d.lancamento_id === id)).toBe(true);
  }, PRAZO_MS);

  it("credencial recusada para a empresa toda até o par voltar; a retomada devolve à fila o que falhou por ela", async () => {
    modo = "write";
    responder = async () => { throw new OmieFalhouError("credenciais_invalidas"); };
    const id = await novaConta();
    await agir(id, { acao: "aprovar" });
    await rodarFila(id);
    expect((await envios(id))[0]).toMatchObject({ estado: "erro", ultimoErro: "credenciais_invalidas" });
    // Sem prazo (infinity), até a retomada.
    const pausaDaEmpresa = () => prisma.$queryRaw<{ semPrazo: boolean }[]>`SELECT ate = 'infinity'::timestamptz AS "semPrazo" FROM public.omie_pausas WHERE company_id = 'plugga' AND metodo = '*'`;
    expect(await pausaDaEmpresa()).toEqual([{ semPrazo: true }]);

    // Nada mais da empresa sai, nem em outro método, até o par voltar.
    const outra = await novaConta();
    await agir(outra, { acao: "aprovar" });
    const [envio] = await envios(outra);
    enfileirados.length = 0;
    await fila.despachar(new Date());
    expect(enfileirados.map((j) => j.payload.envioId)).not.toContain(envio!.id);
    expect(await fila.enviar(envio!.id, new Date())).toEqual({ skipped: true, motivo: "pausada" });

    // O teste ou a confirmação do par chamam a retomada; só quem gerencia a conexão pode.
    expect(await comoRuntime((tx) => tx.$queryRaw<{ n: number }[]>`SELECT plugga_security.omie_retomar_empresa('plugga') AS n`)).toEqual([{ n: expect.any(Number) }]);
    expect(await pausaDaEmpresa()).toEqual([]);
    expect((await envios(id))[0]).toMatchObject({ estado: "pendente", ultimoErro: null, tentativas: 0 });
    expect(await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL ROLE plugga_runtime");
      return tx.$queryRaw`SELECT plugga_security.omie_retomar_empresa('plugga')`.catch((e: unknown) => (e as Error).message);
    })).toMatch(/RETOMAR_OMIE_REQUER_GESTAO/);
  }, PRAZO_MS);

  // Por último: a pausa vale para a empresa e o método por 30 minutos.
  it("limite de consumo adia sem contar tentativa e pausa a empresa naquele método", async () => {
    modo = "write";
    responder = async () => { throw new OmieFalhouError("limite_de_consumo"); };
    const id = await novaConta();
    await agir(id, { acao: "aprovar" });
    await rodarFila(id);
    expect((await envios(id))[0]).toMatchObject({ estado: "pendente", tentativas: 0, ultimoErro: "limite_de_consumo" });
    expect(await prisma.omiePausa.findUnique({ where: { companyId_metodo: { companyId: "plugga", metodo: "UpsertContaPagar" } } })).toMatchObject({ motivo: "limite_de_consumo" });

    const outra = await novaConta();
    await agir(outra, { acao: "aprovar" });
    const [envio] = await envios(outra);
    enfileirados.length = 0;
    await fila.despachar(new Date());
    expect(enfileirados.map((j) => j.payload.envioId)).not.toContain(envio!.id);
    expect(await fila.enviar(envio!.id, new Date())).toEqual({ skipped: true, motivo: "pausada" });
  }, PRAZO_MS);
});
