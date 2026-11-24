import { createHash, randomBytes } from "node:crypto";

import { PRAZO_PADRAO_DO_TIPO, criarOrdemDeServicoSchema, criarOrdemPeloAgenteSchema, type AcaoDeAgente, type Acesso } from "@plugga/shared";
import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditAppender } from "../src/audit/audit-appender.js";
import { AcessoNegado, Conflito, NaoProcessavel } from "../src/common/errors/dominio.js";
import { adicionarDiasUteis, diaEmManaus } from "../src/compras/dias-uteis.js";
import type { AuthPrincipal } from "../src/core/auth/auth.types.js";
import { OrdensPeloAgenteService } from "../src/engenharia/ordens-pelo-agente.service.js";
import { PrismaEngenhariaRepository } from "../src/engenharia/prisma-engenharia.repository.js";
import { PrismaOrdensPeloAgenteRepository } from "../src/engenharia/prisma-ordens-pelo-agente.repository.js";
import { contextoBanco } from "../src/prisma/contexto-banco.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { assertSafeTestDatabaseUrl } from "./safe-test-environment";

/**
 * Entrada de O.S. pelo robô (PLU-351) no Postgres, no login da aplicação (com
 * RLS) e com identidades de agente reais (token em hash): escopo por ação,
 * chave natural, idempotência (inclusive na corrida) e a origem gravada só na O.S.
 *
 *     pnpm --filter @plugga/api test:agentes
 */
const HABILITADO = process.env.RUN_AGENTES_INTEGRATION_TESTS === "true";
const PRAZO = 60_000;
// Segunda, 23/11/2026, 10:00 em Manaus.
const AGORA = new Date("2026-11-23T14:00:00Z");
const TELAS_OS = ["engenharia-obras.os"];

describe.skipIf(!HABILITADO)("O.S. pelo robô (API de agente) no Postgres", { timeout: PRAZO }, () => {
  const root = new PrismaClient();
  const marca = `rob_${randomBytes(6).toString("hex")}`;
  const login = `${marca}_app`;
  // Sintéticos, na faixa 9999: documentos e códigos de UC.
  const sufixo = String(Date.now()).slice(-6);
  const DOC_A = `9999${sufixo}0001`;
  const DOC_B = `9999${sufixo}0002`;
  const UC_UNICA = `9999${sufixo}11`;
  const UC_REPETIDA = `9999${sufixo}22`;
  const identidades = new Map<string, { principal: AuthPrincipal; tokenHash?: string; sessionHash?: string }>();
  let app: PrismaService;
  let servico: OrdensPeloAgenteService;
  let ordens: PrismaEngenhariaRepository;
  let clienteA: string;
  let ucUnica: string;
  let ambienteValidado = false;

  const como = <T>(nome: string, fazer: () => Promise<T>) => {
    const i = identidades.get(nome)!;
    return contextoBanco.run({ sessionHash: i.sessionHash, agentHash: i.tokenHash }, fazer);
  };
  const tx = <T>(nome: string, fazer: (t: Prisma.TransactionClient) => Promise<T>) => como(nome, () => app.comContexto(fazer));
  const pedido = (dados: Record<string, unknown> = {}) => criarOrdemPeloAgenteSchema.parse({
    empresa: "waze", tipo: "manutencao", descricao: `${marca} inversor sem comunicação`, uc: UC_UNICA,
    origem: { canal: "telegram", grupo: `${marca} ENGENHARIA E OBRAS`, solicitante: `${marca} Técnico Fulano` }, ...dados,
  });
  const criar = (chave: string, dados: Record<string, unknown> = {}, nome = "robo") => como(nome, () => servico.criar(chave, pedido(dados), identidades.get(nome)!.principal));

  async function agente(nome: string, departamento: string, telas: string[], acoes: AcaoDeAgente[]): Promise<void> {
    const user = await root.user.create({ data: { name: `${marca} ${nome}`, email: `${marca}-${nome.toLowerCase()}@teste.local` } });
    const tokenHash = createHash("sha256").update(randomBytes(32)).digest("hex");
    await root.$transaction(async (t) => {
      await t.userDepartamento.create({ data: { userId: user.id, departamento, nivel: "membro", telas } });
      await t.agentIdentity.create({ data: { userId: user.id, departamento, tokenHash, credentialExpiresAt: new Date(Date.now() + 3_600_000), acoes } });
    });
    const acesso = { plataforma: null, departamentos: [{ departamento, nivel: "membro", telas }] } as Acesso;
    identidades.set(nome, { principal: { id: user.id, kind: "service", acesso, acoesDeAgente: acoes }, tokenHash });
  }

  beforeAll(async () => {
    assertSafeTestDatabaseUrl(process.env.DATABASE_URL!, process.env.CI === "true", process.env.PLUGGA_TEST_DB_PORT);
    ambienteValidado = true;
    await root.$connect();
    if (!/^rob_[a-f0-9]+_app$/.test(login)) throw new Error("Login de fixture inválido");
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
    url.searchParams.set("connection_limit", "4");
    app = new PrismaService({ datasources: { db: { url: url.toString() } } });
    const auditoria = new AuditAppender();
    ordens = new PrismaEngenhariaRepository(app, auditoria);
    servico = new OrdensPeloAgenteService(new PrismaOrdensPeloAgenteRepository(app, auditoria), ordens, () => AGORA);

    for (const id of ["plugga", "waze"]) await root.company.upsert({ where: { id }, create: { id, name: id }, update: {} });
    await agente("robo", "engenharia-obras", TELAS_OS, ["engenharia.ordem.criar"]);
    await agente("semAcao", "engenharia-obras", TELAS_OS, []);
    await agente("outro", "engenharia-obras", TELAS_OS, ["engenharia.ordem.criar"]);
    // Pessoa da Engenharia (sessão), para conferir que o caminho dela segue igual.
    const pessoa = await root.user.create({ data: { name: `${marca} pessoa`, email: `${marca}-pessoa@teste.local` } });
    const sessionHash = randomBytes(32).toString("hex");
    await root.session.create({ data: { userId: pessoa.id, tokenHash: sessionHash, expiresAt: new Date(Date.now() + 3_600_000), absoluteExpiresAt: new Date(Date.now() + 7_200_000) } });
    await root.userDepartamento.create({ data: { userId: pessoa.id, departamento: "engenharia-obras", nivel: "membro", telas: TELAS_OS } });
    identidades.set("pessoa", { principal: { id: pessoa.id, kind: "user", acesso: { plataforma: null, departamentos: [{ departamento: "engenharia-obras", nivel: "membro", telas: TELAS_OS }] } as Acesso }, sessionHash });

    clienteA = (await root.client.create({ data: { name: `${marca} Cliente A`, document: DOC_A } })).id;
    const clienteB = (await root.client.create({ data: { name: `${marca} Cliente B`, document: DOC_B } })).id;
    ucUnica = (await root.consumerUnit.create({ data: { clientId: clienteA, code: `UC ${UC_UNICA.slice(0, 4)}.${UC_UNICA.slice(4)}`, distributor: "Amazonas Energia" } })).id;
    await root.consumerUnit.create({ data: { clientId: clienteA, code: UC_REPETIDA, distributor: "x" } });
    await root.consumerUnit.create({ data: { clientId: clienteB, code: UC_REPETIDA, distributor: "x" } });
  }, PRAZO);

  afterAll(async () => {
    await app?.$disconnect();
    if (ambienteValidado) {
      const usuarios = (await root.user.findMany({ where: { email: { startsWith: marca } }, select: { id: true } })).map((u) => u.id);
      const clientes = (await root.client.findMany({ where: { name: { startsWith: marca } }, select: { id: true } })).map((c) => c.id);
      await root.$transaction(async (t) => {
        await t.$executeRawUnsafe("SET LOCAL session_replication_role = replica");
        await t.agentAction.deleteMany({ where: { agentUserId: { in: usuarios } } });
        await t.pedidoDeAgente.deleteMany({ where: { agentUserId: { in: usuarios } } });
        const os = (await t.ordemDeServico.findMany({ where: { clientId: { in: clientes } }, select: { id: true } })).map((o) => o.id);
        await t.historicoDeOrdemDeServico.deleteMany({ where: { ordemId: { in: os } } });
        await t.ordemDeServico.deleteMany({ where: { id: { in: os } } });
        await t.agentIdentity.deleteMany({ where: { userId: { in: usuarios } } });
      });
      await root.consumerUnit.deleteMany({ where: { clientId: { in: clientes } } });
      await root.client.deleteMany({ where: { id: { in: clientes } } });
      await root.user.deleteMany({ where: { id: { in: usuarios } } });
      await root.$executeRawUnsafe(`DROP ROLE IF EXISTS "${login}"`);
    }
    await root.$disconnect();
  }, PRAZO);

  it("cria a O.S. pela UC: origem robô, canal, grupo e quem pediu na O.S.; prazo padrão do tipo; trilha sem o corpo", async () => {
    const r = await criar(`${marca}-pedido-1`);
    expect(r.criada).toBe(true);
    expect(r.resposta).toMatchObject({ repetido: false, ordem: { situacao: "aberta", codigo: expect.stringMatching(/^OS-/) } });
    const os = await root.ordemDeServico.findUniqueOrThrow({ where: { id: r.resposta.ordem.id } });
    expect(os).toMatchObject({ origem: "robo", canal: "telegram", origemGrupo: `${marca} ENGENHARIA E OBRAS`, origemSolicitante: `${marca} Técnico Fulano`, clientId: clienteA, consumerUnitId: ucUnica, criadoPorId: identidades.get("robo")!.principal.id });
    // Sem prazo no pedido: o prazo padrão do tipo (Configurações da Engenharia), em dias úteis.
    const configurado = await root.configuracaoDeTipoDeOrdem.findUnique({ where: { tipo: "manutencao" } });
    const dias = configurado?.prazoPadraoDiasUteis ?? PRAZO_PADRAO_DO_TIPO.manutencao;
    expect(r.resposta.ordem.prazo).toBe(dias === 0 ? diaEmManaus(AGORA) : diaEmManaus(adicionarDiasUteis(AGORA, dias)));
    const registro = await root.pedidoDeAgente.findFirstOrThrow({ where: { entityId: os.id } });
    expect(registro.hashDoCorpo).toMatch(/^[0-9a-f]{64}$/);
    const trilha = await root.agentAction.findMany({ where: { entityId: os.id } });
    expect(trilha).toEqual([expect.objectContaining({ action: "engenharia.ordem.criar", channel: "telegram", result: "criada", input: {}, payload: {} })]);
    // Nem quem pediu, nem o grupo, nem a UC vão para os eventos ou a trilha.
    const eventos = await root.eventLog.findMany({ where: { entityId: os.id } });
    expect(eventos.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify([eventos, trilha, registro])).not.toMatch(new RegExp(`Fulano|ENGENHARIA E OBRAS|${UC_UNICA}|${DOC_A}`));
  });

  it("o mesmo pedido não duplica: mesma chave e corpo devolvem a mesma O.S.; corpo diferente é 409", async () => {
    const primeira = await criar(`${marca}-pedido-2`);
    const segunda = await criar(`${marca}-pedido-2`);
    expect(segunda).toMatchObject({ criada: false, resposta: { repetido: true, ordem: { id: primeira.resposta.ordem.id } } });
    expect(await root.pedidoDeAgente.count({ where: { chave: `${marca}-pedido-2` } })).toBe(1);
    expect((await root.agentAction.findMany({ where: { entityId: primeira.resposta.ordem.id } })).map((a) => a.result).sort()).toEqual(["criada", "repetida"]);
    await expect(criar(`${marca}-pedido-2`, { descricao: `${marca} outro serviço` })).rejects.toThrow(Conflito);
    // A chave é por agente: outro agente com a mesma chave abre a própria O.S.
    const outro = await criar(`${marca}-pedido-2`, {}, "outro");
    expect(outro.resposta.ordem.id).not.toBe(primeira.resposta.ordem.id);
  });

  it("na corrida, o mesmo pedido ao mesmo tempo cria uma O.S. só", async () => {
    const resultados = await Promise.all([criar(`${marca}-corrida`), criar(`${marca}-corrida`), criar(`${marca}-corrida`)]);
    const ids = new Set(resultados.map((r) => r.resposta.ordem.id));
    expect(ids.size).toBe(1);
    expect(resultados.filter((r) => r.criada)).toHaveLength(1);
    expect(await root.ordemDeServico.count({ where: { id: { in: [...ids] } } })).toBe(1);
  });

  it("chave natural: documento sozinho, UC de dois clientes pede o documento, nada encontrado e nome sozinho dão 422", async () => {
    const pelaDoc = await criar(`${marca}-doc`, { uc: undefined, documento: DOC_A });
    expect(await root.ordemDeServico.findUniqueOrThrow({ where: { id: pelaDoc.resposta.ordem.id } })).toMatchObject({ clientId: clienteA, consumerUnitId: null });
    await expect(criar(`${marca}-ambigua`, { uc: UC_REPETIDA })).rejects.toThrow(/Mais de uma UC/);
    const desempate = await criar(`${marca}-desempate`, { uc: UC_REPETIDA, documento: DOC_A });
    expect((await root.ordemDeServico.findUniqueOrThrow({ where: { id: desempate.resposta.ordem.id } })).clientId).toBe(clienteA);
    await expect(criar(`${marca}-sem-uc`, { uc: "9999000000000" })).rejects.toThrow(NaoProcessavel);
    await expect(criar(`${marca}-sem-doc`, { uc: undefined, documento: "99990000000000" })).rejects.toThrow(/Nenhum cliente/);
    await expect(criar(`${marca}-so-nome`, { uc: undefined })).rejects.toThrow(/o nome não basta/);
    await expect(criar("curta", {})).rejects.toThrow(/Idempotency-Key/);
  });

  it("agente sem a ação não cria nada, nem com a tela de O.S.; a pessoa segue criando pela tela", async () => {
    await expect(criar(`${marca}-sem-acao`, {}, "semAcao")).rejects.toThrow(/row-level security/);
    // Nem pelo caminho das pessoas: o RLS recusa a O.S. do agente sem a ação, com qualquer origem.
    const manual = criarOrdemDeServicoSchema.parse({ empresa: "waze", tipo: "manutencao", clienteId: clienteA, descricao: `${marca} manual`, prazo: "2026-11-30" });
    await expect(como("semAcao", () => ordens.criar(manual, identidades.get("semAcao")!.principal, AGORA))).rejects.toThrow(/row-level security/);
    // O agente com a ação também não abre O.S. fora da origem robô.
    await expect(como("robo", () => ordens.criar(manual, identidades.get("robo")!.principal, AGORA))).rejects.toThrow(/row-level security/);
    expect(await root.ordemDeServico.count({ where: { descricao: `${marca} manual` } })).toBe(0);
    const daPessoa = await como("pessoa", () => ordens.criar(manual, identidades.get("pessoa")!.principal, AGORA));
    expect(daPessoa).toBeTruthy();
    // O serviço das O.S. recusa o agente antes do banco.
    const { EngenhariaService } = await import("../src/engenharia/engenharia.service.js");
    const engenharia = Object.create(EngenhariaService.prototype) as InstanceType<typeof EngenhariaService>;
    Object.assign(engenharia, { exigirAcesso: () => undefined });
    await expect(engenharia.criar(manual, identidades.get("robo")!.principal)).rejects.toThrow(AcessoNegado);
  });

  it("RLS: o agente só vê os próprios pedidos e ninguém reescreve nem apaga", async () => {
    expect(await tx("outro", (t) => t.pedidoDeAgente.count({ where: { chave: `${marca}-pedido-1` } }))).toBe(0);
    expect(await tx("robo", (t) => t.pedidoDeAgente.count({ where: { chave: `${marca}-pedido-1` } }))).toBe(1);
    expect(await tx("pessoa", (t) => t.pedidoDeAgente.count())).toBe(0);
    await expect(tx("robo", (t) => t.pedidoDeAgente.updateMany({ where: { chave: `${marca}-pedido-1` }, data: { hashDoCorpo: "0".repeat(64) } }))).rejects.toThrow(/permission denied/);
    await expect(tx("robo", (t) => t.pedidoDeAgente.deleteMany({ where: { chave: `${marca}-pedido-1` } }))).rejects.toThrow(/permission denied/);
    // Ação fora do catálogo não entra na identidade.
    await expect(root.agentIdentity.update({ where: { userId: identidades.get("semAcao")!.principal.id }, data: { acoes: ["engenharia.ordem.apagar"] } })).rejects.toThrow();
  });
});
