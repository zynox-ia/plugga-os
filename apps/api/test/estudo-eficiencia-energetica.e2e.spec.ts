import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PREMISSAS_2026_08, type InvoiceData } from "@plugga/shared";
import { describe, expect, it } from "vitest";

import { auditarFatura } from "../src/energy-efficiency/calculo/auditoria.js";
import { analisarDemanda } from "../src/energy-efficiency/calculo/demanda.js";
import { rodarMotorPrd } from "../src/energy-efficiency/calculo/motor-prd.js";
import { gerarPdf } from "../src/energy-efficiency/documento/pdf.js";
import { gerarRelatorio } from "../src/energy-efficiency/documento/relatorio.js";

/**
 * Ponta a ponta do estudo de eficiência energética: fatura → cálculo →
 * documento → validação bloqueante → PDF.
 *
 * Abre um navegador de verdade, então roda só quando pedido:
 *
 *     RUN_PDF_INTEGRATION_TESTS=true pnpm --filter @plugga/api test
 *
 * O caso é a A M Química, com os valores do cenário cativo estimado pela
 * auditoria Plugga em 06/2026.
 */
const HABILITADO = process.env.RUN_PDF_INTEGRATION_TESTS === "true";

const FATURA: InvoiceData = {
  consumoPontaKwh: 4_275,
  consumoForaPontaKwh: 126_050,
  tarifaPonta: 1.82396,
  tarifaForaPonta: 0.53899,
  valorPonta: 7_797.43,
  valorForaPonta: 67_939.69,
  valorDemanda: 15_827.0,
  valorTotal: 100_881.25,
  demandaContratadaKw: 700,
  demandaMedidaPontaKw: 249,
  demandaMedidaForaPontaKw: 586,
  tarifaDemanda: 22.61,
  valorReativo: 571.22,
  valorBeneficioFiscal: 0,
  valorMultasJurosEncargos: 0,
};

function gerar() {
  const premissas = PREMISSAS_2026_08;
  const auditoria = auditarFatura(FATURA);
  const { dimensionamento, economia, financeiro } = rodarMotorPrd(FATURA, premissas);
  const demanda = analisarDemanda({
    demandaContratadaKw: 700,
    historicoKw: [634, 704, 705, 698, 668, 586],
    tarifaDemanda: 22.61,
    premissas,
  });

  return gerarRelatorio({
    caso: {
      cliente: "A M QUIMICA INDUSTRIA E COMERCIO DE PRODUTOS QUIMICOS LTDA",
      unidadeConsumidora: "0000033531002-19",
      distribuidora: "Amazonas Energia",
      localidade: "Manaus/AM",
      grupoModalidade: "Grupo A · A4 · Horossazonal Verde",
      referencia: "06/2026",
    },
    fatura: FATURA,
    premissas,
    auditoria,
    demanda,
    dimensionamento,
    economia,
    financeiro,
  });
}

describe.skipIf(!HABILITADO)("estudo de eficiência energética — ponta a ponta", () => {
  it("gera HTML válido e converte em PDF", async () => {
    const { html, problemas } = gerar();

    // A validação bloqueante vem antes do PDF: documento reprovado não vira
    // arquivo, que é o comportamento da trava original.
    expect(problemas).toEqual([]);

    const pdf = await gerarPdf(html);

    // %PDF-1. no início é a assinatura do formato.
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    // Um documento com dez seções, três gráficos grandes e as tabelas ano a ano
    // não cabe em poucos kilobytes; tamanho ínfimo indicaria render vazio.
    expect(pdf.byteLength).toBeGreaterThan(100_000);

    const pasta = mkdtempSync(join(tmpdir(), "plugga-estudo-"));
    const destino = join(pasta, "estudo-am-quimica-06-2026.pdf");
    writeFileSync(destino, pdf);
    writeFileSync(destino.replace(/\.pdf$/, ".html"), html);
    console.log(`[estudo] artefatos em ${pasta}`);
  }, 120_000);
});
