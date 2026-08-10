import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { faturaNormativaSchema, type FaturaNormativa } from "@plugga/shared";
import { describe, expect, it } from "vitest";

import { montarCasoDoRelatorio, ForaDoEnvelopeError } from "./caso-do-relatorio.js";
import { rodarEstudo } from "./pipeline.js";
import { gerarVersaoCelular } from "./relatorio-celular.js";
import { gerarRelatorio } from "./relatorio-literal.js";

/**
 * A prova de que a cadeia inteira reproduz o estudo aprovado.
 *
 * Partindo da fatura conciliada e do caso do motor, o pipeline calcula os dois
 * fluxos, o construtor deriva as substituições e o gerador produz o HTML. O
 * alvo é duplo: as substituições têm que ser iguais às que o oráculo gravou, e
 * o documento tem que fechar o MD5 aprovado.
 */
const REFERENCIA = join(
  __dirname,
  "../../../../../packages/auditoria-oraculo/referencia",
  "skill-estudo-eficiencia-energetica",
);
const CASOS = join(REFERENCIA, "casos");

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

function carregarFatura(arquivo: string): FaturaNormativa {
  const bruto = camelizar(JSON.parse(readFileSync(join(CASOS, arquivo), "utf8"))) as Json;
  const aceitos = Object.keys(faturaNormativaSchema.shape);
  return faturaNormativaSchema.parse(
    Object.fromEntries(Object.entries(bruto).filter(([chave]) => aceitos.includes(chave))),
  );
}

function carregarCaso(arquivo: string): Json {
  return JSON.parse(readFileSync(join(CASOS, arquivo), "utf8")) as Json;
}

function montarSantaTereza() {
  const fatura = carregarFatura("fatura-santa-tereza-2026-06_conciliada.json");
  const caso = carregarCaso("caso-motor-santa-tereza.json");

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

  return montarCasoDoRelatorio({
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
  });
}

const DO_ORACULO = JSON.parse(
  readFileSync(join(CASOS, "caso-relatorio-santa-tereza-2026-06.json"), "utf8"),
) as {
  substituicoes: Record<string, string>;
  manter_marcadores: string[];
  insercoes: { html: string; antes_de?: string }[];
};

const GOLDEN = JSON.parse(readFileSync(join(CASOS, "golden-hashes.json"), "utf8")) as {
  desktop: string;
  celular: string;
};

describe("construtor do caso — Santa Tereza", () => {
  it("deriva exatamente as substituições que o oráculo gravou", () => {
    const caso = montarSantaTereza();

    expect(Object.keys(caso.substituicoes).sort()).toEqual(
      Object.keys(DO_ORACULO.substituicoes).sort(),
    );
    expect(caso.substituicoes).toEqual(DO_ORACULO.substituicoes);
  });

  it("declara as mesmas exceções de marcador e as mesmas inserções", () => {
    const caso = montarSantaTereza();

    expect(caso.manterMarcadores).toEqual(DO_ORACULO.manter_marcadores);
    expect(caso.insercoes?.map((i) => i.html)).toEqual(
      DO_ORACULO.insercoes.map((i) => i.html),
    );
  });

  it("da fatura ao documento: desktop e celular fecham os MD5 aprovados", () => {
    const desktop = gerarRelatorio(montarSantaTereza());
    const celular = gerarVersaoCelular(desktop);

    expect(createHash("md5").update(desktop, "utf8").digest("hex")).toBe(GOLDEN.desktop);
    expect(createHash("md5").update(celular, "utf8").digest("hex")).toBe(GOLDEN.celular);
  });
});

describe("construtor do caso — o envelope", () => {
  it("recusa item relevante que o modelo não sabe mostrar", () => {
    const fatura = carregarFatura("fatura-santa-tereza-2026-06_conciliada.json");
    const caso = carregarCaso("caso-motor-santa-tereza.json");
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

    expect(() =>
      montarCasoDoRelatorio({
        fatura: {
          ...fatura,
          itens: [
            ...fatura.itens,
            { nome: "Taxa nova sem linha no modelo", valor: fatura.total * 0.2 },
          ],
        },
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
    ).toThrow(ForaDoEnvelopeError);
  });
});
