import { randomBytes, randomUUID } from "node:crypto";

import { conferirPlataformaSchema, criarOrdemDeServicoSchema, criarUsinaSchema, importarUsinasSchema, type Acesso } from "@plugga/shared";
import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditAppender } from "../src/audit/audit-appender.js";
import { AcessoNegado, Conflito, RequisicaoInvalida } from "../src/common/errors/dominio.js";
import type { AuthPrincipal } from "../src/core/auth/auth.types.js";
import { PrismaEngenhariaRepository } from "../src/engenharia/prisma-engenharia.repository.js";
import { PrismaUsinasRepository } from "../src/engenharia/prisma-usinas.repository.js";
import { violouUsinaDoComissionamento } from "../src/engenharia/usinas.rules.js";
import { UsinasService } from "../src/engenharia/usinas.service.js";
import { contextoBanco } from "../src/prisma/contexto-banco.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { PrismaTarefasRepository } from "../src/tarefas/prisma-tarefas.repository.js";
import { TarefasService } from "../src/tarefas/tarefas.service.js";
import { assertSafeTestDatabaseUrl } from "./safe-test-environment";

/**
 * Usinas e monitoramento do dia (PLU-347) no Postgres, no login da aplicação
 * (com RLS): cadastro, a conferência por plataforma e empresa com a O.S. da
 * anomalia, a conferência que não se repete no dia, a tarefa automática que se
 * conclui sozinha e o recorte de acesso.
 *
 *     pnpm --filter @plugga/api test:usinas
 */
const HABILITADO = process.env.RUN_USINAS_INTEGRATION_TESTS === "true";
const PRAZO = 60_000;
// Segunda, 23/11/2026, 10:00 em Manaus.
const AGORA = new Date("2026-11-23T14:00:00Z");
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

describe.skipIf(!HABILITADO)("engenharia: usinas e monitoramento no Postgres", { timeout: PRAZO }, () => {
  const root = new PrismaClient();
  const marca = `usi_${randomBytes(6).toString("hex")}`;
  const login = `${marca}_app`;
  const pessoas = new Map<string, { id: string; hash: string; acesso: Acesso }>();
  const guardados: string[] = [];
  let app: PrismaService;
  let repo: PrismaUsinasRepository;
  let ordens: PrismaEngenhariaRepository;
  let servico: UsinasService;
  let clienteId: string;
  let ucId: string;
  let ucOutra: string;
  let plataformaId: string;
  let ambienteValidado = false;

  const principal = (nome: string): AuthPrincipal => ({ id: pessoas.get(nome)!.id, kind: "user", acesso: pessoas.get(nome)!.acesso });
  const como = <T>(nome: string, fazer: () => Promise<T>) => contextoBanco.run({ sessionHash: pessoas.get(nome)!.hash, agentHash: undefined }, fazer);
  const tx = <T>(nome: string, fazer: (t: Prisma.TransactionClient) => Promise<T>) => como(nome, () => app.comContexto(fazer));
  const novaUsina = (dados: Record<string, unknown> = {}, nome = "usinas") => como(nome, () => repo.criarUsina(criarUsinaSchema.parse({
    empresa: "waze", clienteId, ucId, nome: `${marca} telhado`, plataformaId, potenciaKwp: "12,4", fabricante: "Growatt", modelo: "MIN 10000", numeroSerie: "GRT-1", comissionadaEm: "2025-03-14", ...dados,
  }), principal(nome), AGORA));
  const conferir = (nome: string, resultados: unknown[], empresa = "waze") =>
    como(nome, () => servico.conferir(plataformaId, conferirPlataformaSchema.parse({ empresa, resultados }), { buffer: PNG, nomeOriginal: "print.png" }, principal(nome)));

  beforeAll(async () => {
    assertSafeTestDatabaseUrl(process.env.DATABASE_URL!, process.env.CI === "true", process.env.PLUGGA_TEST_DB_PORT);
    ambienteValidado = true;
    await root.$connect();
    if (!/^usi_[a-f0-9]+_app$/.test(login)) throw new Error("Login de fixture inválido");
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
    repo = new PrismaUsinasRepository(app, auditoria);
    ordens = new PrismaEngenhariaRepository(app, auditoria);
    const armazenamento = { enviar: async (chave: string) => { guardados.push(chave); }, excluir: async () => undefined, ler: async () => { throw new Error("sem leitura no teste"); } };
    const config = { get: (chave: string) => (chave === "ENGENHARIA_LIGADA" ? true : undefined) };
    const tarefas = new TarefasService(new PrismaTarefasRepository(app, auditoria), armazenamento as never, config as never, () => AGORA);
    servico = new UsinasService(repo, ordens, armazenamento as never, tarefas, () => AGORA);

    for (const id of ["plugga", "waze"]) await root.company.upsert({ where: { id }, create: { id, name: id }, update: {} });
    const perfis: Record<string, { departamento: string; nivel: "membro" | "gerente"; telas: string[] }> = {
      usinas: { departamento: "engenharia-obras", nivel: "membro", telas: ["engenharia-obras.usinas", "engenharia-obras.os"] },
      soUsinas: { departamento: "engenharia-obras", nivel: "membro", telas: ["engenharia-obras.usinas"] },
      os: { departamento: "engenharia-obras", nivel: "membro", telas: ["engenharia-obras.os"] },
      gerente: { departamento: "engenharia-obras", nivel: "gerente", telas: ["engenharia-obras.usinas"] },
      compras: { departamento: "suprimentos", nivel: "membro", telas: ["suprimentos.compras"] },
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
    ucId = (await root.consumerUnit.create({ data: { clientId: clienteId, code: `${marca}-uc`, distributor: "Amazonas Energia" } })).id;
    const outro = await root.client.create({ data: { name: `${marca} Outro` } });
    ucOutra = (await root.consumerUnit.create({ data: { clientId: outro.id, code: `${marca}-outra`, distributor: "x" } })).id;
    // Plataforma própria do teste: as outras usinas do banco não entram na conta do dia dela.
    plataformaId = `teste-${marca.slice(4)}`;
    await root.plataformaDeInversor.create({ data: { id: plataformaId, nome: `${marca} Plataforma`, ordem: 99 } });
  }, PRAZO);

  afterAll(async () => {
    await app?.$disconnect();
    if (ambienteValidado) {
      const clientes = (await root.client.findMany({ where: { name: { startsWith: marca } }, select: { id: true } })).map((c) => c.id);
      await root.$transaction(async (t) => {
        await t.$executeRawUnsafe("SET LOCAL session_replication_role = replica");
        await t.resultadoDaConferencia.deleteMany({ where: { usina: { clientId: { in: clientes } } } });
        await t.conferenciaDePlataforma.deleteMany({ where: { plataformaId } });
        const os = (await t.ordemDeServico.findMany({ where: { clientId: { in: clientes } }, select: { id: true } })).map((o) => o.id);
        await t.historicoDeOrdemDeServico.deleteMany({ where: { ordemId: { in: os } } });
        await t.ordemDeServico.deleteMany({ where: { id: { in: os } } });
        await t.usina.deleteMany({ where: { clientId: { in: clientes } } });
        await t.plataformaDeInversor.deleteMany({ where: { OR: [{ id: plataformaId }, { nome: { startsWith: marca } }] } });
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

  it("as 9 plataformas vêm semeadas, só pelo nome", async () => {
    const lista = await como("usinas", () => repo.plataformas());
    expect(lista.map((p) => p.id)).toEqual(expect.arrayContaining(["livoltek", "solarman", "solis", "solax", "goodwe", "fusionsolar", "growatt", "solplanet", "hypon-cloud"]));
    expect(lista.filter((p) => ["livoltek", "growatt"].includes(p.id)).every((p) => p.observacaoDeAcesso === null)).toBe(true);
  });

  it("cadastra a usina com a UC do cliente; recusa UC de outro, nome repetido na UC e quem não tem a tela de Usinas", async () => {
    const id = await novaUsina();
    const ficha = await como("os", () => repo.ficha(id, AGORA));
    expect(ficha.linha).toMatchObject({ nome: `${marca} telhado`, origem: "manual", ativa: true });
    expect(ficha.linha.potenciaKwp.toString()).toBe("12.4");
    expect(ficha.clientes.get(clienteId)).toBe(`${marca} Cliente`);
    await expect(novaUsina({ nome: `${marca} outra uc`, ucId: ucOutra })).rejects.toThrow(RequisicaoInvalida);
    await expect(novaUsina()).rejects.toThrow(Conflito);
    await expect(novaUsina({ nome: `${marca} sem tela` }, "os")).rejects.toThrow(/row-level security/);
    await expect(novaUsina({ nome: `${marca} futuro`, comissionadaEm: "2026-12-01" })).rejects.toThrow(RequisicaoInvalida);
  });

  it("confere a plataforma: o print sob a empresa, cada usina, a O.S. da anomalia e nada de repetir no dia", async () => {
    const segunda = await novaUsina({ nome: `${marca} garagem`, numeroSerie: "GRT-2" });
    const primeira = (await root.usina.findFirstOrThrow({ where: { nome: `${marca} telhado` }, select: { id: true } })).id;
    // Quem só tem Usinas registra a anomalia, mas não abre O.S.
    await expect(conferir("soUsinas", [{ usinaId: segunda, situacao: "anomalia", nota: "Geração 40% abaixo", abrirOs: true }])).rejects.toThrow(AcessoNegado);

    const dia = await conferir("usinas", [{ usinaId: segunda, situacao: "anomalia", nota: "Geração 40% abaixo", abrirOs: true }]);
    expect(guardados.at(-1)).toMatch(new RegExp(`^engenharia/monitoramento/waze/${plataformaId}/2026-11-23/`));
    const card = dia.cards.find((c) => c.plataforma.id === plataformaId && c.empresa === "waze")!;
    expect(card.conferencia).toMatchObject({ normais: 1, conferida: { por: { nome: `${marca} usinas` } } });
    expect([...card.conferencia!.usinasConferidas!].sort()).toEqual([primeira, segunda].sort());
    expect(card.conferencia!.excecoes).toEqual([expect.objectContaining({ usinaId: segunda, situacao: "anomalia", nota: "Geração 40% abaixo", ordem: expect.objectContaining({ codigo: expect.stringMatching(/^OS-/) }) })]);

    const os = await root.ordemDeServico.findFirstOrThrow({ where: { usinaId: segunda } });
    expect(os).toMatchObject({ origem: "monitoramento", tipo: "manutencao", situacao: "aberta", clientId: clienteId, consumerUnitId: ucId, equipamento: "Inversor", fabricante: "Growatt", numeroSerie: "GRT-2", descricao: "Geração 40% abaixo" });
    expect(await root.resultadoDaConferencia.count({ where: { usinaId: { in: [primeira, segunda] } } })).toBe(2);

    await expect(conferir("usinas", [])).rejects.toThrow(Conflito);
    const ficha = await como("usinas", () => servico.usina(segunda, principal("usinas")));
    expect(ficha.ultimoMonitoramento).toMatchObject({ dia: "2026-11-23", situacao: "anomalia" });
    expect(ficha.osAbertas).toBe(1);
    expect(ficha.ordens.map((o) => o.id)).toEqual([os.id]);
    expect(ficha.acoesPermitidas).toEqual(["editar", "abrir_os"]);
    // O evento não leva o nome do print nem a nota.
    const eventos = await root.eventLog.findMany({ where: { eventName: "engenharia.plataforma.conferida", actorId: pessoas.get("usinas")!.id } });
    expect(JSON.stringify(eventos)).not.toMatch(/print\.png|40%/);
  });

  it("com todas as plataformas do dia conferidas, a tarefa automática do monitoramento se conclui sozinha", async () => {
    const usina = await novaUsina({ empresa: "plugga", nome: `${marca} plugga` });
    expect(usina).toBeTruthy();
    const tarefa = await root.tarefa.create({ data: {
      departamento: "engenharia-obras", titulo: `${marca} monitoramento`, empresa: "ambas", responsavelId: pessoas.get("usinas")!.id, tipo: "recorrente",
      regra: { recorrencia: "dia_util" }, dia: new Date("2026-11-23T04:00:00Z"), horarioLimite: "12:00", exigeEvidencia: true, exigeResultado: false,
      automacao: "engenharia.monitoramento_do_dia", origem: "do_departamento", criadoPorId: pessoas.get("usinas")!.id,
    } });
    // As outras usinas do banco (de outras suítes) também contam: conferidas aqui, o dia fecha.
    const resumo = await como("usinas", () => repo.resumoDoDia(undefined, "2026-11-23"));
    for (const pendente of resumo.pendentes.filter((p) => p.plataforma !== `${marca} Plataforma` || p.empresa !== "plugga")) {
      const plat = (await root.plataformaDeInversor.findFirstOrThrow({ where: { nome: pendente.plataforma }, select: { id: true } })).id;
      await como("usinas", () => servico.conferir(plat, conferirPlataformaSchema.parse({ empresa: pendente.empresa }), { buffer: PNG, nomeOriginal: "p.png" }, principal("usinas")));
    }
    const pendenteAntes = await root.ocorrenciaDeTarefa.findFirst({ where: { tarefaId: tarefa.id, concluidaEm: { not: null } } });
    expect(pendenteAntes).toBeNull();
    await conferir("usinas", [], "plugga");
    const ocorrencia = await root.ocorrenciaDeTarefa.findFirstOrThrow({ where: { tarefaId: tarefa.id, dia: new Date("2026-11-23T04:00:00Z") } });
    expect(ocorrencia).toMatchObject({ automatica: true, concluidaPorId: pessoas.get("usinas")!.id });
    expect(ocorrencia.concluidaEm).toEqual(AGORA);
    const vg = await como("usinas", () => repo.resumoDoDia(undefined, "2026-11-23"));
    expect(vg.conferidas).toBe(vg.total);
    expect(vg.usinasComAtencao).toBeGreaterThanOrEqual(1);
  });

  it("plataformas: só o gerente com Usinas cria e muda; a observação recusa senha", async () => {
    await expect(como("usinas", () => servico.criarPlataforma({ nome: `${marca} Nova`, observacaoDeAcesso: null }, principal("usinas")))).rejects.toThrow(AcessoNegado);
    await expect(como("gerente", () => servico.criarPlataforma({ nome: `${marca} Nova`, observacaoDeAcesso: "senha: 1234" }, principal("gerente")))).rejects.toThrow(RequisicaoInvalida);
    const lista = await como("gerente", () => servico.criarPlataforma({ nome: `${marca} Nova`, observacaoDeAcesso: "Login da Waze no cofre" }, principal("gerente")));
    expect(lista.podeEditar).toBe(true);
    expect(lista.itens.find((p) => p.nome === `${marca} Nova`)).toMatchObject({ observacaoDeAcesso: "Login da Waze no cofre", usinas: 0, potenciaKwp: "0", ativa: true });
    await expect(tx("usinas", (t) => t.plataformaDeInversor.update({ where: { id: plataformaId }, data: { observacaoDeAcesso: "x" } }))).rejects.toThrow();
  });

  it("RLS: fora da Engenharia não lê; ninguém apaga nem reescreve conferência ou resultado; a usina não troca de cliente", async () => {
    expect(await tx("compras", (t) => t.usina.count({ where: { nome: { startsWith: marca } } }))).toBe(0);
    expect(await tx("compras", (t) => t.conferenciaDePlataforma.count({ where: { plataformaId } }))).toBe(0);
    expect(await tx("os", (t) => t.usina.count({ where: { nome: { startsWith: marca } } }))).toBeGreaterThan(0);
    await expect(tx("usinas", (t) => t.conferenciaDePlataforma.deleteMany({ where: { plataformaId } }))).rejects.toThrow(/permission denied/);
    await expect(tx("usinas", (t) => t.resultadoDaConferencia.updateMany({ where: { conferencia: { plataformaId } }, data: { nota: "x" } }))).rejects.toThrow(/permission denied/);
    await expect(tx("usinas", (t) => t.usina.deleteMany({ where: { nome: { startsWith: marca } } }))).rejects.toThrow(/permission denied/);
    const outro = (await root.client.findFirstOrThrow({ where: { name: `${marca} Outro` }, select: { id: true } })).id;
    await expect(tx("usinas", (t) => t.usina.updateMany({ where: { nome: `${marca} telhado` }, data: { clientId: outro } }))).rejects.toThrow(/não mudam/);
  });

  it("uma usina por O.S. de comissionamento: a ficha da O.S. mostra a usina e a segunda é recusada", async () => {
    const osId = await como("usinas", () => ordens.criar(criarOrdemDeServicoSchema.parse({
      empresa: "waze", tipo: "comissionamento", clienteId, ucId, descricao: `${marca} comissionamento`, prazo: "2026-11-30",
    }), principal("usinas"), AGORA));
    // Concluída direto no banco: o fluxo de campo tem os próprios testes.
    await root.$transaction(async (t) => {
      await t.$executeRawUnsafe("SET LOCAL session_replication_role = replica");
      await t.ordemDeServico.update({ where: { id: osId }, data: { situacao: "concluida", concluidaEm: AGORA, laudoEncontrado: "Instalação pronta", laudoFeito: "Comissionada", laudoEm: AGORA } });
    });
    expect((await como("usinas", () => ordens.ficha(osId))).linha.usinasComissionadas).toEqual([]);
    const id = await novaUsina({ nome: `${marca} do comissionamento`, ordemDeComissionamentoId: osId });
    expect((await como("usinas", () => ordens.ficha(osId))).linha.usinasComissionadas).toEqual([{ id, nome: `${marca} do comissionamento` }]);
    await expect(novaUsina({ nome: `${marca} segunda do comissionamento`, ordemDeComissionamentoId: osId })).rejects.toThrow(/já tem usina/);
    // O índice único parcial segura mesmo sem a checagem do repositório.
    const erro = await root.usina.create({ data: {
      companyId: "waze", clientId: clienteId, consumerUnitId: ucId, nome: `${marca} direto`, plataformaId, potenciaKwp: "1", comissionadaEm: AGORA, origem: "comissionamento", ordemDeComissionamentoId: osId,
    } }).catch((e: unknown) => e);
    expect(erro).toMatchObject({ code: "P2002" });
    // E a corrida responde com a mensagem do comissionamento, não a da UC.
    expect(violouUsinaDoComissionamento((erro as Prisma.PrismaClientKnownRequestError).meta)).toBe(true);
  });

  it("a busca de cliente da Nova usina abre para quem tem só a tela de Usinas", async () => {
    const r = await como("soUsinas", () => servico.buscarClientes(`${marca} Cli`, principal("soUsinas")));
    expect(r.itens).toEqual([{ id: clienteId, nome: `${marca} Cliente`, ucs: [expect.objectContaining({ id: ucId })] }]);
    await expect(como("os", () => servico.buscarClientes(`${marca} Cli`, principal("os")))).rejects.toThrow(AcessoNegado);
  });

  it("a O.S. só se liga a usina ativa do mesmo cliente e da mesma empresa, e herda o equipamento", async () => {
    const usina = (await root.usina.findFirstOrThrow({ where: { nome: `${marca} telhado` }, select: { id: true } })).id;
    const criar = (dados: Record<string, unknown>) => como("usinas", () => ordens.criar(criarOrdemDeServicoSchema.parse({
      empresa: "waze", tipo: "manutencao", clienteId, descricao: `${marca} pela usina`, prazo: "2026-11-30", usinaId: usina, ...dados,
    }), principal("usinas"), AGORA));
    await expect(criar({ empresa: "plugga" })).rejects.toThrow(RequisicaoInvalida);
    const outro = (await root.client.findFirstOrThrow({ where: { name: `${marca} Outro` }, select: { id: true } })).id;
    await expect(criar({ clienteId: outro })).rejects.toThrow(RequisicaoInvalida);
    const id = await criar({});
    expect(await root.ordemDeServico.findUniqueOrThrow({ where: { id } })).toMatchObject({ usinaId: usina, equipamento: "Inversor", fabricante: "Growatt", numeroSerie: "GRT-1" });
  });

  it("importa a planilha (sintética): confere sem gravar, aponta os erros e grava as prontas com a origem importação", async () => {
    const planilha = [
      "Cliente;UC;Usina;Plataforma;kWp;Comissionamento",
      `${marca} Cliente;${marca}-uc;${marca} importada;${marca} Plataforma;8,5;10/01/2025`,
      `${marca} Cliente;${marca}-uc;${marca} telhado;${marca} Plataforma;12,4;14/03/2025`,
      `${marca} Ninguém;123;${marca} x;${marca} Plataforma;5;`,
      `${marca} Cliente;${marca}-outra;${marca} y;Inexistente;5;`,
      `${marca} Cliente;${marca}-uc;${marca} importada;${marca} Plataforma;8,5;10/01/2025`,
    ].join("\n");
    const importar = (gravar: "sim" | "nao") => como("usinas", () => servico.importar(importarUsinasSchema.parse({ empresaPadrao: "waze", gravar }), { buffer: Buffer.from(planilha, "utf8"), nomeOriginal: "levantamento.csv" }, principal("usinas")));

    const conferencia = await importar("nao");
    expect(conferencia).toMatchObject({ gravou: false, resumo: { linhas: 5, prontas: 1, jaExistem: 1, erros: 3, gravadas: 0 } });
    expect(conferencia.linhas.map((l) => l.situacao)).toEqual(["pronta", "ja_existe", "erro", "erro", "erro"]);
    expect(conferencia.linhas[2]!.problemas).toContain("cliente não encontrado no cadastro (nome exato)");
    expect(conferencia.linhas[3]!.problemas).toEqual(expect.arrayContaining(["UC não é do cliente", "plataforma desconhecida"]));
    expect(conferencia.linhas[4]!.problemas).toContain("usina repetida na planilha");
    expect(await root.usina.count({ where: { nome: `${marca} importada` } })).toBe(0);

    const gravada = await importar("sim");
    expect(gravada).toMatchObject({ gravou: true, resumo: { gravadas: 1, prontas: 0 } });
    expect(await root.usina.findFirstOrThrow({ where: { nome: `${marca} importada` } })).toMatchObject({ origem: "importacao", companyId: "waze", consumerUnitId: ucId });
    // De novo, a mesma linha já existe.
    expect((await importar("nao")).linhas[0]!.situacao).toBe("ja_existe");
    await expect(como("os", () => servico.importar(importarUsinasSchema.parse({ empresaPadrao: "waze" }), { buffer: Buffer.from(planilha), nomeOriginal: "x.csv" }, principal("os")))).rejects.toThrow(AcessoNegado);
    await expect(como("usinas", () => servico.importar(importarUsinasSchema.parse({ empresaPadrao: "waze" }), { buffer: Buffer.from("A;B\n1;2"), nomeOriginal: "x.csv" }, principal("usinas")))).rejects.toThrow(RequisicaoInvalida);
  });

  it("importa uma planilha grande (2000 linhas, 500 clientes, sintética) numa transação, em dry-run e gravando", async () => {
    const clientes = Array.from({ length: 500 }, (_, i) => ({ id: randomUUID(), name: `${marca} Carga ${String(i).padStart(3, "0")}` }));
    await root.client.createMany({ data: clientes });
    await root.consumerUnit.createMany({ data: clientes.flatMap((c, i) => Array.from({ length: 4 }, (_, k) => ({ clientId: c.id, code: `${marca}-c${i}-${k}`, distributor: "x" }))) });
    const linhas = ["Cliente;UC;Usina;Plataforma;kWp"];
    clientes.forEach((c, i) => { for (let k = 0; k < 4; k += 1) linhas.push(`${c.name};${marca}-c${i}-${k};Usina ${k};${marca} Plataforma;${5 + k},5`); });
    const planilha = Buffer.from(linhas.join("\n"), "utf8");
    const importar = (gravar: "sim" | "nao") => como("usinas", () => servico.importar(importarUsinasSchema.parse({ empresaPadrao: "waze", gravar }), { buffer: planilha, nomeOriginal: "carga.csv" }, principal("usinas")));

    const inicio = Date.now();
    const conferencia = await importar("nao");
    const conferir = Date.now() - inicio;
    expect(conferencia.resumo).toMatchObject({ linhas: 2000, prontas: 2000, erros: 0 });
    const meio = Date.now();
    const gravada = await importar("sim");
    const gravar = Date.now() - meio;
    expect(gravada.resumo).toMatchObject({ gravadas: 2000, erros: 0 });
    expect(await root.usina.count({ where: { clientId: { in: clientes.map((c) => c.id) }, origem: "importacao" } })).toBe(2000);
    // Bem abaixo dos 60 s da transação da importação (e dos 5 s padrão do Prisma, que derrubavam a versão por linha).
    expect(conferir).toBeLessThan(15_000);
    expect(gravar).toBeLessThan(30_000);
  });
});
