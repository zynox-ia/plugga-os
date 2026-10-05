import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditAppender } from "../src/audit/audit-appender.js";
import { EstadoInvalido } from "../src/common/errors/dominio.js";
import { PrismaCommercialRepository } from "../src/commercial/prisma-commercial.repository.js";
import type { AuthPrincipal } from "../src/core/auth/auth.types.js";
import { PrismaService } from "../src/prisma/prisma.service.js";

/**
 * Ganhar uma oportunidade com cliente novo, contra o Postgres de verdade.
 *
 * Exige banco no ar, então fica atrás de variável:
 *
 *     RUN_ATOMICIDADE_INTEGRATION_TESTS=true pnpm --filter @plugga/api vitest run test/atomicidade-comercial.integration.spec.ts
 *
 * O que se prova: o cliente novo e a marcação "ganha" saem na mesma transação.
 * Se a marcação falha, não sobra cliente órfão (nem o evento dele).
 */
const HABILITADO = process.env.RUN_ATOMICIDADE_INTEGRATION_TESTS === "true";
const PRAZO_MS = 60_000;

/**
 * Devolve um PrismaService cuja PRIMEIRA leitura de oportunidade a mostra
 * aberta, mesmo já decidida: reproduz a janela entre a checagem e a transação.
 */
function iludirPrimeiraLeitura(real: PrismaService): PrismaService {
  let iludir = true;
  const ligar = (alvo: object, chave: string | symbol) => {
    const valor = Reflect.get(alvo, chave) as unknown;
    return typeof valor === "function" ? (valor as (...a: unknown[]) => unknown).bind(alvo) : valor;
  };
  return new Proxy(real, {
    get(alvo, chave) {
      if (chave !== "opportunity") return ligar(alvo, chave);
      const delegate = alvo.opportunity;
      return new Proxy(delegate, {
        get(d, metodo) {
          if (metodo === "findUnique" && iludir) {
            iludir = false;
            return async (args: Parameters<typeof d.findUnique>[0]) => {
              const linha = await d.findUnique(args);
              return linha ? { ...linha, status: "aberta" } : linha;
            };
          }
          return ligar(d, metodo);
        },
      });
    },
  });
}

describe.skipIf(!HABILITADO)("comercial: ganhar oportunidade é atômico", () => {
  const prisma = new PrismaService();
  const repositorio = new PrismaCommercialRepository(prisma, new AuditAppender());
  const marca = `atom-com-${randomUUID().slice(0, 8)}`;
  const principal: AuthPrincipal = { id: randomUUID(), kind: "user", roles: ["comercial"] };
  const oportunidades: string[] = [];

  async function novaOportunidade(extra: { status?: "aberta" | "perdida" } = {}): Promise<string> {
    const linha = await prisma.opportunity.create({
      data: {
        title: `${marca} oportunidade`,
        product: "teste",
        status: extra.status ?? "aberta",
        nextActionAt: new Date(Date.now() + 86_400_000),
      },
    });
    oportunidades.push(linha.id);
    return linha.id;
  }

  const clientesDaMarca = (email: string) => prisma.client.findMany({ where: { email } });

  beforeAll(async () => {
    await prisma.$connect();
  }, PRAZO_MS);

  afterAll(async () => {
    // O event_log é só de inserção: o rastro fica, apontando para ids únicos.
    await prisma.opportunity.deleteMany({ where: { title: { startsWith: marca } } });
    await prisma.client.deleteMany({ where: { name: { startsWith: marca } } });
    await prisma.$disconnect();
  }, PRAZO_MS);

  it(
    "cria o cliente e marca como ganha juntos, com os dois eventos",
    async () => {
      const id = await novaOportunidade();
      const email = `${marca}-ok@teste.local`;

      const detalhe = await repositorio.winOpportunity(
        id,
        { newClient: { name: `${marca} cliente ok`, email } },
        principal,
      );

      expect(detalhe.status).toBe("ganha");
      const clientes = await clientesDaMarca(email);
      expect(clientes).toHaveLength(1);
      expect(detalhe.clientId).toBe(clientes[0]?.id);

      const ganha = await prisma.eventLog.findMany({
        where: { eventName: "commercial.opportunity.won", entityId: id },
      });
      expect(ganha).toHaveLength(1);
      expect(ganha[0]?.payload).toEqual({ clientId: clientes[0]?.id });
      const criado = await prisma.eventLog.findMany({
        where: { eventName: "clientes.client.created", entityId: clientes[0]!.id },
      });
      expect(criado).toHaveLength(1);
      expect(JSON.stringify(criado[0]?.payload)).not.toContain(email);
    },
    PRAZO_MS,
  );

  it(
    "falha ao marcar como ganha não deixa cliente criado nem evento",
    async () => {
      // A oportunidade já foi decidida por outra pessoa, mas a leitura inicial
      // ainda a vê aberta: é exatamente a janela da corrida.
      const id = await novaOportunidade({ status: "perdida" });
      const email = `${marca}-orfao@teste.local`;
      const repositorioIludido = new PrismaCommercialRepository(iludirPrimeiraLeitura(prisma), new AuditAppender());

      await expect(
        repositorioIludido.winOpportunity(id, { newClient: { name: `${marca} cliente órfão`, email } }, principal),
      ).rejects.toBeInstanceOf(EstadoInvalido);

      expect(await clientesDaMarca(email)).toHaveLength(0);
      const linha = await prisma.opportunity.findUnique({ where: { id } });
      expect(linha?.status).toBe("perdida");
      expect(linha?.clientId).toBeNull();
      expect(
        await prisma.eventLog.count({
          where: { eventName: { in: ["commercial.opportunity.won", "clientes.client.created"] }, entityId: id },
        }),
      ).toBe(0);
    },
    PRAZO_MS,
  );

  it(
    "duas decisões simultâneas: uma vence e só o cliente dela existe",
    async () => {
      const id = await novaOportunidade();
      const emailA = `${marca}-a@teste.local`;
      const emailB = `${marca}-b@teste.local`;

      const resultados = await Promise.allSettled([
        repositorio.winOpportunity(id, { newClient: { name: `${marca} A`, email: emailA } }, principal),
        repositorio.winOpportunity(id, { newClient: { name: `${marca} B`, email: emailB } }, principal),
      ]);

      expect(resultados.filter((r) => r.status === "fulfilled"), JSON.stringify(resultados.map((r) => (r.status === "rejected" ? String(r.reason) : "ok")))).toHaveLength(1);
      const total = (await clientesDaMarca(emailA)).length + (await clientesDaMarca(emailB)).length;
      expect(total).toBe(1);
      const linha = await prisma.opportunity.findUnique({ where: { id } });
      expect(linha?.status).toBe("ganha");
      expect(linha?.clientId).not.toBeNull();
    },
    PRAZO_MS,
  );
});
