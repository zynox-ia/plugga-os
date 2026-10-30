import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditAppender } from "../src/audit/audit-appender.js";
import { PrismaClientesRepository } from "../src/clientes/prisma-clientes.repository.js";
import { PrismaCommercialRepository } from "../src/commercial/prisma-commercial.repository.js";
import type { AuthPrincipal } from "../src/core/auth/auth.types.js";
import { PrismaService } from "../src/prisma/prisma.service.js";

/**
 * O event_log não guarda dado pessoal (US8, FR-034): criar e editar cliente e
 * oportunidade grava só nomes de campos e identificadores.
 *
 * Exige banco no ar, então fica atrás de variável:
 *
 *     RUN_EVENTOS_PII_INTEGRATION_TESTS=true pnpm --filter @plugga/api test:eventos-pii
 *
 * O teste usa valores únicos por execução e varre o payload de TODO o
 * event_log atrás deles, não só dos eventos esperados: um evento esquecido em
 * outro caminho também seria pego.
 */
const HABILITADO = process.env.RUN_EVENTOS_PII_INTEGRATION_TESTS === "true";
const PRAZO_MS = 60_000;

describe.skipIf(!HABILITADO)("event_log sem dado pessoal", () => {
  const prisma = new PrismaService();
  const auditoria = new AuditAppender();
  const clientes = new PrismaClientesRepository(prisma, auditoria);
  const comercial = new PrismaCommercialRepository(prisma, auditoria);

  const marca = `pii${randomUUID().slice(0, 8)}`;
  const principal: AuthPrincipal = { id: "", kind: "user", acesso: { plataforma: "admin", departamentos: [] } };
  const nome = `Fulana ${marca}`;
  const nomeEditado = `Beltrana ${marca}`;
  const email = `${marca}@teste.local`;
  const emailEditado = `${marca}-novo@teste.local`;
  const telefone = "11 98765-4321";
  const telefoneEditado = "11 91234-5678";
  const nota = `Falar com ${marca} depois`;

  const termos = [
    nome,
    nomeEditado,
    email,
    emailEditado,
    telefone,
    telefoneEditado,
    "987654321",
    "912345678",
    nota,
    marca,
  ];

  beforeAll(async () => {
    await prisma.$connect();
    // O responsável pelo cliente precisa ter papel comercial, de diretoria ou admin (PLU-268).
    const admin = await prisma.role.upsert({ where: { key: "admin" }, create: { key: "admin", name: "Admin" }, update: {} });
    const user = await prisma.user.create({
      data: { email: `${marca}-owner@teste.local`, name: `Dono ${marca}`, status: "active", platformRoles: { create: { roleId: admin.id } } },
    });
    principal.id = user.id;
  }, PRAZO_MS);

  afterAll(async () => {
    // O event_log é append-only: o rastro fica. Só o cadastro é limpo.
    await prisma.opportunityContact.deleteMany({ where: { opportunity: { title: { startsWith: marca } } } });
    await prisma.opportunity.deleteMany({ where: { title: { startsWith: marca } } });
    await prisma.client.deleteMany({ where: { email: { contains: marca } } });
    await prisma.user.deleteMany({ where: { email: { contains: marca } } });
    await prisma.$disconnect();
  }, PRAZO_MS);

  it(
    "criar e editar cliente (com contato) e oportunidade não deixa nome, e-mail nem telefone no payload",
    async () => {
      const criado = await clientes.create({ personType: "pj", name: nome, email, phone: telefone }, principal);
      const clienteId = criado.client.id;
      await clientes.update(clienteId, { name: nomeEditado, email: emailEditado, phone: telefoneEditado }, principal);
      // Contato do cliente: os eventos de contato também não podem carregar nome, e-mail ou telefone.
      await clientes.addContact(clienteId, { name: nome, email, phone: telefone }, principal);
      await clientes.inactivate(clienteId, { reason: nota }, principal);

      const oportunidade = await comercial.createOpportunity(
        {
          title: `${marca} oportunidade`,
          product: "teste",
          clientId: clienteId,
          ownerId: principal.id,
          nextActionAt: new Date(Date.now() + 86_400_000).toISOString(),
          nextActionNote: nota,
        },
        principal,
      );
      await comercial.registerOpportunityContact(
        oportunidade.id,
        { channel: "phone", outcome: "connected", note: nota },
        principal,
      );

      // Os eventos esperados existem (a varredura não pode passar por vazio)...
      const eventos = await prisma.eventLog.findMany({
        where: { entityId: { in: [clienteId, oportunidade.id] } },
      });
      const nomes = eventos.map((e) => e.eventName);
      for (const esperado of [
        "clientes.client_created",
        "clientes.client_updated",
        "clientes.client_inactivated",
        "commercial.opportunity_created",
      ]) {
        expect(nomes).toContain(esperado);
      }
      const atualizado = eventos.find((e) => e.eventName === "clientes.client_updated");
      expect(atualizado?.payload).toEqual({ campos: ["name", "email", "phone"] });

      // ...e nenhum payload do log inteiro contém os valores usados.
      let achados = 0;
      for (const termo of termos) {
        const linhas = await prisma.$queryRaw<{ id: string }[]>`
          SELECT id FROM event_log WHERE payload::text ILIKE ${`%${termo}%`}`;
        achados += linhas.length;
      }
      expect(achados).toBe(0);
    },
    PRAZO_MS,
  );
});
