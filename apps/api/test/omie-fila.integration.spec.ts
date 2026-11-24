import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { IntegrationMode } from "@plugga/shared";
import { acaoDoLancamentoSchema, criarContaAPagarSchema, listarLancamentosQuerySchema } from "@plugga/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditAppender } from "../src/audit/audit-appender.js";
import { EstadoInvalido } from "../src/common/errors/dominio.js";
import type { AuthPrincipal } from "../src/core/auth/auth.types.js";
import { papelNoFinanceiro } from "../src/financeiro/financeiro.rules.js";
import { PrismaFinanceiroRepository } from "../src/financeiro/prisma-financeiro.repository.js";
import { ConectoresDoFinanceiro } from "../src/financeiro/conectores-do-financeiro.js";
import { ReflexosDoLancamento } from "../src/financeiro/reflexo-do-lancamento.js";
import { PrismaOmieLancamentosRepository } from "../src/omie/prisma-omie-lancamentos.repository.js";
import { OmieConectorDoFinanceiro, OmieReflexoDoLancamento } from "../src/omie/omie-reflexo.js";
import type { IntegrationGate } from "../src/integrations/integration-gate.js";
import type { EnqueueOptions, JobsQueue } from "../src/jobs/queue/jobs-queue.port.js";
import type { OmieEscrita, PedidoDeEnvioAoOmie } from "../src/omie/omie-escrita.js";
import { OmieFilaService } from "../src/omie/omie-fila.service.js";
import { OmieFalhouError } from "../src/omie/omie.port.js";
import { contextoBanco } from "../src/prisma/contexto-banco.js";
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
  // O conector se inscreve nos reflexos do Financeiro; a conexão do OMIE é simulada (ligada).
  let conectorLigado = true;
  const reflexos = new ReflexosDoLancamento();
  reflexos.inscrever(new OmieReflexoDoLancamento(async () => conectorLigado));
  const repositorio = new PrismaFinanceiroRepository(prisma, new AuditAppender(), reflexos);
  const conector = new PrismaOmieLancamentosRepository(prisma, new AuditAppender());
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
  // Com a sessão de quem age: o reflexo do cancelamento confere o acesso no banco.
  const agir = (id: string, acao: unknown) => contextoBanco.run({ sessionHash: sessao, agentHash: undefined },
    () => repositorio.executarAcao(id, acaoDoLancamentoSchema.parse(acao), principal, papel, AGORA));
  const envios = (lancamentoId: string) => prisma.omieEnvio.findMany({ where: { lancamentoId }, orderBy: { ordem: "asc" } });
  /** O estado no OMIE. Até a contração, as colunas antigas e a tabela do conector andam juntas. */
  const noOmie = async (id: string) => {
    const antigo = await prisma.lancamento.findUniqueOrThrow({ where: { id }, select: { omieEstado: true, omieCodigo: true, omieMotivo: true } });
    const conector = await prisma.omieLancamento.findUnique({ where: { lancamentoId: id }, select: { estado: true, codigo: true, motivo: true } });
    const novo = conector ?? { estado: "nao_enviado", codigo: null, motivo: null };
    expect({ omieEstado: novo.estado, omieCodigo: novo.codigo, omieMotivo: novo.motivo }).toEqual(antigo);
    return antigo;
  };
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
      await tx.omieLancamento.deleteMany({ where: lancamentos });
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

  it("com o conector desligado, o Financeiro funciona inteiro e nada vai ao outbox", async () => {
    conectorLigado = false;
    try {
      const id = await novaConta();
      await agir(id, { acao: "aprovar" });
      await repositorio.registrarAnexo(id, "comprovante", { chave: `${marca}/${randomUUID()}.pdf`, nome: "c.pdf", tamanho: 1, tipo: "application/pdf" }, principal, papel, AGORA);
      await agir(id, { acao: "registrar_pagamento", forma: "pix", contaCorrenteId: ids.conta, pagoEm: "2026-11-23" });
      expect((await repositorio.obter(id, papel, AGORA)).etapa).toBe("paga");
      expect(await envios(id)).toEqual([]);
      expect(await noOmie(id)).toEqual({ omieEstado: "nao_enviado", omieCodigo: null, omieMotivo: null });
    } finally {
      conectorLigado = true;
    }
  }, PRAZO_MS);

  it("aprovada com o conector desligado e paga depois de ligar: o título vai antes da baixa, e a baixa espera por ele", async () => {
    conectorLigado = false;
    const id = await novaConta();
    try {
      await agir(id, { acao: "aprovar" });
    } finally {
      conectorLigado = true;
    }
    expect(await envios(id)).toEqual([]);
    await repositorio.registrarAnexo(id, "comprovante", { chave: `${marca}/${randomUUID()}.pdf`, nome: "c.pdf", tamanho: 1, tipo: "application/pdf" }, principal, papel, AGORA);
    await agir(id, { acao: "registrar_pagamento", forma: "pix", contaCorrenteId: ids.conta, pagoEm: "2026-11-23" });
    const [upsert, baixa] = await envios(id);
    expect([upsert?.operacao, baixa?.operacao]).toEqual(["upsert", "baixa"]);
    expect([upsert?.estado, baixa?.estado]).toEqual(["pendente", "pendente"]);
    // A ordem da fila vale: a baixa não sai antes do título.
    modo = "write";
    expect(await fila.enviar(baixa!.id, new Date())).toEqual({ skipped: true, motivo: "fora_da_vez" });
  }, PRAZO_MS);

  it("sem conector inscrito (o Financeiro sozinho), as ações não tocam o outbox", async () => {
    const sozinho = new PrismaFinanceiroRepository(prisma, new AuditAppender());
    const id = await sozinho.criarContaAPagar(criarContaAPagarSchema.parse({
      empresa: "plugga", fornecedorId: ids.fornecedor, categoriaId: ids.despesa, contaCorrenteId: ids.conta,
      descricao: `${marca} conta sozinha`, valor: "10.00", vencimento: "2026-11-30", forma: "boleto",
    }), principal);
    await sozinho.executarAcao(id, acaoDoLancamentoSchema.parse({ acao: "aprovar" }), principal, papel, AGORA);
    expect(await envios(id)).toEqual([]);
  }, PRAZO_MS);

  it("a conexão real: quem opera o Financeiro pergunta ao banco, e empresa sem par conferido conta como desligada", async () => {
    const ligado = await comoRuntime((tx) => tx.$queryRaw<{ ligado: boolean }[]>`SELECT plugga_security.omie_conectado('empresa-sem-omie') AS ligado`);
    expect(ligado).toEqual([{ ligado: false }]);
  }, PRAZO_MS);

  it("as opções do Financeiro dizem, por empresa, se o OMIE está conectado; sem conector, não trazem o campo", async () => {
    const comConector = (ligada?: (tx: unknown, empresa: string) => Promise<boolean>) => {
      const conectores = new ConectoresDoFinanceiro();
      conectores.inscrever(ligada ? new OmieConectorDoFinanceiro(ligada) : new OmieConectorDoFinanceiro());
      return new PrismaFinanceiroRepository(prisma, new AuditAppender(), reflexos, conectores);
    };
    expect((await comConector(async (_tx, empresa) => empresa === "plugga").opcoes()).conectores).toEqual({ omie: { plugga: true, waze: false } });
    // A função real do banco responde as duas empresas (o par de teste não existe, então é falso).
    const real = (await comConector().opcoes()).conectores;
    expect(Object.keys(real?.omie ?? {}).sort()).toEqual(["plugga", "waze"]);
    expect(Object.values(real?.omie ?? {}).every((v) => typeof v === "boolean")).toBe(true);
    expect(await repositorio.opcoes()).not.toHaveProperty("conectores");
  }, PRAZO_MS);

  it("o backfill da tabela do conector (o SQL da migration): copia o estado de antes, ignora quem nunca foi ao OMIE e pode rodar de novo", async () => {
    const sql = readFileSync(join(__dirname, "../prisma/migrations/20261124500400_omie_lancamentos/migration.sql"), "utf8");
    const backfill = /-- backfill:inicio\n([\s\S]*?)-- backfill:fim/.exec(sql.replace(/\r\n/g, "\n"))?.[1];
    expect(backfill).toMatch(/INSERT INTO public\.omie_lancamentos/);

    // O estado de antes da migration: as colunas antigas preenchidas e nenhuma linha no conector.
    const nunca = await novaConta();
    const enviado = await novaConta();
    const naFila = await novaConta();
    await agir(enviado, { acao: "aprovar" });
    await agir(naFila, { acao: "aprovar" });
    await prisma.$transaction(async (tx) => {
      // Como dono do banco de teste, que o gatilho-guarda deixa passar (é o papel da migration).
      await tx.$executeRaw`UPDATE public.omie_envios SET estado = 'enviando' WHERE lancamento_id = ${enviado}::uuid`;
      await tx.$executeRaw`UPDATE public.omie_envios SET estado = 'enviado', codigo_omie = 'cod-antigo', enviado_em = now() WHERE lancamento_id = ${enviado}::uuid`;
      await tx.$executeRaw`DELETE FROM public.omie_lancamentos WHERE lancamento_id IN (${nunca}::uuid, ${enviado}::uuid, ${naFila}::uuid)`;
    });
    const antes = await prisma.lancamento.findMany({ where: { id: { in: [enviado, naFila] } }, select: { id: true, omieEstado: true, omieCodigo: true, omieMotivo: true } });
    expect(antes.find((l) => l.id === enviado)).toMatchObject({ omieEstado: "enviado", omieCodigo: "cod-antigo" });
    expect(await prisma.omieLancamento.count({ where: { lancamentoId: { in: [nunca, enviado, naFila] } } })).toBe(0);

    for (let vez = 0; vez < 2; vez++) await prisma.$executeRawUnsafe(backfill!);

    const depois = await prisma.omieLancamento.findMany({ where: { lancamentoId: { in: [nunca, enviado, naFila] } }, orderBy: { lancamentoId: "asc" } });
    expect(depois.map((o) => o.lancamentoId).sort()).toEqual([enviado, naFila].sort());
    expect(depois.find((o) => o.lancamentoId === enviado)).toMatchObject({ companyId: "plugga", estado: "enviado", codigo: "cod-antigo", motivo: null });
    expect(depois.find((o) => o.lancamentoId === naFila)).toMatchObject({ estado: "nao_enviado", codigo: null });
    // Paridade com as colunas antigas, que é o que libera a contração.
    for (const id of [nunca, enviado, naFila]) await noOmie(id);
    expect((await repositorio.obter(nunca, papel, AGORA)).omie).toEqual({ estado: "nao_enviado", codigo: null, motivo: null });
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
    // A API lê pela tabela do conector.
    expect((await repositorio.obter(id, papel, AGORA)).omie).toEqual({ estado: "baixado", codigo: `${marca.slice(5)}-cod`, motivo: null });
    expect(chamadas.filter((c) => c.lancamentoId === id).map((c) => `${c.tipo}:${c.operacao}`)).toEqual(["saida:upsert", "saida:baixa"]);
  }, PRAZO_MS);

  it("despesa sem categoria (CC14) espera no outbox: o despacho não a leva, o worker não a envia, e ao classificar ela sai", async () => {
    modo = "write";
    responder = async () => ({ codigo: `${marca.slice(5)}-semcat` });
    const id = await novaConta();
    await agir(id, { acao: "aprovar" });
    // A conta da compra nasce sem categoria; aqui, o mesmo estado pelo banco (o contrato ainda a exige).
    await prisma.$executeRaw`UPDATE public.lancamentos SET categoria_id = NULL WHERE id = ${id}::uuid`;
    const [envio] = await envios(id);
    enfileirados.length = 0;
    await fila.despachar(new Date());
    expect(enfileirados.map((j) => j.payload.envioId)).not.toContain(envio!.id);
    expect(await fila.enviar(envio!.id, new Date())).toEqual({ skipped: true, motivo: "fora_da_vez" });
    expect((await envios(id))[0]?.estado).toBe("pendente");
    expect(chamadas.filter((c) => c.lancamentoId === id)).toEqual([]);

    // Classificada, sai na próxima rodada.
    await prisma.$executeRaw`UPDATE public.lancamentos SET categoria_id = ${ids.despesa}::uuid WHERE id = ${id}::uuid`;
    await rodarFila(id);
    expect((await envios(id))[0]?.estado).toBe("enviado");
    expect(await noOmie(id)).toMatchObject({ omieEstado: "enviado", omieCodigo: `${marca.slice(5)}-semcat` });
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
    // O filtro "com erro no OMIE" da lista vai pela tabela do conector.
    const comErro = await repositorio.listar(listarLancamentosQuerySchema.parse({ busca: marca, situacao: "erro" }), papel, AGORA);
    expect(comErro.itens.map((l) => l.id)).toContain(id);
    expect(comErro.itens.every((l) => l.omie.estado === "erro" || l.omie.estado === "divergente")).toBe(true);

    await conector.tentarDeNovo(id, principal, AGORA);
    expect((await envios(id))[0]).toMatchObject({ estado: "pendente", ultimoErro: null, tentativas: 0 });
    expect((await noOmie(id)).omieEstado).toBe("nao_enviado");
    const detalhe = await repositorio.obter(id, papel, AGORA);
    expect(detalhe.linhaDoTempo.find((e) => e.tipo === "omie")).toMatchObject({ resumo: "Envio ao OMIE pedido de novo", por: { id: principal.id } });
    await expect(conector.tentarDeNovo(id, principal, AGORA)).rejects.toBeInstanceOf(EstadoInvalido);
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

  it("cancelar descarta o que não saiu; o que já chegou ao OMIE, com a empresa sem conexão confirmada, só descarta", async () => {
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
    // A conexão é a do banco (omie_conectado): aqui, sem par confirmado, não há o que pedir ao OMIE.
    // Com a conexão confirmada, o pedido de cancelamento sai: em omie-conexoes.integration.
    expect((await envios(chegou)).map((e) => `${e.operacao}:${e.estado}`)).toEqual(["upsert:enviado"]);
  }, PRAZO_MS);

  it("a aplicação não grava o estado no OMIE nem marca envio como enviado; os jobs só pelas funções", async () => {
    const id = await novaConta();
    await agir(id, { acao: "aprovar" });
    await expect(comoRuntime((tx) => tx.$executeRaw`UPDATE public.lancamentos SET omie_estado = 'enviado' WHERE id = ${id}::uuid`))
      .rejects.toThrow(/ESTADO_NO_OMIE_SO_PELO_OUTBOX/);
    // A tabela do conector a aplicação só lê: quem grava é o gatilho dos envios.
    await expect(comoRuntime((tx) => tx.$executeRaw`INSERT INTO public.omie_lancamentos (lancamento_id, company_id, estado) VALUES (${id}::uuid, 'plugga', 'enviado')`))
      .rejects.toThrow(/permission denied/);
    await expect(comoRuntime((tx) => tx.$executeRaw`UPDATE public.omie_lancamentos SET estado = 'enviado' WHERE lancamento_id = ${id}::uuid`))
      .rejects.toThrow(/permission denied/);
    expect((await comoRuntime((tx) => tx.omieLancamento.findUnique({ where: { lancamentoId: id } })))?.estado).toBe("nao_enviado");
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
