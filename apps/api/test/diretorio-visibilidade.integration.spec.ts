import { randomBytes, randomInt, randomUUID } from "node:crypto";

import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assertSafeTestDatabaseUrl } from "./safe-test-environment";

/**
 * Quem vê quem no diretório (RLS de users, user_departamentos e
 * user_platform_roles), sessão por sessão, com um ramo de dado para cada regra
 * do diretório: CRM, Contratos/Financeiro, Compras, Fornecedores e Estoque. A
 * matriz abaixo é a regra registrada antes da PLU-344 e tem de continuar igual
 * depois de qualquer mudança de desempenho. O segundo bloco garante que o
 * diretório é avaliado uma vez por comando, e não uma vez por pessoa.
 *
 *     RUN_RLS_INTEGRATION_TESTS=true pnpm --filter @plugga/api exec vitest run test/diretorio-visibilidade.integration.spec.ts
 */
const HABILITADO = process.env.RUN_RLS_INTEGRATION_TESTS === "true";
const PRAZO = 60_000;

type Sessao = "valida" | "expirada";
type Pessoa = {
  departamento?: [string, "membro" | "gerente", string[]];
  papeis?: string[];
  inativa?: boolean;
  sessao?: Sessao;
};

const PESSOAS = {
  dev: { papeis: ["desenvolvedor", "admin"], sessao: "valida" },
  admin: { papeis: ["admin"], sessao: "valida" },
  crmGerente: { departamento: ["crm", "gerente", ["crm.clientes", "crm.pipelines", "crm.contratos"]], sessao: "valida" },
  pipelines: { departamento: ["crm", "membro", ["crm.pipelines"]], sessao: "valida" },
  clientes: { departamento: ["crm", "membro", ["crm.clientes"]], sessao: "valida" },
  contratos: { departamento: ["crm", "membro", ["crm.contratos"]], sessao: "valida" },
  financeiro: { departamento: ["financeiro", "gerente", ["financeiro.receber"]], sessao: "valida" },
  compras: { departamento: ["suprimentos", "membro", ["suprimentos.compras"]], sessao: "valida" },
  fornecedores: { departamento: ["suprimentos", "membro", ["suprimentos.fornecedores"]], sessao: "valida" },
  estoque: { departamento: ["suprimentos", "membro", ["suprimentos.estoque"]], sessao: "valida" },
  semTela: { departamento: ["crm", "membro", []], sessao: "valida" },
  energia: { departamento: ["energia-opm", "membro", ["energia-opm.ciclos"]], sessao: "valida" },
  semDepartamento: { sessao: "valida" },
  inativo: { departamento: ["crm", "membro", ["crm.pipelines"]], inativa: true, sessao: "valida" },
  expirada: { departamento: ["crm", "membro", ["crm.pipelines"]], sessao: "expirada" },
  plataformaInativa: { papeis: ["admin"], inativa: true },
  comprasInativo: { departamento: ["suprimentos", "membro", ["suprimentos.compras"]], inativa: true },
  // Só aparecem nos registros dos outros domínios.
  donoNegocio: {}, criadorNegocio: {}, atorHistorico: {}, membroDoPipeline: {}, donoOportunidade: {},
  donoCliente: {}, donoContrato: {}, solicitante: {}, aprovador: {}, responsavelEtapa: {}, saiuEtapa: {},
  cotador: {}, lancador: {}, conciliador: {}, fornecedorCriador: {}, fornecedorAtualizador: {},
  movimentador: {}, reservador: {}, encerrador: {}, itemCriador: {}, isolado: {},
} satisfies Record<string, Pessoa>;
type Nome = keyof typeof PESSOAS;
const TODOS = Object.keys(PESSOAS) as Nome[];

const CRM_ELEGIVEIS_PIPELINES: Nome[] = ["dev", "admin", "crmGerente", "pipelines", "expirada"];
const DO_PEDIDO: Nome[] = ["solicitante", "aprovador", "responsavelEtapa", "saiuEtapa", "cotador", "lancador", "conciliador", "compras"];

// A regra do diretório, registrada pessoa a pessoa antes da PLU-344.
const VISIVEIS: Record<Nome | "semUsuario", Nome[]> = {
  dev: TODOS,
  admin: TODOS,
  crmGerente: ["crmGerente", "pipelines", "clientes", "contratos", "expirada", "dev", "admin",
    "donoNegocio", "criadorNegocio", "atorHistorico", "membroDoPipeline", "donoOportunidade", "donoCliente", "donoContrato"],
  pipelines: [...CRM_ELEGIVEIS_PIPELINES, "donoNegocio", "criadorNegocio", "atorHistorico", "membroDoPipeline", "donoOportunidade"],
  clientes: ["clientes", "crmGerente", "dev", "admin", "donoCliente"],
  contratos: ["contratos", "crmGerente", "dev", "admin", "donoContrato"],
  financeiro: ["financeiro", "donoContrato", ...DO_PEDIDO],
  compras: DO_PEDIDO,
  fornecedores: ["fornecedores", "fornecedorCriador", "fornecedorAtualizador"],
  estoque: ["estoque", "movimentador", "reservador", "encerrador", "itemCriador"],
  semTela: ["semTela"],
  energia: ["energia"],
  semDepartamento: ["semDepartamento"],
  inativo: [],
  expirada: [],
  semUsuario: [],
  plataformaInativa: [], comprasInativo: [], donoNegocio: [], criadorNegocio: [], atorHistorico: [],
  membroDoPipeline: [], donoOportunidade: [], donoCliente: [], donoContrato: [], solicitante: [], aprovador: [],
  responsavelEtapa: [], saiuEtapa: [], cotador: [], lancador: [], conciliador: [], fornecedorCriador: [],
  fornecedorAtualizador: [], movimentador: [], reservador: [], encerrador: [], itemCriador: [], isolado: [],
};
const OBSERVADORES = [...(Object.keys(PESSOAS) as Nome[]).filter((n) => (PESSOAS[n] as Pessoa).sessao), "semUsuario"] as const;

describe.skipIf(!HABILITADO)("RLS: diretório de pessoas por sessão", { timeout: PRAZO }, () => {
  const root = new PrismaClient();
  const marca = `dir_${randomBytes(8).toString("hex")}`;
  const login = `${marca}_app`;
  let app: PrismaClient | undefined;
  let ambienteValidado = false;
  const ids = new Map<Nome, string>();
  const hashes = new Map<string, string>();
  const nomePorId = new Map<string, Nome>();
  const registros: Record<string, string> = {};

  const id = (nome: Nome) => ids.get(nome)!;
  const naSessao = <T>(observador: string, operacao: (tx: Prisma.TransactionClient) => Promise<T>) =>
    app!.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('plugga.session_hash', ${hashes.get(observador) ?? randomBytes(32).toString("hex")}, true)`;
      return operacao(tx);
    });
  const nomes = (linhas: { id: string }[]) => linhas.map((l) => nomePorId.get(l.id)).filter(Boolean).sort();

  beforeAll(async () => {
    assertSafeTestDatabaseUrl(process.env.DATABASE_URL!, process.env.CI === "true", process.env.PLUGGA_TEST_DB_PORT);
    ambienteValidado = true;
    await root.$connect();
    const [executor] = await root.$queryRaw<{ superuser: boolean }[]>`SELECT rolsuper AS superuser FROM pg_roles WHERE rolname = current_user`;
    expect(executor?.superuser, "Fixtures exigem root do banco local isolado").toBe(true);
    if (!/^dir_[a-f0-9]+_app$/.test(login)) throw new Error("Login de fixture inválido");
    const senha = randomBytes(32).toString("hex");
    await root.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('plugga.test_role', ${login}, true)`;
      await tx.$executeRaw`SELECT set_config('plugga.test_password', ${senha}, true)`;
      await tx.$executeRawUnsafe(`DO $fixture$ BEGIN EXECUTE format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L', current_setting('plugga.test_role'), current_setting('plugga.test_password')); END $fixture$`);
    });
    await root.$executeRawUnsafe(`GRANT plugga_runtime TO "${login}"`);
    // Conta as chamadas às funções de segurança dentro da transação do login.
    await root.$executeRawUnsafe(`ALTER ROLE "${login}" SET track_functions = 'all'`);
    const url = new URL(process.env.DATABASE_URL!);
    url.username = login;
    url.password = senha;
    url.searchParams.set("connection_limit", "2");
    app = new PrismaClient({ datasources: { db: { url: url.toString() } } });

    await root.company.create({ data: { id: marca, name: marca } });
    for (const chave of ["admin", "desenvolvedor"]) await root.role.upsert({ where: { key: chave }, create: { key: chave, name: chave }, update: {} });
    for (const nome of TODOS) {
      const pessoa: Pessoa = PESSOAS[nome];
      const usuario = await root.user.create({ data: { name: marca, email: `${marca}-${nome.toLowerCase()}@teste.local`, status: pessoa.inativa ? "inactive" : "active" } });
      ids.set(nome, usuario.id);
      nomePorId.set(usuario.id, nome);
      if (pessoa.papeis) {
        const papeis = await root.role.findMany({ where: { key: { in: pessoa.papeis } } });
        await root.userPlatformRole.createMany({ data: papeis.map((papel) => ({ userId: usuario.id, roleId: papel.id })) });
      }
      if (pessoa.departamento) {
        const [departamento, nivel, telas] = pessoa.departamento;
        await root.userDepartamento.create({ data: { userId: usuario.id, departamento, nivel, telas } });
      }
      if (pessoa.sessao) {
        const hash = randomBytes(32).toString("hex");
        hashes.set(nome, hash);
        const prazo = pessoa.sessao === "valida" ? 3_600_000 : -60_000;
        await root.session.create({ data: { userId: usuario.id, tokenHash: hash, expiresAt: new Date(Date.now() + prazo), absoluteExpiresAt: new Date(Date.now() + 7_200_000) } });
      }
    }

    // Um registro por ramo do diretório. As regras de negócio dessas tabelas
    // (gatilhos de numeração e coerência) não interessam aqui: o root grava em
    // modo réplica, e as checagens de linha continuam valendo.
    for (const chave of ["pipeline", "etapa", "negocio", "cliente", "pedido", "itemDoPedido", "fornecedor", "item"]) registros[chave] = randomUUID();
    const r = registros;
    const codigo = marca.slice(4).toUpperCase();
    await root.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL session_replication_role = replica");
      await tx.$executeRaw`INSERT INTO pipelines (id, company_id, name, value_label, color, won_label, lost_label) VALUES (${r.pipeline}::uuid, ${marca}, ${marca}, 'Valor', 'blue', 'Ganho', 'Perdido')`;
      await tx.$executeRaw`INSERT INTO pipeline_stages (id, pipeline_id, name, color, position) VALUES (${r.etapa}::uuid, ${r.pipeline}::uuid, ${marca}, 'blue', 0)`;
      await tx.$executeRaw`INSERT INTO deals (id, pipeline_id, stage_id, owner_id, created_by_id, title) VALUES (${r.negocio}::uuid, ${r.pipeline}::uuid, ${r.etapa}::uuid, ${id("donoNegocio")}::uuid, ${id("criadorNegocio")}::uuid, ${marca})`;
      await tx.$executeRaw`INSERT INTO deal_history (deal_id, kind, actor_id) VALUES (${r.negocio}::uuid, 'created', ${id("atorHistorico")}::uuid)`;
      await tx.$executeRaw`INSERT INTO pipeline_members (pipeline_id, user_id, role) VALUES (${r.pipeline}::uuid, ${id("membroDoPipeline")}::uuid, 'vendedor')`;
      await tx.$executeRaw`INSERT INTO opportunities (title, product, owner_id, updated_at) VALUES (${marca}, ${marca}, ${id("donoOportunidade")}::uuid, now())`;
      await tx.$executeRaw`INSERT INTO clients (id, name, owner_id, updated_at) VALUES (${r.cliente}::uuid, ${marca}, ${id("donoCliente")}::uuid, now())`;
      await tx.$executeRaw`INSERT INTO contracts (client_id, owner_id, updated_at) VALUES (${r.cliente}::uuid, ${id("donoContrato")}::uuid, now())`;
      await tx.$executeRaw`INSERT INTO pedidos_de_compra (id, company_id, titulo, destino, solicitante_id, aprovou_id, prazo_entrega_desejado, updated_at)
        VALUES (${r.pedido}::uuid, ${marca}, ${marca}, 'interno', ${id("solicitante")}::uuid, ${id("aprovador")}::uuid, now(), now())`;
      await tx.$executeRaw`INSERT INTO pedidos_de_compra_etapas (pedido_id, etapa, entrou_em, prazo_dias_uteis, prazo_em, responsavel_id, saiu_por_id)
        VALUES (${r.pedido}::uuid, 'pedido_gerado', now(), 1, now(), ${id("responsavelEtapa")}::uuid, ${id("saiuEtapa")}::uuid)`;
      await tx.$executeRaw`INSERT INTO fornecedores (id, nome, categoria, updated_at, criado_por_id, atualizado_por_id)
        VALUES (${r.fornecedor}::uuid, ${marca}, 'outros', now(), ${id("fornecedorCriador")}::uuid, ${id("fornecedorAtualizador")}::uuid)`;
      await tx.$executeRaw`INSERT INTO cotacoes_de_compra (pedido_id, fornecedor_id, valor, arquivo_chave, arquivo_nome, criado_por_id)
        VALUES (${r.pedido}::uuid, ${r.fornecedor}::uuid, 1, ${marca}, ${marca}, ${id("cotador")}::uuid)`;
      await tx.$executeRaw`INSERT INTO lancamentos (tipo, numero, company_id, descricao, valor, vencimento, etapa, origem, fornecedor_id, updated_at, criado_por_id, conciliado_por_id)
        VALUES ('saida', ${randomInt(1_000_000_000, 2_000_000_000)}, ${marca}, ${marca}, 1, now(), 'aberta', 'avulsa', ${r.fornecedor}::uuid, now(), ${id("lancador")}::uuid, ${id("conciliador")}::uuid)`;
      await tx.$executeRaw`INSERT INTO itens_de_estoque (id, company_id, codigo, nome, categoria, unidade, updated_at, criado_por_id)
        VALUES (${r.item}::uuid, ${marca}, ${codigo}, ${marca}, 'outros', 'un', now(), ${id("itemCriador")}::uuid)`;
      await tx.$executeRaw`INSERT INTO itens_de_pedido (id, pedido_id, descricao, quantidade) VALUES (${r.itemDoPedido}::uuid, ${r.pedido}::uuid, ${marca}, 1)`;
      await tx.$executeRaw`INSERT INTO reservas_de_estoque (item_id, pedido_id, item_do_pedido_id, quantidade, estado, reservada_por_id, encerrada_em, encerrada_por_id)
        VALUES (${r.item}::uuid, ${r.pedido}::uuid, ${r.itemDoPedido}::uuid, 1, 'liberada', ${id("reservador")}::uuid, now(), ${id("encerrador")}::uuid)`;
      await tx.$executeRaw`INSERT INTO movimentacoes_de_estoque (item_id, tipo, data, quantidade, saldo_depois, registrada_por_id)
        VALUES (${r.item}::uuid, 'saida', now(), 1, 0, ${id("movimentador")}::uuid)`;
    });
  }, PRAZO);

  afterAll(async () => {
    await app?.$disconnect();
    if (!ambienteValidado) {
      await root.$disconnect();
      return;
    }
    const r = registros;
    if (r.pedido) {
      // Movimentação e lançamento são só de inserção: o teardown, como dono do
      // banco de teste, desliga os gatilhos só nesta transação.
      await root.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL session_replication_role = replica");
        await tx.$executeRaw`DELETE FROM movimentacoes_de_estoque WHERE item_id = ${r.item}::uuid`;
        await tx.$executeRaw`DELETE FROM reservas_de_estoque WHERE item_id = ${r.item}::uuid`;
        await tx.$executeRaw`DELETE FROM itens_de_pedido WHERE pedido_id = ${r.pedido}::uuid`;
        await tx.$executeRaw`DELETE FROM itens_de_estoque WHERE id = ${r.item}::uuid`;
        await tx.$executeRaw`DELETE FROM lancamentos WHERE company_id = ${marca}`;
        await tx.$executeRaw`DELETE FROM cotacoes_de_compra WHERE pedido_id = ${r.pedido}::uuid`;
        await tx.$executeRaw`DELETE FROM pedidos_de_compra_etapas WHERE pedido_id = ${r.pedido}::uuid`;
        await tx.$executeRaw`DELETE FROM pedidos_de_compra WHERE id = ${r.pedido}::uuid`;
        await tx.$executeRaw`DELETE FROM fornecedores WHERE id = ${r.fornecedor}::uuid`;
        await tx.$executeRaw`DELETE FROM contracts WHERE client_id = ${r.cliente}::uuid`;
        await tx.$executeRaw`DELETE FROM clients WHERE id = ${r.cliente}::uuid`;
        await tx.$executeRaw`DELETE FROM opportunities WHERE title = ${marca}`;
        await tx.$executeRaw`DELETE FROM deal_history WHERE deal_id = ${r.negocio}::uuid`;
        await tx.$executeRaw`DELETE FROM deals WHERE id = ${r.negocio}::uuid`;
        await tx.$executeRaw`DELETE FROM pipeline_members WHERE pipeline_id = ${r.pipeline}::uuid`;
        await tx.$executeRaw`DELETE FROM pipeline_stages WHERE pipeline_id = ${r.pipeline}::uuid`;
        await tx.$executeRaw`DELETE FROM pipelines WHERE id = ${r.pipeline}::uuid`;
      });
    }
    await root.user.deleteMany({ where: { email: { startsWith: `${marca}-` } } });
    await root.company.deleteMany({ where: { id: marca } });
    await root.$executeRawUnsafe(`DROP ROLE IF EXISTS "${login}"`);
    await root.$disconnect();
  }, PRAZO);

  it.each(OBSERVADORES)("a sessão %s vê exatamente as pessoas da regra", async (observador) => {
    const esperado = [...VISIVEIS[observador]].sort();
    const fixtures = [...ids.values()];
    const { pessoas, departamentos, papeis, uma } = await naSessao(observador, async (tx) => ({
      pessoas: await tx.$queryRaw<{ id: string }[]>`SELECT id FROM users WHERE id = ANY(${fixtures}::uuid[])`,
      departamentos: await tx.$queryRaw<{ id: string }[]>`SELECT DISTINCT user_id AS id FROM user_departamentos WHERE user_id = ANY(${fixtures}::uuid[])`,
      papeis: await tx.$queryRaw<{ id: string }[]>`SELECT DISTINCT user_id AS id FROM user_platform_roles WHERE user_id = ANY(${fixtures}::uuid[])`,
      // Busca pontual pelo id, o formato das checagens de responsável.
      uma: await Promise.all(TODOS.map(async (nome) =>
        (await tx.$queryRaw<{ id: string }[]>`SELECT id FROM users WHERE id = ${id(nome)}::uuid`).length === 1 ? nome : null)),
    }));
    expect(nomes(pessoas)).toEqual(esperado);
    expect(uma.filter(Boolean).sort()).toEqual(esperado);
    // Departamentos e papéis seguem a mesma regra da pessoa.
    expect(nomes(departamentos)).toEqual(esperado.filter((n) => (PESSOAS[n] as Pessoa).departamento));
    expect(nomes(papeis)).toEqual(esperado.filter((n) => (PESSOAS[n] as Pessoa).papeis));
  });

  it("o diretório é avaliado uma vez por comando, não uma vez por pessoa", async () => {
    const chamadas = await naSessao("crmGerente", async (tx) => {
      const contar = async () => (await tx.$queryRaw<{ total: bigint }[]>`
        SELECT coalesce(sum(pg_stat_get_xact_function_calls(p.oid)), 0)::bigint AS total
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'plugga_security'`)[0]!.total;
      const medir = async (consulta: Prisma.Sql) => {
        const antes = await contar();
        await tx.$queryRaw(consulta);
        return Number((await contar()) - antes);
      };
      const [visiveis] = await tx.$queryRaw<{ pessoas: bigint }[]>`SELECT count(*) AS pessoas FROM users`;
      return {
        pessoas: Number(visiveis!.pessoas),
        todas: await medir(Prisma.sql`SELECT count(*) FROM users`),
        uma: await medir(Prisma.sql`SELECT id FROM users WHERE id = ${id("crmGerente")}::uuid`),
        departamentos: await medir(Prisma.sql`SELECT count(*) FROM user_departamentos`),
      };
    });
    expect(chamadas.pessoas).toBeGreaterThanOrEqual(VISIVEIS.crmGerente.length);
    expect(chamadas.todas, "o diretório não pode crescer com o número de pessoas").toBeLessThanOrEqual(chamadas.uma);
    expect(chamadas.todas).toBeLessThanOrEqual(3);
    expect(chamadas.departamentos).toBeLessThanOrEqual(3);
  });
});
