import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DealStatus } from "@plugga/shared";

import { AuditAppender } from "../src/audit/audit-appender";
import { ClientesService } from "../src/clientes/clientes.service";
import { PrismaClientesRepository } from "../src/clientes/prisma-clientes.repository";
import type { AuthPrincipal } from "../src/core/auth/auth.types";
import { PrismaNegociosRepository } from "../src/negocios/prisma-negocios.repository";
import { PrismaService } from "../src/prisma/prisma.service";
import { assertSafeTestDatabaseUrl } from "./safe-test-environment";

const API = path.resolve(__dirname, "..");
const MIGRATION = path.join(API, "prisma/migrations/20261105000000_backfill_perfis_leads_legados/migration.sql");
const require = createRequire(import.meta.url);
const PRAZO_MS = 60_000;

describe.skipIf(process.env.RUN_NEGOCIOS_INTEGRATION_TESTS !== "true")("upgrade do perfil do lead: backfill em schema exclusivo", () => {
  const schema = `backfill_lead_test_${randomUUID().replaceAll("-", "")}`;
  const administracao = new PrismaService();
  let schemaCriado = false;
  let prisma: PrismaService;
  let negocios: PrismaNegociosRepository;
  let principal: AuthPrincipal;
  let pipelineId: string;
  let stageId: string;
  let clientId: string;
  let contactId: string;

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL!;
    assertSafeTestDatabaseUrl(databaseUrl, process.env.CI === "true", process.env.PLUGGA_TEST_DB_PORT);
    const url = new URL(databaseUrl);
    url.searchParams.set("schema", schema);
    prisma = new PrismaService({ datasources: { db: { url: url.toString() } } });

    // Toda a estrutura e os enums pertencem ao schema deste teste; public não é alterado.
    const estrutura = execFileSync(process.execPath, [require.resolve("prisma/build/index.js"), "migrate", "diff", "--from-empty", "--to-schema-datamodel", path.join(API, "prisma/schema.prisma"), "--script"], { cwd: API, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).replaceAll('"public"', `"${schema}"`);
    expect(estrutura).not.toContain('"public"');
    await administracao.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
      await tx.$executeRawUnsafe(`DO $estrutura_backfill$ BEGIN ${estrutura} END $estrutura_backfill$;`);
    }, { timeout: PRAZO_MS });
    schemaCriado = true;
    await prisma.$executeRawUnsafe(`DO $versao_backfill$ BEGIN
      CREATE FUNCTION "${schema}"."increment_deal_version"() RETURNS TRIGGER AS $$ BEGIN NEW.version := OLD.version + 1; RETURN NEW; END; $$ LANGUAGE plpgsql;
      CREATE TRIGGER "deals_increment_version" BEFORE UPDATE ON "${schema}"."deals" FOR EACH ROW EXECUTE FUNCTION "${schema}"."increment_deal_version"();
    END $versao_backfill$;`);

    const usuario = await prisma.user.create({ data: { email: "backfill@teste.local", name: "Pessoa sintética", departamentos: { create: { departamento: "crm", nivel: "membro", telas: ["crm.pipelines"] } } } });
    principal = { id: usuario.id, kind: "user", acesso: { plataforma: null, departamentos: [{ departamento: "crm", nivel: "membro", telas: ["crm.pipelines"] }] } };
    await prisma.company.create({ data: { id: "plugga", name: "Plugga" } });
    const pipeline = await prisma.pipeline.create({ data: { companyId: "plugga", name: "Pipeline sintético", color: "#0077FF", valueLabel: "Valor", wonLabel: "Ganho", lostLabel: "Perdido", stages: { create: { name: "Legado", color: "#0077FF", position: 0 } } }, include: { stages: true } });
    pipelineId = pipeline.id;
    stageId = pipeline.stages[0]!.id;
    // A leitura positiva da migração usa cliente próprio; cadastro sem dono não é visível ao membro.
    const cliente = await prisma.client.create({ data: { ownerId: principal.id, personType: "pj", name: "Cliente sintético legado", company: "Empresa comercial sintética", legalName: "Razão social sintética", phone: "92999990000", email: "cliente@teste.local", postalCode: "69000000", street: "Rua sintética", addressComplement: "Sala sintética", district: "Bairro sintético", city: "Manaus", state: "AM", origin: "indicacao", notes: "Observação sintética", contacts: { create: { name: "Contato sintético escolhido", jobTitle: "Responsável", phone: "92988880000", email: "contato@teste.local", phoneIsWhatsapp: true, role: "decisor", isPrimary: true } } }, include: { contacts: true } });
    clientId = cliente.id;
    contactId = cliente.contacts[0]!.id;
    const auditoria = new AuditAppender();
    negocios = new PrismaNegociosRepository(prisma, auditoria, new ClientesService(new PrismaClientesRepository(prisma, auditoria)));
  }, PRAZO_MS);

  afterAll(async () => {
    await prisma?.$disconnect();
    // Identificador gerado aqui, jamais um schema fornecido pelo ambiente ou public.
    if (schemaCriado) {
      if (!/^backfill_lead_test_[0-9a-f]{32}$/.test(schema)) throw new Error("Schema de teste inválido.");
      await administracao.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    }
    await administracao.$disconnect();
  }, PRAZO_MS);

  const migrar = () => prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
    await tx.$executeRawUnsafe(readFileSync(MIGRATION, "utf8"));
  }, { timeout: PRAZO_MS });

  const legado = (status: DealStatus = "open", contato = false) => prisma.deal.create({ data: {
    pipelineId, stageId, clientId, ownerId: principal.id, title: `Negócio sintético ${randomUUID()}`, status,
    contactId: contato ? contactId : null, closedAt: status === "open" ? null : new Date("2026-10-20T12:00:00Z"),
    history: { create: { kind: "created", actorId: principal.id } },
  } });

  it("recupera negócios anteriores sem sobrescrever perfil, contato, cliente, situação ou histórico", async () => {
    const aberto = await legado("open", true);
    const ganho = await legado("won");
    const perdido = await legado("lost");
    const proprio = await legado("open", true);
    await prisma.leadProfile.create({ data: { dealId: proprio.id, personType: "pf", name: "Perfil próprio preservado", email: "proprio@teste.local" } });
    const proprioSemContato = await legado("open", true);
    const perfilSemContato = await prisma.leadProfile.create({ data: { dealId: proprioSemContato.id, personType: "pj", name: "Outro perfil próprio preservado", email: "outro-proprio@teste.local" } });
    const contatoProprio = await prisma.leadContact.create({ data: { dealId: proprio.id, name: "Contato próprio preservado", email: "proprio-contato@teste.local" } });
    await prisma.deal.update({ where: { id: proprio.id }, data: { leadContactId: contatoProprio.id } });
    const negociosAntes = await prisma.deal.findMany({ orderBy: { id: "asc" } });
    const historicoAntes = await prisma.dealHistory.findMany({ orderBy: { id: "asc" } });
    const clientesAntes = await prisma.client.findMany({ include: { contacts: true } });
    const perfilProprio = await prisma.leadProfile.findUniqueOrThrow({ where: { dealId: proprio.id } });

    await expect(negocios.list({ pipelineId, status: "all" }, principal)).rejects.toThrow();
    await expect(negocios.get(aberto.id, principal)).rejects.toThrow();
    await migrar();

    const { deals } = await negocios.list({ pipelineId, status: "all" }, principal);
    expect(deals).toHaveLength(5);
    for (const antigo of [aberto, ganho, perdido]) {
      const detalhe = await negocios.get(antigo.id, principal);
      expect(detalhe).toMatchObject({ status: antigo.status, pipelineId, stageId, client: { id: clientId }, lead: { name: "Cliente sintético legado", companyName: "Empresa comercial sintética", personType: "pj", legalName: "Razão social sintética", phone: "92999990000", email: "cliente@teste.local", postalCode: "69000000", street: "Rua sintética", addressComplement: "Sala sintética", district: "Bairro sintético", city: "Manaus", state: "AM", origin: "indicacao", notes: "Observação sintética" } });
      expect(detalhe.closedAt).toBe(antigo.closedAt?.toISOString() ?? null);
      const antes = negociosAntes.find((n) => n.id === antigo.id)!;
      const depois = await prisma.deal.findUniqueOrThrow({ where: { id: antigo.id } });
      expect(depois).toEqual(antigo.id === aberto.id ? { ...antes, leadContactId: expect.any(String), version: antes.version + 1 } : antes);
    }
    expect((await negocios.get(aberto.id, principal)).contact).toMatchObject({ name: "Contato sintético escolhido", jobTitle: "Responsável", role: "decisor", phoneIsWhatsapp: true });
    expect(await prisma.leadProfile.findUniqueOrThrow({ where: { dealId: proprio.id } })).toEqual(perfilProprio);
    expect(await prisma.leadContact.findUniqueOrThrow({ where: { id: contatoProprio.id } })).toEqual(contatoProprio);
    expect(await prisma.deal.findUniqueOrThrow({ where: { id: proprio.id } })).toEqual(negociosAntes.find((n) => n.id === proprio.id));
    expect(await prisma.leadProfile.findUniqueOrThrow({ where: { dealId: proprioSemContato.id } })).toEqual(perfilSemContato);
    expect((await negocios.get(proprioSemContato.id, principal)).contact).toMatchObject({ name: "Contato sintético escolhido" });
    expect(await prisma.deal.findUniqueOrThrow({ where: { id: proprioSemContato.id } })).toEqual({ ...proprioSemContato, leadContactId: expect.any(String), version: proprioSemContato.version + 1 });
    expect(await prisma.client.findMany({ include: { contacts: true } })).toEqual(clientesAntes);
    expect(await prisma.dealHistory.findMany({ orderBy: { id: "asc" } })).toEqual(historicoAntes);
    const perfis = await prisma.leadProfile.findMany({ orderBy: { dealId: "asc" } });
    const contatos = await prisma.leadContact.findMany({ orderBy: { id: "asc" } });
    const depois = await prisma.deal.findMany({ orderBy: { id: "asc" } });
    await migrar();
    expect(await prisma.leadProfile.findMany({ orderBy: { dealId: "asc" } })).toEqual(perfis);
    expect(await prisma.leadContact.findMany({ orderBy: { id: "asc" } })).toEqual(contatos);
    expect(await prisma.deal.findMany({ orderBy: { id: "asc" } })).toEqual(depois);
  }, PRAZO_MS);

  it("órfão sem perfil nem cliente bloqueia antes de alterar qualquer registro", async () => {
    const recuperavel = await legado("open", true);
    const orfao = await prisma.deal.create({ data: { pipelineId, stageId, ownerId: principal.id, title: "Órfão sintético sem identidade" } });
    const contatosAntes = await prisma.leadContact.count();
    try {
      await expect(migrar()).rejects.toThrow(/sem perfil e sem cliente/);
      expect(await prisma.leadProfile.findUnique({ where: { dealId: recuperavel.id } })).toBeNull();
      expect(await prisma.deal.findUniqueOrThrow({ where: { id: recuperavel.id } })).toEqual(recuperavel);
      expect(await prisma.leadContact.count()).toBe(contatosAntes);
    } finally {
      await prisma.deal.delete({ where: { id: orfao.id } });
    }
  }, PRAZO_MS);

  it("contato selecionado de outro cliente bloqueia antes de copiar dados ou mudar vínculos", async () => {
    const negocio = await legado();
    const outroCliente = await prisma.client.create({ data: { name: "Outro cliente sintético", contacts: { create: { name: "Contato de outro cliente sintético" } } }, include: { contacts: true } });
    const antes = await prisma.deal.update({ where: { id: negocio.id }, data: { contactId: outroCliente.contacts[0]!.id } });
    const contatosAntes = await prisma.leadContact.count();
    await expect(migrar()).rejects.toThrow(/contato\(s\) legado\(s\) incompatível/);
    expect(await prisma.leadProfile.findUnique({ where: { dealId: negocio.id } })).toBeNull();
    expect(await prisma.deal.findUniqueOrThrow({ where: { id: negocio.id } })).toEqual(antes);
    expect(await prisma.leadContact.count()).toBe(contatosAntes);
  }, PRAZO_MS);
});
