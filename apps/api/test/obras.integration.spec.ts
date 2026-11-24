import { randomBytes } from "node:crypto";

import { cadastrarObraSchema, criarOrdemDeServicoSchema, editarObraSchema, enviarDocumentoDeObraSchema, type Acesso } from "@plugga/shared";
import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditAppender } from "../src/audit/audit-appender.js";
import { AcessoNegado, EstadoInvalido, RequisicaoInvalida, TipoNaoPermitido } from "../src/common/errors/dominio.js";
import type { AuthPrincipal } from "../src/core/auth/auth.types.js";
import { ObrasService } from "../src/engenharia/obras.service.js";
import { PrismaEngenhariaRepository } from "../src/engenharia/prisma-engenharia.repository.js";
import { PrismaObrasRepository } from "../src/engenharia/prisma-obras.repository.js";
import { contextoBanco } from "../src/prisma/contexto-banco.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { assertSafeTestDatabaseUrl } from "./safe-test-environment";

/**
 * Obras com marcos, documentos e cronograma (PLU-350) no Postgres, no login da
 * aplicação (com RLS): cadastro com os 6 marcos, marcos em ordem e a partir do
 * início, orçamento só do gerente, documentos com versões e sem exclusão, a O.S.
 * da obra e a leitura do centro de custo pelo Compras e pelo Financeiro.
 *
 *     pnpm --filter @plugga/api test:obras
 */
const HABILITADO = process.env.RUN_OBRAS_INTEGRATION_TESTS === "true";
const PRAZO = 60_000;
// Segunda, 23/11/2026, 10:00 em Manaus.
const AGORA = new Date("2026-11-23T14:00:00Z");
const PDF = Buffer.from("%PDF-1.4\n%sintetico\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const MPP = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(504)]);

describe.skipIf(!HABILITADO)("obras no Postgres", { timeout: PRAZO }, () => {
  const root = new PrismaClient();
  const marca = `obr_${randomBytes(6).toString("hex")}`;
  const login = `${marca}_app`;
  const pessoas = new Map<string, { id: string; hash: string; acesso: Acesso }>();
  const guardados: string[] = [];
  let app: PrismaService;
  let repo: PrismaObrasRepository;
  let ordens: PrismaEngenhariaRepository;
  let servico: ObrasService;
  let clienteId: string;
  let outroCliente: string;
  let ambienteValidado = false;

  const principal = (nome: string): AuthPrincipal => ({ id: pessoas.get(nome)!.id, kind: "user", acesso: pessoas.get(nome)!.acesso });
  const como = <T>(nome: string, fazer: () => Promise<T>) => contextoBanco.run({ sessionHash: pessoas.get(nome)!.hash, agentHash: undefined }, fazer);
  const tx = <T>(nome: string, fazer: (t: Prisma.TransactionClient) => Promise<T>) => como(nome, () => app.comContexto(fazer));
  const nova = (dados: Record<string, unknown> = {}, nome = "eng") => como(nome, () => servico.cadastrar(cadastrarObraSchema.parse({
    empresa: "waze", clienteId, nome: `${marca} Galpão Tarumã`, potenciaKwp: "61,2", responsavelId: pessoas.get("eng")!.id,
    inicioEm: "2026-10-20", entregaPrevistaEm: "2027-02-26", ...dados,
  }), principal(nome)));
  const anexar = (obraId: string, dados: Record<string, unknown>, buffer = PDF, nomeArquivo = "documento.pdf", nome = "eng") =>
    como(nome, () => servico.anexar(obraId, enviarDocumentoDeObraSchema.parse(dados), { buffer, nomeOriginal: nomeArquivo }, principal(nome)));

  beforeAll(async () => {
    assertSafeTestDatabaseUrl(process.env.DATABASE_URL!, process.env.CI === "true", process.env.PLUGGA_TEST_DB_PORT);
    ambienteValidado = true;
    await root.$connect();
    if (!/^obr_[a-f0-9]+_app$/.test(login)) throw new Error("Login de fixture inválido");
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
    repo = new PrismaObrasRepository(app, auditoria);
    ordens = new PrismaEngenhariaRepository(app, auditoria);
    const armazenamento = { enviar: async (chave: string) => { guardados.push(chave); }, excluir: async () => undefined, ler: async () => { throw new Error("sem leitura no teste"); } };
    servico = new ObrasService(repo, ordens, armazenamento as never, () => AGORA);

    for (const id of ["plugga", "waze"]) await root.company.upsert({ where: { id }, create: { id, name: id }, update: {} });
    const perfis: Record<string, { departamento: string; nivel: "membro" | "gerente"; telas: string[] }> = {
      eng: { departamento: "engenharia-obras", nivel: "membro", telas: ["engenharia-obras.obras", "engenharia-obras.os", "engenharia-obras.protocolos"] },
      gerente: { departamento: "engenharia-obras", nivel: "gerente", telas: ["engenharia-obras.obras"] },
      os: { departamento: "engenharia-obras", nivel: "membro", telas: ["engenharia-obras.os"] },
      compras: { departamento: "suprimentos", nivel: "membro", telas: ["suprimentos.compras"] },
      financeiro: { departamento: "financeiro", nivel: "membro", telas: ["financeiro.pagar"] },
    };
    for (const [nome, perfil] of Object.entries(perfis)) {
      const pessoa = await root.user.create({ data: { name: `${marca} ${nome}`, email: `${marca}-${nome}@teste.local` } });
      const hash = randomBytes(32).toString("hex");
      await root.session.create({ data: { userId: pessoa.id, tokenHash: hash, expiresAt: new Date(Date.now() + 3_600_000), absoluteExpiresAt: new Date(Date.now() + 7_200_000) } });
      await root.userDepartamento.create({ data: { userId: pessoa.id, departamento: perfil.departamento, nivel: perfil.nivel, telas: perfil.telas } });
      pessoas.set(nome, { id: pessoa.id, hash, acesso: { plataforma: null, departamentos: [{ departamento: perfil.departamento, nivel: perfil.nivel, telas: perfil.telas }] } as Acesso });
    }
    clienteId = (await root.client.create({ data: { name: `${marca} Cliente` } })).id;
    outroCliente = (await root.client.create({ data: { name: `${marca} Outro` } })).id;
  }, PRAZO);

  afterAll(async () => {
    await app?.$disconnect();
    if (ambienteValidado) {
      const clientes = (await root.client.findMany({ where: { name: { startsWith: marca } }, select: { id: true } })).map((c) => c.id);
      await root.$transaction(async (t) => {
        await t.$executeRawUnsafe("SET LOCAL session_replication_role = replica");
        const obras = (await t.obra.findMany({ where: { nome: { startsWith: marca } }, select: { id: true } })).map((o) => o.id);
        const os = (await t.ordemDeServico.findMany({ where: { clientId: { in: clientes } }, select: { id: true } })).map((o) => o.id);
        await t.historicoDeOrdemDeServico.deleteMany({ where: { ordemId: { in: os } } });
        await t.ordemDeServico.deleteMany({ where: { id: { in: os } } });
        await t.documentoDeObra.deleteMany({ where: { obraId: { in: obras } } });
        await t.marcoDeObra.deleteMany({ where: { obraId: { in: obras } } });
        await t.obra.deleteMany({ where: { id: { in: obras } } });
        const protocolos = (await t.protocolo.findMany({ where: { clientId: { in: clientes } }, select: { id: true } })).map((p) => p.id);
        await t.verificacaoDeProtocolo.deleteMany({ where: { protocoloId: { in: protocolos } } });
        await t.protocolo.deleteMany({ where: { id: { in: protocolos } } });
        await t.consumerUnit.deleteMany({ where: { clientId: { in: clientes } } });
      });
      await root.client.deleteMany({ where: { id: { in: clientes } } });
      await root.user.deleteMany({ where: { email: { startsWith: marca } } });
      await root.$executeRawUnsafe(`DROP ROLE IF EXISTS "${login}"`);
    }
    await root.$disconnect();
  }, PRAZO);

  it("cadastra a obra com os 6 marcos entre o início (pode ser passado) e a entrega; recusa entrega antiga, responsável de fora e quem não tem a tela", async () => {
    const o = await nova();
    expect(o).toMatchObject({
      nome: `${marca} Galpão Tarumã`, tipo: "obra_solar", potenciaKwp: "61.2", situacao: "em_andamento",
      cliente: { id: clienteId, nome: `${marca} Cliente` }, responsavel: { nome: `${marca} eng` }, inicioEm: "2026-10-20", entregaPrevistaEm: "2027-02-26",
      marcos: { feitos: 0, total: 6, proximo: { nome: "Contrato assinado", previstoEm: "2026-10-20", atrasado: true } }, custos: null, orcamento: null,
    });
    expect(o.marcosDaObra.map((m) => m.previstoEm)[5]).toBe("2027-02-26");
    expect(o.acoesPermitidas).toEqual(["editar", "anexar", "marcar_marco", "reprogramar_marco"]);
    await expect(nova({ nome: `${marca} entrega hoje`, entregaPrevistaEm: "2026-11-23" })).rejects.toThrow(RequisicaoInvalida);
    await expect(nova({ nome: `${marca} responsável de fora`, responsavelId: pessoas.get("compras")!.id })).rejects.toThrow(/pessoa ativa da Engenharia/);
    await expect(nova({ nome: `${marca} sem tela` }, "os")).rejects.toThrow(AcessoNegado);
    await expect(como("os", () => repo.cadastrar(cadastrarObraSchema.parse({ empresa: "waze", clienteId, nome: `${marca} rls`, potenciaKwp: "1", inicioEm: "2026-11-23", entregaPrevistaEm: "2026-12-01" }), principal("os")))).rejects.toThrow(/row-level security/);
    const eventos = await root.eventLog.findMany({ where: { eventName: "engenharia.obra.created", entityId: o.id } });
    expect(eventos).toHaveLength(1);
  });

  it("marcos em ordem e a partir do início; o feito não muda; reprogramar só o pendente, dentro do período e não no passado", async () => {
    const o = await nova({ nome: `${marca} marcos` });
    const [m1, m2] = o.marcosDaObra;
    await expect(como("eng", () => servico.marcarFeito(o.id, m2!.id, principal("eng")))).rejects.toThrow(/em ordem/);
    const feito = await como("eng", () => servico.marcarFeito(o.id, m1!.id, principal("eng")));
    expect(feito.marcosDaObra[0]).toMatchObject({ feito: { por: { nome: `${marca} eng` } }, atrasado: true, proximo: false });
    expect(feito.marcosDaObra[1]!.proximo).toBe(true);
    await expect(como("eng", () => servico.marcarFeito(o.id, m1!.id, principal("eng")))).rejects.toThrow(EstadoInvalido);
    await expect(tx("eng", (t) => t.marcoDeObra.update({ where: { id: m1!.id }, data: { previstoEm: new Date("2026-12-01T04:00:00Z") } }))).rejects.toThrow(/marco feito não muda/);
    const reprogramado = await como("eng", () => servico.reprogramar(o.id, m2!.id, "2026-12-10", principal("eng")));
    expect(reprogramado.marcosDaObra[1]!.previstoEm).toBe("2026-12-10");
    await expect(como("eng", () => servico.reprogramar(o.id, m2!.id, "2027-03-01", principal("eng")))).rejects.toThrow(RequisicaoInvalida);
    await expect(como("eng", () => servico.reprogramar(o.id, m2!.id, "2026-11-20", principal("eng")))).rejects.toThrow(RequisicaoInvalida);
    await expect(como("eng", () => servico.reprogramar(o.id, m1!.id, "2026-12-01", principal("eng")))).rejects.toThrow(EstadoInvalido);
    // Obra que ainda não começou: nenhum marco é feito antes do início.
    const futura = await nova({ nome: `${marca} futura`, inicioEm: "2026-12-01", entregaPrevistaEm: "2027-01-15" });
    await expect(como("eng", () => servico.marcarFeito(futura.id, futura.marcosDaObra[0]!.id, principal("eng")))).rejects.toThrow(/a partir do início/);
  });

  it("o orçamento é só do gerente, no serviço e no banco", async () => {
    const o = await nova({ nome: `${marca} orçamento` });
    await expect(como("eng", () => servico.editar(o.id, editarObraSchema.parse({ orcamento: "125000,50" }), principal("eng")))).rejects.toThrow(AcessoNegado);
    await expect(tx("eng", (t) => t.obra.update({ where: { id: o.id }, data: { orcamento: "1" } }))).rejects.toThrow(/gerente da Engenharia/);
    const comOrcamento = await como("gerente", () => servico.editar(o.id, editarObraSchema.parse({ orcamento: "125000,50" }), principal("gerente")));
    expect(comOrcamento).toMatchObject({ orcamento: "125000.50" });
    expect(comOrcamento.acoesPermitidas).toContain("editar_orcamento");
  });

  it("a obra do Compras (sem período) ganha os marcos ao receber as datas; a entrega antecipada puxa os pendentes; o início não muda", async () => {
    const legada = await root.obra.create({ data: { companyId: "waze", nome: `${marca} do Compras`, clientId: clienteId } });
    const antes = await como("eng", () => servico.obra(legada.id, principal("eng")));
    expect(antes).toMatchObject({ situacao: "sem_marcos", marcos: { total: 0 }, inicioEm: null, acoesPermitidas: ["editar", "anexar"] });
    await expect(como("eng", () => servico.editar(legada.id, editarObraSchema.parse({ entregaPrevistaEm: "2027-01-10" }), principal("eng")))).rejects.toThrow(/início e a entrega/);
    const comDatas = await como("eng", () => servico.editar(legada.id, editarObraSchema.parse({ inicioEm: "2026-11-01", entregaPrevistaEm: "2027-01-10" }), principal("eng")));
    expect(comDatas.marcos.total).toBe(6);
    const antecipada = await como("eng", () => servico.editar(legada.id, editarObraSchema.parse({ entregaPrevistaEm: "2026-12-20" }), principal("eng")));
    expect(antecipada.marcosDaObra.every((m) => m.previstoEm <= "2026-12-20")).toBe(true);
    expect(antecipada.marcosDaObra[5]!.previstoEm).toBe("2026-12-20");
    await expect(como("eng", () => servico.editar(legada.id, editarObraSchema.parse({ inicioEm: "2026-11-05" }), principal("eng")))).rejects.toThrow(/início da obra não muda/);
    await expect(como("eng", () => servico.editar(legada.id, editarObraSchema.parse({ entregaPrevistaEm: "2026-11-23" }), principal("eng")))).rejects.toThrow(RequisicaoInvalida);
  });

  it("documentos e cronograma com versões e sem exclusão; o .mpp é aceito; o tipo é conferido pelo conteúdo", async () => {
    const o = await nova({ nome: `${marca} documentos` });
    await anexar(o.id, { categoria: "cronograma" }, MPP, "Cronograma Tarumã.mpp");
    const v2 = await anexar(o.id, { categoria: "cronograma" }, MPP, "Cronograma Tarumã.mpp");
    const cronograma = v2.documentosDaObra[0]!;
    expect(cronograma).toMatchObject({ categoria: "cronograma", versao: 2, mime: "application/vnd.ms-project", versoesAnteriores: [expect.objectContaining({ versao: 1 })] });
    const ata = await anexar(o.id, { categoria: "ata" }, PDF, "Ata de início.pdf");
    const doc = ata.documentosDaObra.find((d) => d.categoria === "ata")!;
    const nova2 = await anexar(o.id, { categoria: "ata", substitui: doc.id }, PDF, "Ata de início v2.pdf");
    expect(nova2.documentosDaObra.find((d) => d.categoria === "ata")).toMatchObject({ versao: 2, nome: "Ata de início v2.pdf", serieId: doc.serieId });
    expect(nova2.documentos).toBe(2);
    await expect(anexar(o.id, { categoria: "ata", substitui: doc.id }, PDF)).rejects.toThrow(/já foi substituída/);
    await expect(anexar(o.id, { categoria: "outro" }, Buffer.from("texto qualquer"), "nota.txt")).rejects.toThrow(TipoNaoPermitido);
    expect(guardados.at(-1)).toMatch(new RegExp(`^engenharia/obras/waze/${o.id}/`));
    await expect(tx("eng", (t) => t.documentoDeObra.deleteMany({ where: { obraId: o.id } }))).rejects.toThrow(/permission denied/);
    await expect(tx("eng", (t) => t.documentoDeObra.updateMany({ where: { id: doc.id }, data: { substituidoEm: null } }))).rejects.toThrow(/só pode ser marcado como substituído/);
    await expect(tx("eng", (t) => t.obra.deleteMany({ where: { id: o.id } }))).rejects.toThrow(/permission denied/);
    // O evento não leva o nome do arquivo.
    expect(JSON.stringify(await root.eventLog.findMany({ where: { entityId: o.id } }))).not.toMatch(/Tarumã\.mpp|Ata de início/);
  });

  it("o projeto elétrico aponta só o protocolo do cliente da obra; o nome do cliente sai só para quem tem obra", async () => {
    const o = await nova({ nome: `${marca} projeto` });
    const protocolo = async (cliente: string, numero: string) => {
      const uc = await root.consumerUnit.create({ data: { clientId: cliente, code: `${marca}-${numero}`, distributor: "Amazonas Energia" } });
      return (await root.protocolo.create({ data: {
        companyId: "waze", departamento: "engenharia-obras", clientId: cliente, consumerUnitId: uc.id, distribuidoraId: "amazonas-energia", tipo: "orcamento_de_conexao",
        numero: `${marca}-${numero}`, abertoEm: new Date("2026-11-10T04:00:00Z"), dataLimite: new Date("2026-12-10T04:00:00Z"), proximaVerificacao: new Date("2026-12-01T04:00:00Z"),
      } })).id;
    };
    const doOutro = await protocolo(outroCliente, "p2");
    await expect(anexar(o.id, { categoria: "projeto_eletrico", protocoloId: doOutro }, PDF, "Projeto.pdf")).rejects.toThrow(/outro cliente/);
    const doCliente = await protocolo(clienteId, "p1");
    const ficha = await anexar(o.id, { categoria: "projeto_eletrico", protocoloId: doCliente }, PDF, "Projeto.pdf");
    expect(ficha.documentosDaObra.find((d) => d.categoria === "projeto_eletrico")!.protocolo).toEqual({ id: doCliente, numero: `${marca}-p1` });
    const nomes = (ids: string[]) => tx("eng", (t) => t.$queryRaw<{ id: string }[]>`SELECT id FROM plugga_security.nomes_das_obras(${ids}::uuid[], ARRAY[]::uuid[])`);
    expect((await nomes([clienteId])).map((r) => r.id)).toEqual([clienteId]);
    expect(await nomes([outroCliente])).toEqual([]);
  });

  it("a ficha mostra as O.S. da obra; a O.S. só se liga à obra do mesmo cliente e empresa", async () => {
    const o = await nova({ nome: `${marca} com O.S.` });
    const criar = (dados: Record<string, unknown>) => como("eng", () => ordens.criar(criarOrdemDeServicoSchema.parse({
      empresa: "waze", tipo: "instalacao", clienteId, descricao: `${marca} instalação`, prazo: "2026-11-30", obraId: o.id, ...dados,
    }), principal("eng"), AGORA));
    await expect(criar({ clienteId: outroCliente })).rejects.toThrow(/mesmo cliente/);
    await expect(criar({ empresa: "plugga" })).rejects.toThrow(/mesma empresa/);
    const id = await criar({});
    const ficha = await como("eng", () => servico.obra(o.id, principal("eng")));
    expect(ficha.ordens.map((x) => x.id)).toEqual([id]);
    expect(ficha.osAbertas).toBe(1);
    expect((await como("eng", () => ordens.ficha(id))).linha.obra).toEqual({ id: o.id, nome: `${marca} com O.S.` });
  });

  it("a obra é o centro de custo: Compras e Financeiro leem, mas não editam", async () => {
    const o = await nova({ nome: `${marca} centro` });
    expect(await tx("compras", (t) => t.obra.count({ where: { id: o.id } }))).toBe(1);
    expect(await tx("financeiro", (t) => t.obra.count({ where: { id: o.id } }))).toBe(1);
    expect((await tx("compras", (t) => t.obra.updateMany({ where: { id: o.id }, data: { nome: "x" } }))).count).toBe(0);
    // PLU-355: o Compras não cria obra; escolhe do cadastro.
    await expect(tx("compras", (t) => t.obra.create({ data: { companyId: "waze", nome: `${marca} rápida`, criadoPorId: pessoas.get("compras")!.id } }))).rejects.toThrow(/row-level security/);
    expect((await tx("financeiro", (t) => t.marcoDeObra.updateMany({ where: { obraId: o.id }, data: { previstoEm: AGORA } }))).count).toBe(0);
    const lista = await como("eng", () => servico.listar({ busca: marca }, principal("eng")));
    expect(lista.itens.length).toBeGreaterThanOrEqual(5);
    expect(lista.contagens.emAndamento).toBeGreaterThanOrEqual(5);
    expect((await como("eng", () => servico.listar({ busca: marca, atrasadas: "sim" }, principal("eng")))).itens.every((x) => x.marcos.atrasados > 0)).toBe(true);
  });
});
