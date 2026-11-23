import { randomBytes } from "node:crypto";

import type { EmpresaDoOmie } from "@plugga/shared";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { AuditAppender } from "../src/audit/audit-appender.js";
import type { AuthPrincipal } from "../src/core/auth/auth.types.js";
import { PrismaSegredoRepository } from "../src/llm/prisma-segredo.repository.js";
import { CHAVE_OMIE } from "../src/omie/omie-cofre.service.js";
import { OmieConexoesService, chaveDoOmie } from "../src/omie/omie-conexoes.service.js";
import type { OmiePort } from "../src/omie/omie.port.js";
import { PrismaOmieConexoesRepository } from "../src/omie/prisma-omie-conexoes.repository.js";
import { PrismaOmieLeituraPorEmpresa } from "../src/omie/prisma-omie-leitura-por-empresa.repository.js";
import { contextoBanco } from "../src/prisma/contexto-banco.js";
import { PrismaService } from "../src/prisma/prisma.service.js";

/**
 * OMIE por empresa (PLU-342) contra o Postgres: o par no cofre, a conferência em
 * omie_conexoes e a config_omie(p_empresa) de verdade; o OMIE é um dublê. O RLS
 * fica em rls-permissoes.
 *
 *     pnpm --filter @plugga/api test:financeiro
 */
const HABILITADO = process.env.RUN_FINANCEIRO_INTEGRATION_TESTS === "true";
const PRAZO_MS = 60_000;
// CNPJ da faixa sintética do projeto.
const CNPJ = "99999002000103";

describe.skipIf(!HABILITADO)("omie por empresa no Postgres", () => {
  const prisma = new PrismaService();
  const segredos = new PrismaSegredoRepository(prisma);
  const conexoes = new PrismaOmieConexoesRepository(prisma, new AuditAppender());
  const omie = { consultarEmpresa: vi.fn(), listarEmpresas: vi.fn(async (): Promise<EmpresaDoOmie[]> => [{ razaoSocial: "WAZE SINTÉTICA", nomeFantasia: null, cnpj: CNPJ }]) };
  const servico = new OmieConexoesService(segredos, conexoes, new PrismaOmieLeituraPorEmpresa(prisma), omie as unknown as OmiePort);
  const mestraAnterior = process.env.SECRETS_ENCRYPTION_KEY;
  let principal: AuthPrincipal;
  let guardados: { chave: string; linha: unknown }[] = [];
  const sessao = randomBytes(32).toString("hex");
  const comoAdmin = <T>(fazer: () => Promise<T>) => contextoBanco.run({ sessionHash: sessao, agentHash: undefined }, fazer);

  beforeAll(async () => {
    process.env.SECRETS_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    await prisma.$connect();
    for (const id of ["plugga", "waze"]) await prisma.company.upsert({ where: { id }, create: { id, name: id }, update: {} });
    const admin = await prisma.role.upsert({ where: { key: "admin" }, create: { key: "admin", name: "Admin" }, update: {} });
    const pessoa = await prisma.user.create({ data: { email: `omie-${Date.now()}@teste.local`, name: "OMIE teste", platformRoles: { create: { roleId: admin.id } } } });
    // Sessão de verdade: a função que grava o CNPJ confere a plataforma pela sessão do banco.
    await prisma.session.create({ data: { userId: pessoa.id, tokenHash: sessao, expiresAt: new Date(Date.now() + 3_600_000), absoluteExpiresAt: new Date(Date.now() + 7_200_000) } });
    principal = { id: pessoa.id, kind: "user", acesso: { plataforma: "admin", departamentos: [] } };
    // Preserva o que já houver no banco de teste e começa do zero.
    guardados = await Promise.all([chaveDoOmie("waze"), chaveDoOmie("plugga"), CHAVE_OMIE].map(async (chave) => ({ chave, linha: await prisma.segredoDoSistema.findUnique({ where: { chave } }) })));
    await prisma.segredoDoSistema.deleteMany({ where: { chave: { in: guardados.map((g) => g.chave) } } });
    await prisma.omieConexao.deleteMany({});
  }, PRAZO_MS);

  afterAll(async () => {
    await prisma.omieConexao.deleteMany({});
    await prisma.segredoDoSistema.deleteMany({ where: { chave: { in: guardados.map((g) => g.chave) } } });
    for (const g of guardados) if (g.linha) await prisma.segredoDoSistema.create({ data: g.linha as never });
    await prisma.company.update({ where: { id: "waze" }, data: { cnpj: null } });
    await prisma.session.deleteMany({ where: { userId: principal.id } });
    await prisma.user.deleteMany({ where: { id: principal.id } });
    if (mestraAnterior === undefined) delete process.env.SECRETS_ENCRYPTION_KEY;
    else process.env.SECRETS_ENCRYPTION_KEY = mestraAnterior;
    await prisma.$disconnect();
  }, PRAZO_MS);

  it("gravar, testar e confirmar: o uso só sai depois, e trocar o par volta a testar", async () => {
    const par = { appKey: "chave-waze-0042", appSecret: "ficticio-ficticio-ficticio" };
    await servico.gravar("waze", par, principal);
    const da = async () => (await servico.estado()).conexoes.find((c) => c.empresa === "waze")!;
    expect((await da()).situacao).toBe("a_testar");

    await servico.testar("waze", principal);
    expect(await da()).toMatchObject({ situacao: "a_confirmar", ultimoTeste: { empresas: [{ cnpj: CNPJ }] } });
    expect(await servico.credenciais("waze")).toBeNull();

    await servico.confirmar("waze", CNPJ, principal);
    expect(await da()).toMatchObject({ situacao: "conectada", confirmada: { cnpj: CNPJ, razaoSocial: "WAZE SINTÉTICA" } });
    expect(await servico.credenciais("waze")).toEqual(par);

    await servico.gravar("waze", { ...par, appKey: "chave-waze-0043" }, principal);
    expect((await da()).situacao).toBe("a_testar");
    await new Promise((r) => setTimeout(r, 5_100)); // a validade do cache
    expect(await servico.credenciais("waze")).toBeNull();

    const eventos = await prisma.eventLog.findMany({ where: { entityType: "integracao_omie", entityId: "waze", actorId: principal.id }, select: { eventName: true, payload: true } });
    expect(eventos.map((e) => e.eventName)).toEqual(expect.arrayContaining(["integracoes.omie.conectada", "integracoes.omie.testada", "integracoes.omie.confirmada"]));
    expect(JSON.stringify(eventos)).not.toContain(par.appSecret);
  }, PRAZO_MS);

  it("duas confirmações simultâneas do mesmo CNPJ nas duas empresas: só uma fica conectada", async () => {
    await prisma.company.updateMany({ where: { id: { in: ["plugga", "waze"] } }, data: { cnpj: null } });
    await servico.gravar("plugga", { appKey: "chave-plugga-0042", appSecret: "ficticio-ficticio-ficticio" }, principal);
    await servico.gravar("waze", { appKey: "chave-waze-0044", appSecret: "ficticio-ficticio-ficticio" }, principal);
    await servico.testar("plugga", principal);
    await servico.testar("waze", principal);
    const resultados = await Promise.allSettled([servico.confirmar("plugga", CNPJ, principal), servico.confirmar("waze", CNPJ, principal)]);
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const estado = await servico.estado();
    expect(estado.conexoes.filter((c) => c.situacao === "conectada")).toHaveLength(1);
    expect(estado.conexoes.find((c) => c.situacao !== "conectada")).toMatchObject({ situacao: "bloqueada", bloqueio: "cnpj_de_outra_empresa" });
    // A última barreira: nem o dono do banco grava o mesmo CNPJ confirmado nas duas.
    const outra = estado.conexoes.find((c) => c.situacao !== "conectada")!.empresa;
    await expect(prisma.omieConexao.update({ where: { companyId: outra }, data: { bloqueio: null, confirmadaEm: new Date(), cnpjConfirmado: CNPJ } })).rejects.toThrow();
    await prisma.segredoDoSistema.deleteMany({ where: { chave: chaveDoOmie("plugga") } });
  }, PRAZO_MS);

  it("cadastrar o CNPJ reavalia as conexões já confirmadas e bloqueia a que não confere", async () => {
    // Só os eventos deste caso: a corrida do caso anterior também bloqueia (e registra) a perdedora.
    const inicio = new Date();
    await prisma.company.updateMany({ where: { id: { in: ["plugga", "waze"] } }, data: { cnpj: null } });
    await prisma.omieConexao.deleteMany({});
    // A Plugga foi confirmada à mão com X, que na verdade é o CNPJ da Waze.
    await servico.gravar("plugga", { appKey: "chave-plugga-0050", appSecret: "ficticio-ficticio-ficticio" }, principal);
    await servico.testar("plugga", principal);
    await servico.confirmar("plugga", CNPJ, principal);
    expect(await servico.credenciais("plugga")).not.toBeNull();

    // A plataforma cadastra X como o CNPJ da Waze: a Plugga sai do ar na hora.
    await comoAdmin(() => servico.definirCnpj("waze", CNPJ, principal));
    expect((await servico.estado()).conexoes.find((c) => c.empresa === "plugga")).toMatchObject({ situacao: "bloqueada", bloqueio: "cnpj_de_outra_empresa", confirmada: null });
    expect(await servico.credenciais("plugga")).toBeNull();
    expect(await prisma.eventLog.count({ where: { eventName: "integracoes.omie.bloqueada", entityId: "plugga", actorId: principal.id, occurredAt: { gte: inicio } } })).toBe(1);

    // O cadastro da própria empresa diferente do confirmado também bloqueia.
    await comoAdmin(() => servico.definirCnpj("waze", null, principal));
    await servico.gravar("waze", { appKey: "chave-waze-0051", appSecret: "ficticio-ficticio-ficticio" }, principal);
    await servico.testar("waze", principal);
    await servico.confirmar("waze", CNPJ, principal);
    await comoAdmin(() => servico.definirCnpj("waze", "99999003000148", principal));
    expect((await servico.estado()).conexoes.find((c) => c.empresa === "waze")).toMatchObject({ situacao: "bloqueada", bloqueio: "cnpj_diferente_do_cadastro" });
    await prisma.company.update({ where: { id: "waze" }, data: { cnpj: null } });
    await prisma.omieConexao.deleteMany({});
  }, PRAZO_MS);

  it("com o CNPJ no cadastro, o teste conecta sozinho; o CNPJ diferente bloqueia", async () => {
    await prisma.omieConexao.deleteMany({ where: { companyId: "plugga" } });
    await servico.gravar("waze", { appKey: "chave-waze-0045", appSecret: "ficticio-ficticio-ficticio" }, principal);
    // A permissão da função que grava o CNPJ está em rls-permissoes; aqui o dono do banco grava direto.
    await prisma.company.update({ where: { id: "waze" }, data: { cnpj: CNPJ } });
    await servico.testar("waze", principal);
    expect((await servico.estado()).conexoes.find((c) => c.empresa === "waze")).toMatchObject({ situacao: "conectada", cnpjDoCadastro: CNPJ });
    await prisma.company.update({ where: { id: "waze" }, data: { cnpj: "99999003000148" } });
    await servico.testar("waze", principal);
    expect((await servico.estado()).conexoes.find((c) => c.empresa === "waze")).toMatchObject({ situacao: "bloqueada", bloqueio: "cnpj_diferente_do_cadastro" });
  }, PRAZO_MS);
});
