import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditAppender } from "../src/audit/audit-appender";
import { PrismaComprasRepository } from "../src/compras/prisma-compras.repository";
import { PrismaService } from "../src/prisma/prisma.service";

/**
 * FR-033: os indicadores de Compras consideram o período inteiro, sem o corte
 * silencioso de 5.000 pedidos que existia (`take` sem filtro de período no SQL).
 *
 * Atrás de `RUN_COMPRAS_INDICADORES_INTEGRATION_TESTS`, como os demais testes
 * de banco: a suíte padrão continua hermética.
 */

const habilitado = process.env.RUN_COMPRAS_INDICADORES_INTEGRATION_TESTS === "true";
const describeBanco = habilitado ? describe : describe.skip;

const NO_PERIODO = 5_100;

class RepositorioComTravaBaixa extends PrismaComprasRepository {
  protected override limitePedidosIndicador = 1_000;
}

describeBanco("Indicadores de Compras além de 5.000 pedidos", () => {
  const prisma = new PrismaService();
  const repositorio = new PrismaComprasRepository(prisma, new AuditAppender());
  const marca = `it-ind-${randomUUID().slice(0, 8)}`;
  // Período no passado distante: nenhum outro teste do banco cria pedido aqui.
  const periodo = { companyId: "plugga" as const, de: "2001-03-01", ate: "2001-03-31" };

  beforeAll(async () => {
    await prisma.$connect();
    const pessoa = await prisma.user.create({
      data: { email: `${marca}@teste.local`, name: `${marca} pessoa`, status: "active" },
    });
    const maior = await prisma.pedidoDeCompra.aggregate({
      where: { companyId: "plugga" },
      _max: { numero: true },
    });
    const base = (maior._max.numero ?? 0) + 1;

    const dentro = Array.from({ length: NO_PERIODO }, (_, i) => ({
      companyId: "plugga",
      numero: base + i,
      titulo: `${marca} dentro ${i}`,
      destino: "interno" as const,
      solicitanteId: pessoa.id,
      prazoEntregaDesejado: new Date("2001-04-10T12:00:00Z"),
      etapa: "concluido" as const,
      origemAtendimento: "aquisicao" as const,
      valorOrcado: "100.00",
      valorFaturado: "90.00",
      createdAt: new Date("2001-03-15T12:00:00Z"),
      concluidoEm: new Date("2001-03-20T12:00:00Z"),
    }));
    // Fora do período: um nasceu depois do fim; outro concluiu antes do início.
    const fora = [
      { createdAt: new Date("2001-05-02T12:00:00Z"), concluidoEm: null as Date | null },
      { createdAt: new Date("2000-12-01T12:00:00Z"), concluidoEm: new Date("2001-01-10T12:00:00Z") },
    ].map((datas, i) => ({
      companyId: "plugga",
      numero: base + NO_PERIODO + i,
      titulo: `${marca} fora ${i}`,
      destino: "interno" as const,
      solicitanteId: pessoa.id,
      prazoEntregaDesejado: new Date("2001-06-10T12:00:00Z"),
      etapa: "concluido" as const,
      origemAtendimento: "aquisicao" as const,
      valorOrcado: "100.00",
      valorFaturado: "90.00",
      ...datas,
    }));
    await prisma.pedidoDeCompra.createMany({ data: [...dentro, ...fora] });
  }, 120_000);

  afterAll(async () => {
    await prisma.pedidoDeCompra.deleteMany({ where: { titulo: { startsWith: marca } } });
    await prisma.user.deleteMany({ where: { name: { startsWith: marca } } });
    await prisma.$disconnect();
  }, 120_000);

  it("scorecard conta todos os pedidos do período, sem aviso", async () => {
    const scorecard = await repositorio.scorecard(periodo);

    expect(scorecard.assertividadeGlobal.pedidosConsiderados).toBe(NO_PERIODO);
    expect(scorecard.assertividadeGlobal.totalOrcado).toBe("510000.00");
    expect(scorecard.assertividadeGlobal.totalFaturado).toBe("459000.00");
    expect(scorecard.backlogCritico.total.emitidas).toBe(NO_PERIODO);
    expect(scorecard.backlogCritico.total.concluidas).toBe(NO_PERIODO);
    expect(scorecard.aviso).toBeNull();
  }, 60_000);

  it("devolve aviso explícito quando a trava de memória corta o período", async () => {
    const parcial = new RepositorioComTravaBaixa(prisma, new AuditAppender());

    const scorecard = await parcial.scorecard(periodo);
    const diagnostico = await parcial.diagnostico(periodo);

    expect(scorecard.assertividadeGlobal.pedidosConsiderados).toBeLessThan(NO_PERIODO);
    expect(scorecard.aviso).toMatch(/parcial/i);
    expect(diagnostico.aviso).toMatch(/parcial/i);
  }, 60_000);

  it("diagnóstico lê o mesmo período completo, sem aviso", async () => {
    const diagnostico = await repositorio.diagnostico(periodo);

    expect(diagnostico.indicadorCruzado.pedidosConsiderados).toBe(NO_PERIODO);
    expect(diagnostico.aviso).toBeNull();
  }, 60_000);
});
