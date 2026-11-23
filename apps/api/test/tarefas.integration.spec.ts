import { randomBytes } from "node:crypto";

import { criarTarefaSchema, listarTarefasQuerySchema, type Acesso } from "@plugga/shared";
import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditAppender } from "../src/audit/audit-appender.js";
import { RequisicaoInvalida } from "../src/common/errors/dominio.js";
import type { AuthPrincipal } from "../src/core/auth/auth.types.js";
import { contextoBanco } from "../src/prisma/contexto-banco.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { PrismaTarefasRepository } from "../src/tarefas/prisma-tarefas.repository.js";
import { TarefasService } from "../src/tarefas/tarefas.service.js";
import { assertSafeTestDatabaseUrl } from "./safe-test-environment";

/**
 * Tarefas dos departamentos (PLU-349, PLU-340) no Postgres, no login da
 * aplicação (com RLS): geração idempotente por dia, cada dia não feito vira uma
 * ocorrência atrasada, conclusão com o que a tarefa pede, encerramento,
 * automática, filtros e o recorte por departamento.
 *
 *     pnpm --filter @plugga/api test:tarefas
 */
const HABILITADO = process.env.RUN_TAREFAS_INTEGRATION_TESTS === "true";
const PRAZO = 60_000;
// Quarta, 25/11/2026, 10:00 em Manaus.
const AGORA = new Date("2026-11-25T14:00:00Z");

describe.skipIf(!HABILITADO)("tarefas: ocorrências no Postgres", { timeout: PRAZO }, () => {
  const root = new PrismaClient();
  const marca = `tar_${randomBytes(6).toString("hex")}`;
  const login = `${marca}_app`;
  const pessoas = new Map<string, { id: string; hash: string; acesso: Acesso }>();
  let app: PrismaService;
  let repo: PrismaTarefasRepository;
  let servico: TarefasService;
  let ambienteValidado = false;

  const principal = (nome: string): AuthPrincipal => ({ id: pessoas.get(nome)!.id, kind: "user", acesso: pessoas.get(nome)!.acesso });
  const como = <T>(nome: string, fazer: () => Promise<T>) => contextoBanco.run({ sessionHash: pessoas.get(nome)!.hash, agentHash: undefined }, fazer);
  const tx = <T>(nome: string, fazer: (t: Prisma.TransactionClient) => Promise<T>) => como(nome, () => app.comContexto(fazer));
  const lista = (nome: string, query: Record<string, unknown> = {}) => como(nome, () => servico.listar("engenharia-obras", listarTarefasQuerySchema.parse(query), principal(nome)));
  const criar = (dados: Record<string, unknown>, nome = "eng") => como(nome, () => servico.criar("engenharia-obras", criarTarefaSchema.parse({
    titulo: `${marca} tarefa`, empresa: "waze", responsavelId: pessoas.get("eng")!.id, horarioLimite: "12:00", exigeEvidencia: false, exigeResultado: true, ...dados,
  }), principal(nome)));
  const doTeste = <T extends { titulo: string }>(itens: T[]) => itens.filter((i) => i.titulo.startsWith(marca));
  /** Fixture que muda o que a aplicação não muda (o início, a automação): como dono, sem os gatilhos. */
  const semGatilho = (fazer: (t: Prisma.TransactionClient) => Promise<unknown>) =>
    root.$transaction(async (t) => {
      await t.$executeRawUnsafe("SET LOCAL session_replication_role = replica");
      await fazer(t);
    });

  beforeAll(async () => {
    assertSafeTestDatabaseUrl(process.env.DATABASE_URL!, process.env.CI === "true", process.env.PLUGGA_TEST_DB_PORT);
    ambienteValidado = true;
    await root.$connect();
    if (!/^tar_[a-f0-9]+_app$/.test(login)) throw new Error("Login de fixture inválido");
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
    repo = new PrismaTarefasRepository(app, new AuditAppender());
    const config = { get: (chave: string) => (chave === "ENGENHARIA_LIGADA" || chave === "FINANCEIRO_LIGADO" ? true : undefined) };
    servico = new TarefasService(repo, {} as never, config as never, () => AGORA);

    for (const id of ["plugga", "waze"]) await root.company.upsert({ where: { id }, create: { id, name: id }, update: {} });
    const perfis: Record<string, { departamento: string; nivel: "membro" | "gerente"; telas: string[] }> = {
      eng: { departamento: "engenharia-obras", nivel: "membro", telas: ["engenharia-obras.os"] },
      colega: { departamento: "engenharia-obras", nivel: "membro", telas: ["engenharia-obras.usinas"] },
      gerente: { departamento: "engenharia-obras", nivel: "gerente", telas: ["engenharia-obras.os"] },
      financeiro: { departamento: "financeiro", nivel: "gerente", telas: ["financeiro.pagar"] },
    };
    for (const [nome, perfil] of Object.entries(perfis)) {
      const pessoa = await root.user.create({ data: { name: `${marca} ${nome}`, email: `${marca}-${nome}@teste.local` } });
      const hash = randomBytes(32).toString("hex");
      await root.session.create({ data: { userId: pessoa.id, tokenHash: hash, expiresAt: new Date(Date.now() + 3_600_000), absoluteExpiresAt: new Date(Date.now() + 7_200_000) } });
      await root.userDepartamento.create({ data: { userId: pessoa.id, departamento: perfil.departamento, nivel: perfil.nivel, telas: perfil.telas } });
      pessoas.set(nome, { id: pessoa.id, hash, acesso: { plataforma: null, departamentos: [{ departamento: perfil.departamento, nivel: perfil.nivel, telas: perfil.telas }] } as Acesso });
    }
  }, PRAZO);

  afterAll(async () => {
    await app?.$disconnect();
    if (ambienteValidado) {
      const tarefas = (await root.tarefa.findMany({ where: { titulo: { startsWith: marca } }, select: { id: true } })).map((t) => t.id);
      await root.$transaction(async (t) => {
        await t.$executeRawUnsafe("SET LOCAL session_replication_role = replica");
        await t.evidenciaDeTarefa.deleteMany({ where: { ocorrencia: { tarefaId: { in: tarefas } } } });
        await t.ocorrenciaDeTarefa.deleteMany({ where: { tarefaId: { in: tarefas } } });
        await t.tarefa.deleteMany({ where: { id: { in: tarefas } } });
      });
      await root.user.deleteMany({ where: { email: { startsWith: marca } } });
      await root.$executeRawUnsafe(`DROP ROLE IF EXISTS "${login}"`);
    }
    await root.$disconnect();
  }, PRAZO);

  it("a recorrente gera um dia por vez, sem repetir, e cada dia não feito vira uma atrasada", async () => {
    const tarefa = await criar({ titulo: `${marca} diária`, tipo: "recorrente", regra: { recorrencia: "dia_util" }, inicio: "2026-11-25" });
    expect(tarefa.recorrenciaTexto).toBe("Todo dia útil, até 12:00");
    expect(tarefa.proximas.slice(0, 3)).toEqual(["2026-11-25", "2026-11-26", "2026-11-27"]);
    // Como se tivesse começado na segunda passada, sem ninguém abrir a tela.
    await semGatilho(async (t) => {
      await t.ocorrenciaDeTarefa.deleteMany({ where: { tarefaId: tarefa.id } });
      await t.tarefa.update({ where: { id: tarefa.id }, data: { dia: new Date("2026-11-16T04:00:00Z"), geradaAte: null } });
    });

    const [a, b] = await Promise.all([lista("eng", { periodo: "todas" }), lista("colega", { periodo: "todas" })]);
    const dias = doTeste(a.itens).filter((o) => o.tarefaId === tarefa.id).map((o) => o.dia);
    // 16 a 20 e 23 a 27: dez dias úteis até o fim da semana, cada um uma vez.
    expect(dias).toHaveLength(10);
    expect(new Set(dias).size).toBe(10);
    expect(doTeste(b.itens).filter((o) => o.tarefaId === tarefa.id)).toHaveLength(10);
    expect(await root.ocorrenciaDeTarefa.count({ where: { tarefaId: tarefa.id } })).toBe(10);

    const atrasadas = doTeste((await lista("eng", { periodo: "atrasadas" })).itens).filter((o) => o.tarefaId === tarefa.id);
    // 16 a 20, 23 e 24, e a de hoje ainda não (vence às 12:00).
    expect(atrasadas.map((o) => o.dia)).toEqual(["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-23", "2026-11-24"]);
    const hoje = doTeste((await lista("eng")).itens).filter((o) => o.tarefaId === tarefa.id);
    expect(hoje).toHaveLength(8);
    expect(hoje.find((o) => o.dia === "2026-11-25")).toMatchObject({ situacao: "vence_hoje", coluna: "pendentes", acoesPermitidas: ["concluir", "encerrar"] });
  });

  it("conclui com o que a tarefa pede, guarda o checklist, e a concluída não muda", async () => {
    const tarefa = await criar({ titulo: `${marca} única`, tipo: "unica", data: "2026-11-25", exigeEvidencia: false, exigeResultado: true, instrucoes: ["Exportar", "Enviar"] });
    const [ocorrencia] = doTeste((await lista("eng")).itens).filter((o) => o.tarefaId === tarefa.id);
    await expect(como("eng", () => servico.concluir("engenharia-obras", ocorrencia!.id, {}, undefined, principal("eng")))).rejects.toThrow(RequisicaoInvalida);
    const concluida = await como("colega", () => servico.concluir("engenharia-obras", ocorrencia!.id, { resultado: "Enviado ao cliente", checklist: [0, 1] }, undefined, principal("colega")));
    expect(concluida).toMatchObject({
      situacao: "concluida", coluna: "concluidas",
      conclusao: { resultado: "Enviado ao cliente", por: { nome: `${marca} colega` }, checklist: [{ texto: "Exportar", feito: true }, { texto: "Enviar", feito: true }], automatica: false },
    });
    await expect(tx("eng", (t) => t.ocorrenciaDeTarefa.update({ where: { id: ocorrencia!.id }, data: { resultado: "outro" } }))).rejects.toThrow(/não muda/);
    const eventos = await root.eventLog.findMany({ where: { entityType: "ocorrencia_de_tarefa", entityId: ocorrencia!.id } });
    expect(JSON.stringify(eventos)).not.toMatch(/Enviado ao cliente/);
  });

  it("conclui com evidência: guarda o arquivo na ocorrência, e depois de concluída não aceita mais evidência", async () => {
    const tarefa = await criar({ titulo: `${marca} com evidência`, tipo: "unica", data: "2026-11-25", exigeEvidencia: true, exigeResultado: true, instrucoes: ["Anexar o print"] });
    const [ocorrencia] = doTeste((await lista("eng")).itens).filter((o) => o.tarefaId === tarefa.id);
    const evidencia = { chave: `${marca}/print.png`, nome: "print.png", tamanho: 10, tipo: "image/png" };
    const conferir = () => undefined;
    await como("eng", () => repo.concluir("engenharia-obras", ocorrencia!.id, { resultado: "Conferido", checklist: [0], evidencia }, principal("eng"), AGORA, conferir));
    const { linha } = await como("eng", () => repo.ocorrencia("engenharia-obras", ocorrencia!.id));
    expect(linha.concluidaEm).toEqual(AGORA);
    expect(linha.evidencias).toEqual([expect.objectContaining({ arquivoNome: "print.png", arquivoTipo: "image/png", enviadoPorId: pessoas.get("eng")!.id })]);
    await expect(tx("eng", (t) => t.evidenciaDeTarefa.create({ data: { ocorrenciaId: ocorrencia!.id, arquivoChave: "x", arquivoNome: "x.png", arquivoTamanho: 1, arquivoTipo: "image/png", enviadoPorId: pessoas.get("eng")!.id } }))).rejects.toThrow(/row-level security/);
  });

  it("encerra quem criou ou o gerente; as pendentes de hoje em diante saem da lista", async () => {
    const tarefa = await criar({ titulo: `${marca} encerrar`, tipo: "recorrente", regra: { recorrencia: "dia_util" }, inicio: "2026-11-25" }, "colega");
    await expect(como("eng", () => servico.encerrar("engenharia-obras", tarefa.id, "não precisa mais", principal("eng")))).rejects.toThrow(/quem criou/);
    const encerrada = await como("gerente", () => servico.encerrar("engenharia-obras", tarefa.id, "não precisa mais", principal("gerente")));
    expect(encerrada).toMatchObject({ encerrada: { motivo: "não precisa mais", por: { nome: `${marca} gerente` } }, proximas: [] });
    expect(doTeste((await lista("eng", { periodo: "todas" })).itens).filter((o) => o.tarefaId === tarefa.id)).toEqual([]);
    await expect(tx("gerente", (t) => t.tarefa.update({ where: { id: tarefa.id }, data: { titulo: "outro" } }))).rejects.toThrow(/só é encerrada/);
  });

  it("a automática não se conclui pela tela; o sistema conclui a do dia", async () => {
    const tarefa = await criar({ titulo: `${marca} monitoramento`, tipo: "recorrente", regra: { recorrencia: "dia_util" }, inicio: "2026-11-25", exigeEvidencia: true, exigeResultado: false, atalho: "usinas" });
    await semGatilho((t) => t.tarefa.update({ where: { id: tarefa.id }, data: { automacao: "engenharia.monitoramento_do_dia", origem: "do_departamento" } }));
    const [ocorrencia] = doTeste((await lista("eng")).itens).filter((o) => o.tarefaId === tarefa.id);
    expect(ocorrencia).toMatchObject({ automacao: "engenharia.monitoramento_do_dia", atalho: "usinas", acoesPermitidas: [] });
    await expect(como("eng", () => servico.concluir("engenharia-obras", ocorrencia!.id, { resultado: "x" }, undefined, principal("eng")))).rejects.toThrow(/sozinha/);
    expect(await como("eng", () => servico.concluirAutomatica("engenharia-obras", "engenharia.monitoramento_do_dia", "2026-11-25", principal("eng")))).toBe(1);
    const depois = doTeste((await lista("eng")).itens).find((o) => o.id === ocorrencia!.id);
    expect(depois).toMatchObject({ situacao: "concluida", conclusao: { automatica: true } });
  });

  it("filtra por empresa (com as das duas), responsável ou substituto, e categoria", async () => {
    await criar({ titulo: `${marca} plugga`, tipo: "unica", data: "2026-11-26", empresa: "plugga", categoria: "CCEE" });
    await criar({ titulo: `${marca} ambas`, tipo: "unica", data: "2026-11-26", empresa: "ambas", substitutoId: pessoas.get("colega")!.id });
    const plugga = doTeste((await lista("eng", { periodo: "semana", empresa: "plugga" })).itens).map((o) => o.titulo);
    expect(plugga).toEqual(expect.arrayContaining([`${marca} plugga`, `${marca} ambas`]));
    expect(plugga).not.toContain(`${marca} diária`);
    expect(doTeste((await lista("eng", { periodo: "semana", responsavelId: pessoas.get("colega")!.id })).itens).map((o) => o.titulo)).toContain(`${marca} ambas`);
    expect(doTeste((await lista("eng", { periodo: "semana", categoria: "ccee" })).itens).map((o) => o.titulo)).toEqual([`${marca} plugga`]);
    const opcoes = await como("eng", () => servico.opcoes("engenharia-obras", principal("eng")));
    expect(opcoes.categorias).toContain("CCEE");
    expect(opcoes.pessoas.map((p) => p.nome)).toEqual(expect.arrayContaining([`${marca} eng`, `${marca} colega`, `${marca} gerente`]));
    expect(opcoes.pessoas.map((p) => p.nome)).not.toContain(`${marca} financeiro`);
  });

  it("RLS: outro departamento não vê nem cria; ninguém apaga; responsável precisa ser do departamento", async () => {
    expect(await tx("financeiro", (t) => t.tarefa.count({ where: { titulo: { startsWith: marca } } }))).toBe(0);
    expect(await tx("financeiro", (t) => t.ocorrenciaDeTarefa.count({ where: { tarefa: { titulo: { startsWith: marca } } } }))).toBe(0);
    const fin = pessoas.get("financeiro")!.id;
    await expect(tx("financeiro", (t) => t.tarefa.create({ data: {
      departamento: "engenharia-obras", titulo: `${marca} intrusa`, empresa: "waze", responsavelId: fin, tipo: "unica", dia: AGORA, horarioLimite: "12:00", exigeEvidencia: true, exigeResultado: false, criadoPorId: fin,
    } }))).rejects.toThrow(/row-level security/);
    await expect(tx("eng", (t) => t.tarefa.deleteMany({ where: { titulo: { startsWith: marca } } }))).rejects.toThrow(/permission denied/);
    await expect(tx("eng", (t) => t.ocorrenciaDeTarefa.deleteMany({ where: { tarefa: { titulo: { startsWith: marca } } } }))).rejects.toThrow(/permission denied/);
    await expect(criar({ titulo: `${marca} de fora`, tipo: "unica", data: "2026-11-26", responsavelId: fin })).rejects.toThrow(RequisicaoInvalida);
    await expect(criar({ titulo: `${marca} passado`, tipo: "unica", data: "2026-11-24" })).rejects.toThrow(RequisicaoInvalida);
  });
});
