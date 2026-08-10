import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { faturaNormativaSchema, type FaturaNormativa } from "@plugga/shared";
import { describe, expect, it } from "vitest";

import { gerarPdf } from "../src/energy-efficiency/documento/pdf.js";
import { montarCasoDoRelatorio } from "../src/energy-efficiency/nucleo/caso-do-relatorio.js";
import { rodarEstudo } from "../src/energy-efficiency/nucleo/pipeline.js";
import { gerarVersaoCelular } from "../src/energy-efficiency/nucleo/relatorio-celular.js";
import { gerarRelatorio } from "../src/energy-efficiency/nucleo/relatorio-literal.js";

/**
 * Ponta a ponta do estudo: fatura conciliada → pipeline → substituições →
 * documento → PDF.
 *
 * Abre um navegador de verdade, então roda só quando pedido:
 *
 *     RUN_PDF_INTEGRATION_TESTS=true pnpm --filter @plugga/api test
 *
 * O caso é o Santa Tereza do corpus normativo, o mesmo que fecha os MD5
 * aprovados — assim o PDF sai de um documento que já se sabe correto.
 */
const HABILITADO = process.env.RUN_PDF_INTEGRATION_TESTS === "true";

const CASOS = join(
  __dirname,
  "../../../packages/auditoria-oraculo/referencia",
  "skill-estudo-eficiencia-energetica/casos",
);

type Json = Record<string, unknown>;

function camelizar(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(camelizar);
  if (valor !== null && typeof valor === "object") {
    return Object.fromEntries(
      Object.entries(valor as Json).map(([chave, filho]) => [
        chave.replace(/_([a-z])/g, (_, letra: string) => letra.toUpperCase()),
        camelizar(filho),
      ]),
    );
  }
  return valor;
}

function faturaDoCorpus(): FaturaNormativa {
  const bruto = camelizar(
    JSON.parse(
      readFileSync(join(CASOS, "fatura-santa-tereza-2026-06_conciliada.json"), "utf8"),
    ),
  ) as Json;
  const aceitos = Object.keys(faturaNormativaSchema.shape);

  return faturaNormativaSchema.parse(
    Object.fromEntries(Object.entries(bruto).filter(([chave]) => aceitos.includes(chave))),
  );
}

function gerar(): { html: string; celular: string } {
  const fatura = faturaDoCorpus();
  const caso = JSON.parse(
    readFileSync(join(CASOS, "caso-motor-santa-tereza.json"), "utf8"),
  ) as Json;

  const estudo = rodarEstudo({
    funcao: "solar_bess",
    consumoPontaDesejadoKwhMes: caso.consumo_ponta_desejado_kwh_mes as number,
    nBess: caso.n_bess as number,
    capexBessTotal: caso.capex_bess_total as number,
    tusdP: caso.tusd_p as number,
    teP: caso.te_p as number,
    tusdFp: caso.tusd_fp as number,
    teFp: caso.te_fp as number,
    hspMensal: caso.hsp_mensal as number[],
    solarKwp: 0,
    capexSolarTotal: 0,
  });

  const html = gerarRelatorio(
    montarCasoDoRelatorio({
      fatura,
      tarifas: {
        tusdP: caso.tusd_p as number,
        teP: caso.te_p as number,
        tusdFp: caso.tusd_fp as number,
        teFp: caso.te_fp as number,
      },
      consumoPontaDoCaso: caso.consumo_ponta_desejado_kwh_mes as number,
      fluxoBess: estudo.fluxoBess,
      fluxoSolar: estudo.fluxoSolar,
      solarKwp: estudo.solarKwp,
      capexSolarTotal: estudo.capexSolarTotal,
    }),
  );

  return { html, celular: gerarVersaoCelular(html) };
}

describe.skipIf(!HABILITADO)("estudo de eficiência energética — ponta a ponta", () => {
  it("gera HTML válido e converte em PDF", async () => {
    const { html, celular } = gerar();

    expect(html).toContain("<h1");
    expect(celular).toContain("camada-celular-v2");

    const pdf = await gerarPdf(html);

    // %PDF- no início é a assinatura do formato.
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    // Um documento com dez seções, cinco gráficos e as tabelas ano a ano não
    // cabe em poucos kilobytes; tamanho ínfimo indicaria render vazio.
    expect(pdf.byteLength).toBeGreaterThan(100_000);

    const pasta = mkdtempSync(join(tmpdir(), "plugga-estudo-"));
    const destino = join(pasta, "estudo-santa-tereza-06-2026.pdf");
    writeFileSync(destino, pdf);
    writeFileSync(destino.replace(/\.pdf$/, ".html"), html);
    writeFileSync(destino.replace(/\.pdf$/, "_celular.html"), celular);
    console.log(`[estudo] artefatos em ${pasta}`);
  }, 120_000);
});
