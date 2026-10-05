import { randomUUID } from "node:crypto";

import type { CriarPedidoRequest } from "@plugga/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditAppender } from "../src/audit/audit-appender.js";
import { PrismaComprasRepository } from "../src/compras/prisma-compras.repository.js";
import type { AuthPrincipal } from "../src/core/auth/auth.types.js";
import { PrismaService } from "../src/prisma/prisma.service.js";

/**
 * Numeração de pedido por empresa sob disputa, contra o Postgres de verdade.
 *
 *     RUN_ATOMICIDADE_INTEGRATION_TESTS=true pnpm --filter @plugga/api vitest run test/numeracao-pedido.integration.spec.ts
 *
 * Dois pedidos criados ao mesmo tempo na mesma empresa leem o mesmo "maior
 * número". O índice único (company_id, numero) derruba um deles com P2002, e
 * `comRepeticaoP2002` refaz a transação: a pessoa nunca vê o erro.
 */
const HABILITADO = process.env.RUN_ATOMICIDADE_INTEGRATION_TESTS === "true";
const PRAZO_MS = 60_000;

describe.skipIf(!HABILITADO)("compras: numeração de pedido sob disputa", () => {
  const prisma = new PrismaService();
  const repositorio = new PrismaComprasRepository(prisma, new AuditAppender());
  const marca = `atom-num-${randomUUID().slice(0, 8)}`;
  const solicitante: AuthPrincipal = { id: "", kind: "user", roles: ["compras"] };
  let obraId = "";
  let fornecedorId = "";

  beforeAll(async () => {
    await prisma.$connect();
    const user = await prisma.user.create({
      data: { email: `${marca}@teste.local`, name: `${marca} solicitante`, status: "active" },
    });
    solicitante.id = user.id;
    obraId = (await prisma.obra.create({ data: { companyId: "plugga", nome: `${marca} obra` } })).id;
    fornecedorId = (await prisma.fornecedor.create({ data: { companyId: "plugga", nome: `${marca} fornecedor` } })).id;
  }, PRAZO_MS);

  afterAll(async () => {
    // O event_log é só de inserção: o rastro fica, apontando para ids únicos.
    await prisma.pedidoDeCompra.deleteMany({ where: { titulo: { startsWith: marca } } });
    await prisma.fornecedor.deleteMany({ where: { nome: { startsWith: marca } } });
    await prisma.obra.deleteMany({ where: { nome: { startsWith: marca } } });
    await prisma.user.deleteMany({ where: { name: { startsWith: marca } } });
    await prisma.$disconnect();
  }, PRAZO_MS);

  function pedido(indice: number): CriarPedidoRequest {
    return {
      companyId: "plugga",
      titulo: `${marca} pedido ${indice}`,
      itens: [{ descricao: "Cabo 10mm", quantidade: "10.000", unidade: "m" }],
      destino: "obra",
      obraId,
      responsavelId: solicitante.id,
      prazoEntregaDesejado: "2026-12-01T12:00:00.000Z",
      valorOrcado: "100.00",
      cotacoes: [{ fornecedorId, valor: "90.00" }],
    } as CriarPedidoRequest;
  }

  const anexo = [{ arquivoChave: "cotacoes/teste/orc.pdf", arquivoNome: "orc.pdf" }];

  it(
    "pedidos simultâneos na mesma empresa recebem números distintos e todos são criados",
    async () => {
      const quantidade = 4;
      const resultados = await Promise.allSettled(
        Array.from({ length: quantidade }, (_, i) => repositorio.criarPedido(pedido(i), anexo, solicitante)),
      );

      // Ninguém vê erro: a repetição absorve a disputa.
      expect(resultados.filter((r) => r.status === "rejected")).toEqual([]);
      const criados = resultados.map((r) => (r as PromiseFulfilledResult<{ id: string; numero: number }>).value);
      expect(new Set(criados.map((c) => c.numero)).size).toBe(quantidade);

      const noBanco = await prisma.pedidoDeCompra.findMany({ where: { titulo: { startsWith: marca } } });
      expect(noBanco).toHaveLength(quantidade);

      // Cada pedido deixou exatamente um evento de criação, sem PII no payload.
      for (const criado of criados) {
        const eventos = await prisma.eventLog.findMany({
          where: { eventName: "compras.pedido.created", entityId: criado.id },
        });
        expect(eventos).toHaveLength(1);
        expect(eventos[0]?.payload).toMatchObject({ companyId: "plugga", numero: criado.numero });
      }
    },
    PRAZO_MS,
  );
});
