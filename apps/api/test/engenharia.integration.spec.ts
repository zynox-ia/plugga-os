import { randomBytes } from "node:crypto";

import { acaoDaOrdemDeServicoSchema, criarOrdemDeServicoSchema, criarPedidoDeCompraSchema, type Acesso } from "@plugga/shared";
import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditAppender } from "../src/audit/audit-appender.js";
import { EstadoInvalido, RequisicaoInvalida } from "../src/common/errors/dominio.js";
import { ComprasService } from "../src/compras/compras.service.js";
import { PrismaComprasRepository } from "../src/compras/prisma-compras.repository.js";
import type { AuthPrincipal } from "../src/core/auth/auth.types.js";
import { paraFicha } from "../src/engenharia/engenharia.mapeamento.js";
import { PrismaEngenhariaRepository } from "../src/engenharia/prisma-engenharia.repository.js";
import { MovimentosDeEstoque } from "../src/estoque/movimentos-de-estoque.js";
import { contextoBanco } from "../src/prisma/contexto-banco.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { assertSafeTestDatabaseUrl } from "./safe-test-environment";

/**
 * Ordens de serviço (PLU-345) contra o Postgres de verdade, no login da
 * aplicação (sem ser dono, com RLS): ciclo completo até o termo, check-in
 * antecipado, adiamento e cancelamento, a O.S. encerrada imutável, o pedido de
 * material pelo serviço de Compras e o recorte de Compras para a Engenharia
 * (cria só com a O.S. e lê só esses pedidos).
 *
 *     pnpm --filter @plugga/api test:engenharia
 */
const HABILITADO = process.env.RUN_ENGENHARIA_INTEGRATION_TESTS === "true";
const PRAZO = 60_000;
// Segunda, 23/11/2026, 10:00 em Manaus.
const AGORA = new Date("2026-11-23T14:00:00Z");

describe.skipIf(!HABILITADO)("engenharia: ordens de serviço no Postgres", { timeout: PRAZO }, () => {
  const root = new PrismaClient();
  const marca = `eng_${randomBytes(6).toString("hex")}`;
  const login = `${marca}_app`;
  const pessoas = new Map<string, { id: string; hash: string; acesso: Acesso }>();
  let app: PrismaService;
  let repo: PrismaEngenhariaRepository;
  let compras: ComprasService;
  let clienteId: string;
  let ucId: string;
  let pedidoDeCompras: string;
  let ambienteValidado = false;

  const principal = (nome: string): AuthPrincipal => ({ id: pessoas.get(nome)!.id, kind: "user", acesso: pessoas.get(nome)!.acesso });
  const como = <T>(nome: string, fazer: () => Promise<T>) => contextoBanco.run({ sessionHash: pessoas.get(nome)!.hash, agentHash: undefined }, fazer);
  const tx = <T>(nome: string, fazer: (t: Prisma.TransactionClient) => Promise<T>) => como(nome, () => app.comContexto(fazer));
  const criar = (dados: Record<string, unknown> = {}) => como("eng", () => repo.criar(criarOrdemDeServicoSchema.parse({
    empresa: "waze", tipo: "manutencao", clienteId, descricao: `${marca} inversor desligando`, prazo: "2026-11-30", ...dados,
  }), principal("eng"), AGORA));
  const acao = (id: string, dados: unknown, quando = AGORA) => como("eng", () => repo.executarAcao(id, acaoDaOrdemDeServicoSchema.parse(dados), principal("eng"), quando));
  const arquivo = (nome: string, tipo = "image/jpeg") => ({ chave: `${marca}/${nome}`, nome, tamanho: 10, tipo });
  const agendar = (id: string) => acao(id, { acao: "agendar", tecnicoId: pessoas.get("tecnico")!.id, data: "2026-11-23", horario: "15:00" });

  beforeAll(async () => {
    assertSafeTestDatabaseUrl(process.env.DATABASE_URL!, process.env.CI === "true", process.env.PLUGGA_TEST_DB_PORT);
    ambienteValidado = true;
    await root.$connect();
    if (!/^eng_[a-f0-9]+_app$/.test(login)) throw new Error("Login de fixture inválido");
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
    repo = new PrismaEngenhariaRepository(app, auditoria);
    compras = new ComprasService(new PrismaComprasRepository(app, auditoria, new MovimentosDeEstoque(auditoria)), {} as never, () => AGORA);

    for (const id of ["plugga", "waze"]) await root.company.upsert({ where: { id }, create: { id, name: id }, update: {} });
    const perfis: Record<string, { departamento: string; telas: string[] }> = {
      eng: { departamento: "engenharia-obras", telas: ["engenharia-obras.os"] },
      tecnico: { departamento: "engenharia-obras", telas: ["engenharia-obras.manutencao"] },
      compras: { departamento: "suprimentos", telas: ["suprimentos.compras"] },
      crm: { departamento: "crm", telas: ["crm.clientes"] },
    };
    for (const [nome, perfil] of Object.entries(perfis)) {
      const pessoa = await root.user.create({ data: { name: `${marca} ${nome}`, email: `${marca}-${nome}@teste.local` } });
      const hash = randomBytes(32).toString("hex");
      await root.session.create({ data: { userId: pessoa.id, tokenHash: hash, expiresAt: new Date(Date.now() + 3_600_000), absoluteExpiresAt: new Date(Date.now() + 7_200_000) } });
      await root.userDepartamento.create({ data: { userId: pessoa.id, departamento: perfil.departamento, nivel: "membro", telas: perfil.telas } });
      pessoas.set(nome, { id: pessoa.id, hash, acesso: { plataforma: null, departamentos: [{ departamento: perfil.departamento, nivel: "membro", telas: perfil.telas }] } as Acesso });
    }
    const cliente = await root.client.create({ data: { name: `${marca} Cliente Solar` } });
    clienteId = cliente.id;
    ucId = (await root.consumerUnit.create({ data: { clientId: clienteId, code: `${marca}-uc`, distributor: "Amazonas Energia" } })).id;
    // Pedido de Compras sem O.S.: a Engenharia não pode vê-lo.
    pedidoDeCompras = await como("compras", () => new PrismaComprasRepository(app, auditoria, new MovimentosDeEstoque(auditoria)).criar(criarPedidoDeCompraSchema.parse({
      empresa: "waze", titulo: `${marca} pedido de Compras`, destino: "interno", itens: [{ descricao: "Cabo", quantidade: "1" }], prazoEntregaDesejado: "2026-12-10",
    }), principal("compras"), AGORA));
  }, PRAZO);

  afterAll(async () => {
    await app?.$disconnect();
    if (ambienteValidado) {
      const ordens = clienteId === undefined ? [] : (await root.ordemDeServico.findMany({ where: { clientId: clienteId }, select: { id: true } })).map((o) => o.id);
      await root.$transaction(async (t) => {
        // Evidência e linha do tempo não se apagam pelo sistema; o dono limpa as fixtures sem os gatilhos.
        await t.$executeRawUnsafe("SET LOCAL session_replication_role = replica");
        await t.pedidoDeCompra.deleteMany({ where: { OR: [{ ordemDeServicoId: { in: ordens } }, { titulo: { startsWith: marca } }] } });
        await t.termoDeOrdemDeServico.deleteMany({ where: { ordemId: { in: ordens } } });
        await t.arquivoDeOrdemDeServico.deleteMany({ where: { ordemId: { in: ordens } } });
        await t.historicoDeOrdemDeServico.deleteMany({ where: { ordemId: { in: ordens } } });
        await t.ordemDeServico.deleteMany({ where: { id: { in: ordens } } });
      });
      if (clienteId) await root.client.deleteMany({ where: { id: clienteId } });
      await root.user.deleteMany({ where: { email: { startsWith: marca } } });
      await root.$executeRawUnsafe(`DROP ROLE IF EXISTS "${login}"`);
    }
    await root.$disconnect();
  }, PRAZO);

  it("percorre o ciclo até o termo, com check-in antecipado confirmado, e trava a O.S. concluída", async () => {
    const id = await criar({ ucId, equipamento: "Inversor", fabricante: "Growatt", numeroSerie: "GW123" });
    await acao(id, { acao: "agendar", tecnicoId: pessoas.get("tecnico")!.id, data: "2026-11-25", horario: "09:00" });

    // Antes do dia agendado: pede confirmação; confirmado, remarca para agora.
    await expect(acao(id, { acao: "check_in" })).rejects.toMatchObject({ extras: { motivo: "checkin_antecipado" } });
    await acao(id, { acao: "check_in", confirmarAntecipado: true });

    await expect(acao(id, { acao: "registrar_laudo", encontrado: "Disjuntor desarmado", feito: "Rearme" })).rejects.toThrow(RequisicaoInvalida);
    await como("eng", () => repo.registrarFoto(id, arquivo("foto.jpg"), principal("eng"), AGORA));
    await acao(id, { acao: "registrar_laudo", encontrado: "Disjuntor desarmado", feito: "Rearme e reaperto" });
    await como("eng", () => repo.registrarTermo(id, { modo: "nome_digitado", nome: "Maria Cliente", documento: "123.456.789-01" }, { assinatura: null, pdf: arquivo("termo.pdf", "application/pdf") }, principal("eng"), AGORA));

    const { linha, pessoas: nomes, clientes, ucs } = await como("eng", () => repo.ficha(id));
    const ficha = paraFicha(linha, nomes, clientes, ucs, principal("eng").acesso, AGORA);
    expect(ficha).toMatchObject({
      situacao: "concluida", coluna: "concluidas", cliente: { nome: `${marca} Cliente Solar` }, uc: { id: ucId },
      tecnico: { nome: `${marca} tecnico` }, equipamento: { fabricante: "Growatt", numeroSerie: "GW123" },
      laudo: { encontrado: "Disjuntor desarmado", registrado: { por: { nome: `${marca} eng` } } },
      termo: { modo: "nome_digitado", nome: "Maria Cliente", documentoMascarado: "•••89-01" }, acoesPermitidas: [],
    });
    expect(ficha.historico.map((h) => h.tipo)).toEqual(["criada", "agendada", "checkin_antecipado", "foto_enviada", "laudo_registrado", "termo_assinado", "concluida"]);
    expect(linha.agendadaPara).toEqual(AGORA);

    // Nenhum evento leva o documento de quem assinou.
    const eventos = await root.eventLog.findMany({ where: { entityType: "ordem_de_servico", entityId: id } });
    expect(eventos.map((e) => e.eventName)).toEqual(expect.arrayContaining(["engenharia.ordem.created", "engenharia.ordem.termo_assinado"]));
    expect(JSON.stringify(eventos)).not.toMatch(/789|Maria/);
    expect(JSON.stringify(ficha.historico)).not.toMatch(/789/);

    // A concluída não reabre nem muda, nem por fora do serviço.
    await expect(acao(id, { acao: "cancelar", motivo: "x" })).rejects.toThrow(EstadoInvalido);
    await expect(tx("eng", (t) => t.ordemDeServico.update({ where: { id }, data: { descricao: "outra" } }))).rejects.toThrow(/encerrada não muda/);
  });

  it("adia com motivo e nova data, volta pela agenda, e cancela guardando quem, quando e onde parou", async () => {
    const id = await criar();
    await agendar(id);
    await acao(id, { acao: "adiar", motivo: "Chuva forte", novaData: "2026-11-30" });
    let linha = await root.ordemDeServico.findUniqueOrThrow({ where: { id } });
    expect(linha).toMatchObject({ situacao: "adiada", adiamentoMotivo: "Chuva forte", adiadaPara: new Date("2026-11-30T04:00:00Z"), agendadaPara: null });

    await agendar(id);
    await acao(id, { acao: "cancelar", motivo: "Cliente vendeu o imóvel" });
    linha = await root.ordemDeServico.findUniqueOrThrow({ where: { id } });
    expect(linha).toMatchObject({ situacao: "cancelada", cancelamentoMotivo: "Cliente vendeu o imóvel", canceladaPorId: pessoas.get("eng")!.id, canceladaEmSituacao: "agendada" });
    expect(linha.canceladaEm).toEqual(AGORA);
  });

  it("recusa data no passado, técnico de fora da Engenharia e UC de outro cliente", async () => {
    await expect(criar({ prazo: "2026-11-20" })).rejects.toThrow(RequisicaoInvalida);
    const id = await criar();
    await expect(acao(id, { acao: "agendar", tecnicoId: pessoas.get("compras")!.id, data: "2026-11-24", horario: "09:00" })).rejects.toThrow(RequisicaoInvalida);
    await expect(acao(id, { acao: "agendar", tecnicoId: pessoas.get("tecnico")!.id, data: "2026-11-22", horario: "09:00" })).rejects.toThrow(RequisicaoInvalida);
    const outro = await root.client.create({ data: { name: `${marca} outro` } });
    const ucDeOutro = await root.consumerUnit.create({ data: { clientId: outro.id, code: `${marca}-outra`, distributor: "x" } });
    await expect(criar({ ucId: ucDeOutro.id })).rejects.toThrow(RequisicaoInvalida);
    await root.client.delete({ where: { id: outro.id } });
  });

  it("pede material pelo serviço de Compras, com quem pediu como solicitante e o vínculo na ficha", async () => {
    const id = await criar();
    await como("eng", () => repo.pedirMaterial(id, principal("eng"), AGORA, (ordem) => compras.criarDaOrdemDeServico(criarPedidoDeCompraSchema.parse({
      empresa: ordem.companyId, titulo: `${marca} material`, destino: "cliente", clientId: ordem.clientId,
      itens: [{ descricao: "String box", quantidade: "2" }], prazoEntregaDesejado: "2026-12-01",
    }), ordem.id, principal("eng"))));
    const pedido = await root.pedidoDeCompra.findFirstOrThrow({ where: { ordemDeServicoId: id }, include: { etapas: true, itens: true } });
    expect(pedido).toMatchObject({ solicitanteId: pessoas.get("eng")!.id, criadoPorId: pessoas.get("eng")!.id, etapa: "pedido_gerado", destino: "cliente", clientId: clienteId });
    expect(pedido.itens).toHaveLength(1);
    expect(pedido.etapas).toHaveLength(1);
    const { linha } = await como("eng", () => repo.ficha(id));
    expect(linha.pedidosDeCompra.map((p) => p.id)).toEqual([pedido.id]);
    expect(linha.historico.at(-1)).toMatchObject({ tipo: "material_pedido" });
  });

  it("RLS: a Engenharia lê só os pedidos das O.S. e cria só com a O.S., no próprio nome, sem alterar pedidos", async () => {
    const id = await criar();
    await como("eng", () => repo.pedirMaterial(id, principal("eng"), AGORA, (ordem) => compras.criarDaOrdemDeServico(criarPedidoDeCompraSchema.parse({
      empresa: ordem.companyId, titulo: `${marca} material rls`, destino: "interno", itens: [{ descricao: "Conector", quantidade: "4" }], prazoEntregaDesejado: "2026-12-01",
    }), ordem.id, principal("eng"))));
    const vinculado = await root.pedidoDeCompra.findFirstOrThrow({ where: { ordemDeServicoId: id }, select: { id: true } });

    const visiveis = await tx("eng", (t) => t.pedidoDeCompra.findMany({ where: { id: { in: [vinculado.id, pedidoDeCompras] } }, select: { id: true } }));
    expect(visiveis.map((p) => p.id)).toEqual([vinculado.id]);
    // Compras continua vendo tudo.
    expect(await tx("compras", (t) => t.pedidoDeCompra.count({ where: { id: { in: [vinculado.id, pedidoDeCompras] } } }))).toBe(2);

    const base = { companyId: "waze", titulo: `${marca} direto`, destino: "interno" as const, prazoEntregaDesejado: AGORA };
    const eng = pessoas.get("eng")!.id;
    await expect(tx("eng", (t) => t.pedidoDeCompra.create({ data: { ...base, solicitanteId: eng, criadoPorId: eng } }))).rejects.toThrow(/row-level security/);
    await expect(tx("eng", (t) => t.pedidoDeCompra.create({ data: { ...base, solicitanteId: pessoas.get("compras")!.id, criadoPorId: eng, ordemDeServicoId: id } }))).rejects.toThrow(/row-level security/);
    expect(await tx("eng", (t) => t.pedidoDeCompra.updateMany({ where: { id: vinculado.id }, data: { titulo: "trocado" } }))).toEqual({ count: 0 });
    expect(await tx("eng", (t) => t.itemDePedido.count({ where: { pedidoId: pedidoDeCompras } }))).toBe(0);
  });

  it("RLS: o pedido da Engenharia nasce em pedido gerado, sem marcos, e só recebe item e passagem nessa etapa", async () => {
    const id = await criar();
    const eng = pessoas.get("eng")!.id;
    const base = { companyId: "waze", titulo: `${marca} nasce`, destino: "interno" as const, prazoEntregaDesejado: AGORA, solicitanteId: eng, criadoPorId: eng, ordemDeServicoId: id };
    await expect(tx("eng", (t) => t.pedidoDeCompra.create({ data: { ...base, etapa: "pagamento" } }))).rejects.toThrow(/row-level security/);
    await expect(tx("eng", (t) => t.pedidoDeCompra.create({ data: { ...base, aprovadoEm: AGORA } }))).rejects.toThrow(/row-level security/);
    await expect(tx("eng", (t) => t.pedidoDeCompra.create({ data: { ...base, valorFaturado: "10.00" } }))).rejects.toThrow(/row-level security/);

    // Já em análise por Compras: a Engenharia não acrescenta item nem passagem.
    const pedido = await tx("eng", (t) => t.pedidoDeCompra.create({ data: base, select: { id: true } }));
    await expect(tx("eng", (t) => t.pedidoDeCompraEtapa.create({ data: { pedidoId: pedido.id, etapa: "cotacoes", entrouEm: AGORA, prazoDiasUteis: 2, prazoEm: AGORA } }))).rejects.toThrow(/row-level security/);
    await root.pedidoDeCompra.update({ where: { id: pedido.id }, data: { etapa: "analise_estoque" } });
    await expect(tx("eng", (t) => t.itemDePedido.create({ data: { pedidoId: pedido.id, descricao: "Cabo", quantidade: "1" } }))).rejects.toThrow(/row-level security/);
    await expect(tx("eng", (t) => t.pedidoDeCompraEtapa.create({ data: { pedidoId: pedido.id, etapa: "pedido_gerado", entrouEm: AGORA, prazoDiasUteis: 2, prazoEm: AGORA } }))).rejects.toThrow(/row-level security/);
  });

  it("as UCs da O.S. saem só de cliente ativo ou já referenciado por uma O.S.", async () => {
    const inativo = await root.client.create({ data: { name: `${marca} inativo`, active: false } });
    await root.consumerUnit.create({ data: { clientId: inativo.id, code: `${marca}-inativa`, distributor: "x" } });
    expect(await tx("eng", (t) => t.$queryRaw<{ id: string }[]>`SELECT id FROM plugga_security.ucs_para_engenharia(${[inativo.id]}::uuid[])`)).toEqual([]);
    expect((await tx("eng", (t) => t.$queryRaw<{ id: string }[]>`SELECT id FROM plugga_security.ucs_para_engenharia(${[clienteId]}::uuid[])`)).map((u) => u.id)).toContain(ucId);
    await root.client.delete({ where: { id: inativo.id } });
  });

  it("RLS: só a Engenharia vê as O.S.; ninguém apaga O.S. nem reescreve a linha do tempo", async () => {
    const id = await criar();
    expect(await tx("compras", (t) => t.ordemDeServico.count({ where: { id } }))).toBe(0);
    expect(await tx("crm", (t) => t.ordemDeServico.count({ where: { id } }))).toBe(0);
    await expect(tx("compras", (t) => t.ordemDeServico.create({ data: { companyId: "waze", tipo: "outros", clientId: clienteId, descricao: "x", prazo: AGORA } }))).rejects.toThrow(/row-level security/);
    await expect(tx("eng", (t) => t.ordemDeServico.deleteMany({ where: { id } }))).rejects.toThrow(/permission denied/);
    await expect(tx("eng", (t) => t.historicoDeOrdemDeServico.updateMany({ where: { ordemId: id }, data: { detalhe: "x" } }))).rejects.toThrow(/permission denied/);
    await expect(tx("eng", (t) => t.historicoDeOrdemDeServico.deleteMany({ where: { ordemId: id } }))).rejects.toThrow(/permission denied/);
    // Nomes só pelas funções: a Engenharia não lê `clients` nem `users` de fora.
    expect(await tx("eng", (t) => t.client.count({ where: { id: clienteId } }))).toBe(0);
    const clientes = await tx("eng", (t) => t.$queryRaw<{ id: string }[]>`SELECT id FROM plugga_security.clientes_para_engenharia(${marca}, NULL::uuid[])`);
    expect(clientes.map((c) => c.id)).toContain(clienteId);
    expect(await tx("compras", (t) => t.$queryRaw<{ id: string }[]>`SELECT id FROM plugga_security.clientes_para_engenharia(${marca}, NULL::uuid[])`)).toEqual([]);
  });

  it("lista com contagens por coluna e o grupo Atenção", async () => {
    const atrasada = await criar();
    await root.$executeRaw`UPDATE public.ordens_de_servico SET prazo = ${new Date("2026-11-20T04:00:00Z")} WHERE id = ${atrasada}::uuid`;
    const r = await como("eng", () => repo.lista({ busca: marca }, AGORA));
    expect(r.contagens.atrasadas).toBeGreaterThanOrEqual(1);
    expect(r.contagens.concluidas).toBe(1);
    expect(r.contagens.canceladas).toBe(1);
    expect(r.atrasadaMaisAntigaEm).toBe("2026-11-20");
    const so = await como("eng", () => repo.lista({ busca: marca, atencao: "atrasadas" }, AGORA));
    expect(so.linhas.map((l) => l.id)).toContain(atrasada);
    expect(so.linhas.every((l) => l.situacao !== "concluida" && l.situacao !== "cancelada")).toBe(true);
    const quadro = await como("eng", () => repo.quadro({ busca: marca }, AGORA));
    expect(quadro.linhas.some((l) => l.situacao === "cancelada")).toBe(false);
  });
});
