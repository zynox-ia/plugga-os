import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaEstudoRepository } from "../src/energy-efficiency/prisma-estudo.repository.js";
import { EstudoService } from "../src/energy-efficiency/estudo.service.js";
import type { PrismaService } from "../src/prisma/prisma.service";
import type { AuthPrincipal } from "../src/core/auth/auth.types";

/**
 * Fluxo completo contra o banco: cria cliente e UC, abre o estudo, envia a
 * fatura, calcula, gera o documento, valida, aprova e marca como enviado.
 *
 * Escreve de verdade, então roda só quando pedido:
 *
 *     RUN_DATABASE_INTEGRATION_TESTS=true pnpm --filter @plugga/api test
 *
 * Limpa o que cria no final. Os registros usam prefixo reconhecível para que
 * uma falha no meio deixe rastro identificável em vez de lixo anônimo.
 */
const HABILITADO = process.env.RUN_DATABASE_INTEGRATION_TESTS === "true";

// Sem a palavra "teste" no nome: ela é termo proibido no documento do cliente,
// e um dado de fixture com esse texto faz a validação bloquear — corretamente.
const PREFIXO = "ZZ-INTEGRACAO estudo-eficiencia";
const ADMIN: AuthPrincipal = { id: "", kind: "user", roles: ["admin"] };

describe.skipIf(!HABILITADO)("estudo de eficiência energética — fluxo no banco", () => {
  const prisma = new PrismaClient();
  const repositorio = new PrismaEstudoRepository(prisma as unknown as PrismaService);
  const service = new EstudoService(repositorio);

  let clientId = "";
  let consumerUnitId = "";
  let estudoId = "";

  beforeAll(async () => {
    const usuario = await prisma.user.findFirst({ select: { id: true } });
    ADMIN.id = usuario?.id ?? "00000000-0000-4000-8000-000000000000";

    const cliente = await prisma.client.create({
      data: { name: `${PREFIXO} cliente`, segment: "prospect" },
      select: { id: true },
    });
    clientId = cliente.id;

    const uc = await prisma.consumerUnit.create({
      data: { clientId, code: `${PREFIXO}-uc`, distributor: "Amazonas Energia" },
      select: { id: true },
    });
    consumerUnitId = uc.id;
  });

  afterAll(async () => {
    if (estudoId) await prisma.energyEfficiencyStudy.deleteMany({ where: { id: estudoId } });
    if (consumerUnitId) await prisma.consumerUnit.deleteMany({ where: { id: consumerUnitId } });
    if (clientId) await prisma.client.deleteMany({ where: { id: clientId } });
    await prisma.$disconnect();
  });

  it("percorre o fluxo inteiro e deixa o documento pronto", async () => {
    const criado = await service.criar(
      {
        clientId,
        consumerUnitId,
        competenceMonth: 6,
        competenceYear: 2026,
        calculationMode: "preliminar",
      },
      ADMIN,
    );
    estudoId = criado.id;

    expect(criado.status).toBe("aguardando_dados");
    // A versão de premissas é fixada na criação e fica gravada com o estudo.
    expect(criado.premiseVersion).toBe("2026-08-08");

    const calculado = await service.receberFatura(estudoId, {
      invoice: {
        consumoPontaKwh: 4_275,
        consumoForaPontaKwh: 126_050,
        tarifaPonta: 1.82396,
        tarifaForaPonta: 0.53899,
        valorPonta: 7_797.43,
        valorForaPonta: 67_939.69,
        valorDemanda: 15_827,
        valorTotal: 100_881.25,
        demandaContratadaKw: 700,
        demandaMedidaPontaKw: 249,
        demandaMedidaForaPontaKw: 586,
        tarifaDemanda: 22.61,
        valorReativo: 571.22,
        valorBeneficioFiscal: 0,
        valorMultasJurosEncargos: 0,
      },
      demandHistory: [634, 704, 705, 698, 668, 586],
      hasLoadProfile: false,
    });

    expect(calculado.status).toBe("em_validacao");
    expect(calculado.validationIssues).toBeNull();
    expect(calculado.hasDocument).toBe(true);
    expect(calculado.financial?.capexTotal).toBe(3_155_000);
    // Seis faturas não bastam para sair de preliminar.
    expect(calculado.demand?.preliminar).toBe(true);

    const html = await service.documento(estudoId);
    expect(html).toContain("Relatório de Auditoria Energética");
    expect(html).toContain(`${PREFIXO} cliente`);

    const aprovado = await service.aprovar(estudoId, { note: "conferido" }, ADMIN);
    expect(aprovado.status).toBe("aprovado_internamente");

    const enviado = await service.marcarEnviado(estudoId);
    expect(enviado.status).toBe("enviado_cliente");
    expect(enviado.sentAt).not.toBeNull();
  }, 60_000);

  it("aparece na listagem filtrada por estado", async () => {
    const { items } = await service.listar({ status: "enviado_cliente" });
    expect(items.some((item) => item.id === estudoId)).toBe(true);

    const encontrado = items.find((item) => item.id === estudoId);
    expect(encontrado?.economiaMensal).toBeGreaterThan(0);
    expect(encontrado?.capexTotal).toBe(3_155_000);
  });
});
