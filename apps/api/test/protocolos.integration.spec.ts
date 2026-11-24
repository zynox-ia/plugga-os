import { randomBytes } from "node:crypto";

import { criarProtocoloSchema, verificarProtocoloSchema, type Acesso } from "@plugga/shared";
import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditAppender } from "../src/audit/audit-appender.js";
import { AcessoNegado, Conflito, EstadoInvalido, RequisicaoInvalida } from "../src/common/errors/dominio.js";
import type { AuthPrincipal } from "../src/core/auth/auth.types.js";
import { PrismaProtocolosRepository } from "../src/engenharia/prisma-protocolos.repository.js";
import { ProtocolosService } from "../src/engenharia/protocolos.service.js";
import { contextoBanco } from "../src/prisma/contexto-banco.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { PrismaTarefasRepository } from "../src/tarefas/prisma-tarefas.repository.js";
import { TarefasService } from "../src/tarefas/tarefas.service.js";
import { assertSafeTestDatabaseUrl } from "./safe-test-environment";

/**
 * Protocolos na distribuidora (PLU-348) no Postgres, no login da aplicação (com
 * RLS): cada departamento lê e grava os seus; a verificação muda a situação e
 * fica no histórico; nada se apaga; a tarefa automática "Protocolos do dia" se
 * conclui quando não resta verificação.
 *
 *     pnpm --filter @plugga/api test:protocolos
 */
const HABILITADO = process.env.RUN_PROTOCOLOS_INTEGRATION_TESTS === "true";
const PRAZO = 60_000;
// Segunda, 23/11/2026, 10:00 em Manaus.
const AGORA = new Date("2026-11-23T14:00:00Z");

describe.skipIf(!HABILITADO)("protocolos na distribuidora no Postgres", { timeout: PRAZO }, () => {
  const root = new PrismaClient();
  const marca = `pro_${randomBytes(6).toString("hex")}`;
  const login = `${marca}_app`;
  const pessoas = new Map<string, { id: string; hash: string; acesso: Acesso }>();
  let app: PrismaService;
  let repo: PrismaProtocolosRepository;
  let servico: ProtocolosService;
  let clienteId: string;
  let ucId: string;
  let ucOutra: string;
  let distribuidoraId: string;
  let ambienteValidado = false;
  // Relógio do serviço: avança dentro do mesmo dia para ordenar o histórico.
  let agora = AGORA;

  const principal = (nome: string): AuthPrincipal => ({ id: pessoas.get(nome)!.id, kind: "user", acesso: pessoas.get(nome)!.acesso });
  const como = <T>(nome: string, fazer: () => Promise<T>) => contextoBanco.run({ sessionHash: pessoas.get(nome)!.hash, agentHash: undefined }, fazer);
  const tx = <T>(nome: string, fazer: (t: Prisma.TransactionClient) => Promise<T>) => como(nome, () => app.comContexto(fazer));
  const novo = (dados: Record<string, unknown> = {}, nome = "eng") => como(nome, () => servico.criar(criarProtocoloSchema.parse({
    empresa: "waze", departamento: "engenharia-obras", clienteId, ucId, distribuidoraId, tipo: "orcamento_de_conexao",
    numero: `${marca}-1`, abertoEm: "2026-11-10", dataLimite: "2026-11-27", ...dados,
  }), principal(nome)));
  const verificar = (id: string, dados: Record<string, unknown>, nome = "eng") => como(nome, () => servico.verificar(id, verificarProtocoloSchema.parse(dados), principal(nome)));

  beforeAll(async () => {
    assertSafeTestDatabaseUrl(process.env.DATABASE_URL!, process.env.CI === "true", process.env.PLUGGA_TEST_DB_PORT);
    ambienteValidado = true;
    await root.$connect();
    if (!/^pro_[a-f0-9]+_app$/.test(login)) throw new Error("Login de fixture inválido");
    const senha = randomBytes(32).toString("hex");
    await root.$transaction(async (t) => {
      await t.$executeRaw`SELECT set_config('plugga.test_role', ${login}, true)`;
      await t.$executeRaw`SELECT set_config('plugga.test_password', ${senha}, true)`;
      await t.$executeRawUnsafe(`DO $fixture$ BEGIN EXECUTE format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L', current_setting('plugga.test_role'), current_setting('plugga.test_password')); END $fixture$`);
    });
    await root.$executeRawUnsafe(`GRANT plugga_runtime TO "${login}"`);
    const url = new URL(process.env.DATABASE_URL!);
    url.username = login;
    url.password = senha;
    url.searchParams.set("connection_limit", "3");
    app = new PrismaService({ datasources: { db: { url: url.toString() } } });
    const auditoria = new AuditAppender();
    repo = new PrismaProtocolosRepository(app, auditoria);
    const armazenamento = { enviar: async () => undefined, excluir: async () => undefined, ler: async () => { throw new Error("sem leitura no teste"); } };
    const config = { get: (chave: string) => (chave === "ENGENHARIA_LIGADA" ? true : undefined) };
    const tarefas = new TarefasService(new PrismaTarefasRepository(app, auditoria), armazenamento as never, config as never, () => AGORA);
    servico = new ProtocolosService(repo, tarefas, () => agora);

    for (const id of ["plugga", "waze"]) await root.company.upsert({ where: { id }, create: { id, name: id }, update: {} });
    const perfis: Record<string, { departamento: string; nivel: "membro" | "gerente"; telas: string[] }> = {
      eng: { departamento: "engenharia-obras", nivel: "membro", telas: ["engenharia-obras.protocolos"] },
      opm: { departamento: "energia-opm", nivel: "membro", telas: ["energia-opm.protocolos"] },
      gerenteOpm: { departamento: "energia-opm", nivel: "gerente", telas: ["energia-opm.protocolos"] },
      os: { departamento: "engenharia-obras", nivel: "membro", telas: ["engenharia-obras.os"] },
    };
    for (const [nome, perfil] of Object.entries(perfis)) {
      const pessoa = await root.user.create({ data: { name: `${marca} ${nome}`, email: `${marca}-${nome.toLowerCase()}@teste.local` } });
      const hash = randomBytes(32).toString("hex");
      await root.session.create({ data: { userId: pessoa.id, tokenHash: hash, expiresAt: new Date(Date.now() + 3_600_000), absoluteExpiresAt: new Date(Date.now() + 7_200_000) } });
      await root.userDepartamento.create({ data: { userId: pessoa.id, departamento: perfil.departamento, nivel: perfil.nivel, telas: perfil.telas } });
      pessoas.set(nome, { id: pessoa.id, hash, acesso: { plataforma: null, departamentos: [{ departamento: perfil.departamento, nivel: perfil.nivel, telas: perfil.telas }] } as Acesso });
    }
    const cliente = await root.client.create({ data: { name: `${marca} Cliente` } });
    clienteId = cliente.id;
    ucId = (await root.consumerUnit.create({ data: { clientId: clienteId, code: `${marca}-uc-9999123456`, distributor: "Amazonas Energia" } })).id;
    const outro = await root.client.create({ data: { name: `${marca} Outro` } });
    ucOutra = (await root.consumerUnit.create({ data: { clientId: outro.id, code: `${marca}-outra`, distributor: "x" } })).id;
    // Distribuidora própria do teste: o número do protocolo é único por distribuidora.
    distribuidoraId = `teste-${marca.slice(4)}`;
    await root.distribuidora.create({ data: { id: distribuidoraId, nome: `${marca} Distribuidora` } });
  }, PRAZO);

  afterAll(async () => {
    await app?.$disconnect();
    if (ambienteValidado) {
      const clientes = (await root.client.findMany({ where: { name: { startsWith: marca } }, select: { id: true } })).map((c) => c.id);
      await root.$transaction(async (t) => {
        await t.$executeRawUnsafe("SET LOCAL session_replication_role = replica");
        await t.verificacaoDeProtocolo.deleteMany({ where: { protocolo: { clientId: { in: clientes } } } });
        await t.protocolo.deleteMany({ where: { clientId: { in: clientes } } });
        await t.distribuidora.deleteMany({ where: { OR: [{ id: distribuidoraId }, { nome: { startsWith: marca } }] } });
        const tarefas = (await t.tarefa.findMany({ where: { titulo: { startsWith: marca } }, select: { id: true } })).map((x) => x.id);
        await t.ocorrenciaDeTarefa.deleteMany({ where: { tarefaId: { in: tarefas } } });
        await t.tarefa.deleteMany({ where: { id: { in: tarefas } } });
      });
      await root.client.deleteMany({ where: { id: { in: clientes } } });
      await root.user.deleteMany({ where: { email: { startsWith: marca } } });
      await root.$executeRawUnsafe(`DROP ROLE IF EXISTS "${login}"`);
    }
    await root.$disconnect();
  }, PRAZO);

  it("a Amazonas Energia vem semeada no catálogo", async () => {
    expect(await root.distribuidora.findUnique({ where: { id: "amazonas-energia" } })).toMatchObject({ nome: "Amazonas Energia", uf: "AM", ativa: true });
  });

  it("cadastra o protocolo: lembrete na data-limite; recusa data no passado, UC de outro cliente, número repetido e outro departamento", async () => {
    const p = await novo();
    expect(p).toMatchObject({
      departamento: "engenharia-obras", situacao: "aberto", numero: `${marca}-1`, abertoEm: "2026-11-10", dataLimite: "2026-11-27",
      proximaVerificacao: "2026-11-27", diasParaOLimite: 4, verificarHoje: false, cliente: { nome: `${marca} Cliente` },
      uc: { id: ucId, codigo: `${marca}-uc-9999123456` }, criado: { por: { nome: `${marca} eng` } }, acoesPermitidas: ["editar", "verificar"], historico: [],
    });
    await expect(novo({ numero: `${marca}-passado`, dataLimite: "2026-11-22" })).rejects.toThrow(RequisicaoInvalida);
    await expect(novo({ numero: `${marca}-passado`, proximaVerificacao: "2026-11-20" })).rejects.toThrow(RequisicaoInvalida);
    await expect(novo({ numero: `${marca}-futuro`, abertoEm: "2026-11-24" })).rejects.toThrow(RequisicaoInvalida);
    await expect(novo({ numero: `${marca}-outra`, ucId: ucOutra })).rejects.toThrow(RequisicaoInvalida);
    await expect(novo()).rejects.toThrow(Conflito);
    await expect(novo({ numero: `${marca}-opm` }, "opm")).rejects.toThrow(AcessoNegado);
    // Pelo repositório, sem o serviço: o RLS recusa o protocolo de outro departamento.
    await expect(como("opm", () => repo.criar(criarProtocoloSchema.parse({
      empresa: "waze", departamento: "engenharia-obras", clienteId, ucId, distribuidoraId, tipo: "liberacao", numero: `${marca}-rls`, abertoEm: "2026-11-10", dataLimite: "2026-11-27",
    }), principal("opm")))).rejects.toThrow(/row-level security/);
  });

  it("cada departamento vê os seus; contagens, verificar hoje e busca por número e por UC", async () => {
    const opm = await novo({ departamento: "energia-opm", numero: `${marca}-2`, tipo: "permanencia_no_cativo", dataLimite: "2026-12-20", proximaVerificacao: "2026-11-23" }, "opm");
    const eng = await como("eng", () => servico.listar({}, principal("eng")));
    expect(eng.itens.every((p) => p.departamento === "engenharia-obras")).toBe(true);
    expect(eng.itens.map((p) => p.numero)).toContain(`${marca}-1`);
    const deOpm = await como("opm", () => servico.listar({ busca: marca }, principal("opm")));
    expect(deOpm.itens.map((p) => p.id)).toEqual([opm.id]);
    expect(deOpm.itens[0]).toMatchObject({ verificarHoje: true, diasParaOLimite: 27 });
    expect(deOpm.contagens).toEqual({ emAndamento: 1, verificarHoje: 1, vencemEm7Dias: 0, vencidos: 0 });
    await expect(como("opm", () => servico.listar({ departamento: "engenharia-obras" }, principal("opm")))).rejects.toThrow(AcessoNegado);
    expect((await como("opm", () => servico.listar({ busca: "9999123456" }, principal("opm")))).itens.map((p) => p.id)).toEqual([opm.id]);
    expect((await como("eng", () => servico.listar({ busca: `${marca}-1`, verificarHoje: "sim" }, principal("eng")))).itens).toEqual([]);
    expect((await como("eng", () => servico.listar({ busca: marca }, principal("eng")))).contagens).toMatchObject({ emAndamento: 1, vencemEm7Dias: 1 });
    await expect(como("eng", () => servico.protocolo(opm.id, principal("eng")))).rejects.toThrow(/não encontrado/);
    await expect(como("os", () => servico.listar({}, principal("os")))).rejects.toThrow(AcessoNegado);
    expect(await tx("os", (t) => t.protocolo.count({ where: { numero: { startsWith: marca } } }))).toBe(0);
  });

  it("a verificação muda a situação, marca a próxima e fica no histórico; o encerrado não muda mais", async () => {
    const p = await novo({ numero: `${marca}-3`, dataLimite: "2026-12-15" });
    const pendente = await verificar(p.id, { situacao: "com_pendencia", nota: `${marca} falta a ART`, acaoPendente: "Enviar a ART assinada", proximaVerificacao: "2026-11-25" });
    expect(pendente).toMatchObject({ situacao: "com_pendencia", acaoPendente: "Enviar a ART assinada", proximaVerificacao: "2026-11-25", ultimaVerificacao: { por: { nome: `${marca} eng` } } });
    expect(pendente.historico).toEqual([expect.objectContaining({ situacaoAnterior: "aberto", situacao: "com_pendencia", acaoPendente: "Enviar a ART assinada" })]);
    await expect(verificar(p.id, { situacao: "em_analise", proximaVerificacao: "2026-11-22" })).rejects.toThrow(RequisicaoInvalida);
    agora = new Date(AGORA.getTime() + 60_000);
    const liberado = await verificar(p.id, { situacao: "liberado", nota: "Liberado pela distribuidora" });
    agora = AGORA;
    expect(liberado).toMatchObject({ situacao: "liberado", acaoPendente: null, proximaVerificacao: null, diasParaOLimite: null, verificarHoje: false, acoesPermitidas: [] });
    expect(liberado.historico.map((h) => h.situacao)).toEqual(["liberado", "com_pendencia"]);
    await expect(verificar(p.id, { situacao: "em_analise", proximaVerificacao: "2026-11-30" })).rejects.toThrow(EstadoInvalido);
    await expect(como("eng", () => servico.editar(p.id, { numero: `${marca}-3b` }, principal("eng")))).rejects.toThrow(EstadoInvalido);
    // O evento não leva a nota nem a ação.
    const eventos = await root.eventLog.findMany({ where: { eventName: "protocolos.protocolo.verificado", entityId: p.id } });
    expect(eventos).toHaveLength(2);
    expect(JSON.stringify(eventos)).not.toMatch(/ART|Liberado pela/);
  });

  it("edita tipo, número e data-limite, sem data-limite no passado", async () => {
    const p = await novo({ numero: `${marca}-4` });
    const editado = await como("eng", () => servico.editar(p.id, { tipo: "cusd", dataLimite: "2026-12-01", observacao: "Ver anexo no e-mail" }, principal("eng")));
    expect(editado).toMatchObject({ tipo: "cusd", dataLimite: "2026-12-01", observacao: "Ver anexo no e-mail" });
    await expect(como("eng", () => servico.editar(p.id, { dataLimite: "2026-11-01" }, principal("eng")))).rejects.toThrow(RequisicaoInvalida);
    // O lembrete que era a data-limite acompanha o prazo antecipado.
    expect(editado.proximaVerificacao).toBe("2026-12-01");
    expect(await como("eng", () => servico.editar(p.id, { dataLimite: "2026-11-25" }, principal("eng")))).toMatchObject({ dataLimite: "2026-11-25", proximaVerificacao: "2026-11-25" });
    // Um lembrete antes do prazo fica onde está.
    const antes = await novo({ numero: `${marca}-4b`, proximaVerificacao: "2026-11-24", dataLimite: "2026-12-10" });
    expect(await como("eng", () => servico.editar(antes.id, { dataLimite: "2026-12-05" }, principal("eng")))).toMatchObject({ proximaVerificacao: "2026-11-24" });
  });

  it("a tarefa automática dos protocolos se conclui quando não resta verificação para hoje", async () => {
    const tarefa = await root.tarefa.create({ data: {
      departamento: "engenharia-obras", titulo: `${marca} protocolos do dia`, empresa: "ambas", responsavelId: pessoas.get("eng")!.id, tipo: "recorrente",
      regra: { recorrencia: "dia_util" }, dia: new Date("2026-11-23T04:00:00Z"), horarioLimite: "17:00", exigeEvidencia: true, exigeResultado: false,
      automacao: "engenharia.protocolos_do_dia", origem: "do_departamento", criadoPorId: pessoas.get("eng")!.id,
    } });
    const hoje = await novo({ numero: `${marca}-5`, proximaVerificacao: "2026-11-23" });
    // Protocolos da Engenharia de outras suítes, com verificação vencida, também contam: ficam para amanhã aqui.
    await root.$executeRaw`UPDATE public.protocolos SET proxima_verificacao = ${new Date("2026-11-24T04:00:00Z")} WHERE departamento = 'engenharia-obras' AND situacao NOT IN ('respondido', 'liberado', 'indeferido') AND proxima_verificacao <= ${new Date("2026-11-23T04:00:00Z")} AND id <> ${hoje.id}::uuid`;
    await como("eng", () => servico.listar({}, principal("eng")));
    expect(await root.ocorrenciaDeTarefa.findFirst({ where: { tarefaId: tarefa.id, concluidaEm: { not: null } } })).toBeNull();
    await verificar(hoje.id, { situacao: "em_analise", proximaVerificacao: "2026-11-30" });
    const ocorrencia = await root.ocorrenciaDeTarefa.findFirstOrThrow({ where: { tarefaId: tarefa.id, dia: new Date("2026-11-23T04:00:00Z") } });
    expect(ocorrencia).toMatchObject({ automatica: true, concluidaPorId: pessoas.get("eng")!.id });
  });

  it("distribuidoras: só o gerente cria e muda", async () => {
    await expect(como("opm", () => servico.criarDistribuidora({ nome: `${marca} Nova` }, principal("opm")))).rejects.toThrow(AcessoNegado);
    const lista = await como("gerenteOpm", () => servico.criarDistribuidora({ nome: `${marca} Nova`, sigla: "NV", uf: "PA" }, principal("gerenteOpm")));
    expect(lista.podeEditar).toBe(true);
    expect(lista.itens.find((d) => d.nome === `${marca} Nova`)).toMatchObject({ sigla: "NV", uf: "PA", ativa: true });
    await expect(como("gerenteOpm", () => servico.criarDistribuidora({ nome: `${marca} Nova` }, principal("gerenteOpm")))).rejects.toThrow(Conflito);
    await expect(tx("opm", (t) => t.distribuidora.update({ where: { id: distribuidoraId }, data: { sigla: "X" } }))).rejects.toThrow();
  });

  it("RLS: ninguém apaga protocolo nem reescreve verificação; o protocolo não troca de departamento nem de cliente", async () => {
    await expect(tx("eng", (t) => t.protocolo.deleteMany({ where: { numero: { startsWith: marca } } }))).rejects.toThrow(/permission denied/);
    await expect(tx("eng", (t) => t.verificacaoDeProtocolo.updateMany({ where: { protocolo: { numero: { startsWith: marca } } }, data: { nota: "x" } }))).rejects.toThrow(/permission denied/);
    await expect(tx("eng", (t) => t.verificacaoDeProtocolo.deleteMany({ where: { protocolo: { numero: { startsWith: marca } } } }))).rejects.toThrow(/permission denied/);
    await expect(tx("eng", (t) => t.protocolo.updateMany({ where: { numero: `${marca}-1` }, data: { departamento: "energia-opm" } }))).rejects.toThrow();
    const outro = (await root.client.findFirstOrThrow({ where: { name: `${marca} Outro` }, select: { id: true } })).id;
    await expect(tx("eng", (t) => t.protocolo.updateMany({ where: { numero: `${marca}-1` }, data: { clientId: outro, consumerUnitId: ucOutra } }))).rejects.toThrow(/não mudam/);
  });

  it("na ficha da usina: os protocolos da UC em andamento; nulo sem a tela de protocolos", async () => {
    const daUc = await como("eng", () => servico.daUc(ucId, principal("eng")));
    expect(daUc!.map((p) => p.numero)).toEqual(expect.arrayContaining([`${marca}-1`, `${marca}-4`]));
    expect(daUc!.every((p) => p.departamento === "engenharia-obras" && p.situacao !== "liberado")).toBe(true);
    expect(await como("os", () => servico.daUc(ucId, principal("os")))).toBeNull();
  });

  it("busca de cliente com as UCs, para abrir o protocolo", async () => {
    const r = await como("opm", () => servico.clientes(`${marca} Cli`, principal("opm")));
    expect(r.itens).toEqual([{ id: clienteId, nome: `${marca} Cliente`, ucs: [expect.objectContaining({ id: ucId, distribuidora: "Amazonas Energia" })] }]);
  });
});
