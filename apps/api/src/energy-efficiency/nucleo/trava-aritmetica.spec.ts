import { readFileSync } from "node:fs";
import { join } from "node:path";

import { faturaNormativaSchema, type FaturaNormativa } from "@plugga/shared";
import { describe, expect, it } from "vitest";

import { montarCasoDoRelatorio } from "./caso-do-relatorio.js";
import { fmt } from "./formato.js";
import { rodarEstudo, type ResultadoDoEstudo } from "./pipeline.js";
import { gerarVersaoCelular } from "./relatorio-celular.js";
import { gerarRelatorio } from "./relatorio-literal.js";
import { verificarRelatorio } from "./trava-aritmetica.js";

/**
 * Trava 2 sobre o documento que a cadeia inteira produz.
 *
 * O ponto do teste não é só o caminho feliz: é que mexer num centavo do HTML
 * já gerado, remover uma linha da tabela de 20 anos ou trocar um KPI reprove.
 * Se a mutação passasse, a trava não estaria verificando nada.
 */
const CASOS = join(
  __dirname,
  "../../../../../packages/auditoria-oraculo/referencia",
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

function santaTereza(): { fatura: FaturaNormativa; estudo: ResultadoDoEstudo; html: string } {
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

  return { fatura, estudo, html };
}

function verificar(html: string, fatura?: FaturaNormativa) {
  const base = santaTereza();
  return verificarRelatorio({
    html,
    fatura: fatura ?? base.fatura,
    fluxo: base.estudo.fluxoSolar,
    conciliada: true,
  });
}

describe("Trava 2 — o documento contra a fatura e o motor", () => {
  it("aprova o relatório que a cadeia produziu", () => {
    const { html, fatura, estudo } = santaTereza();

    const resultado = verificarRelatorio({
      html,
      fatura,
      fluxo: estudo.fluxoSolar,
      conciliada: true,
    });

    expect(resultado.problemas).toEqual([]);
    expect(resultado.aprovado).toBe(true);
    // Sete conferências de fatura, os pesos dos itens, 40 linhas de 20 anos e
    // os cartões: não é uma checagem simbólica.
    expect(resultado.verificacoes).toBeGreaterThan(50);
  });

  it("aprova também a versão celular, que só acrescenta camada", () => {
    const { html, fatura, estudo } = santaTereza();

    const resultado = verificarRelatorio({
      html: gerarVersaoCelular(html),
      fatura,
      fluxo: estudo.fluxoSolar,
      conciliada: true,
    });

    expect(resultado.aprovado).toBe(true);
  });

  /**
   * A trava confere presença, como o oráculo: ela pergunta se o número do
   * motor está no documento. Por isso a mutação troca todas as ocorrências —
   * mudar uma só deixaria o valor ainda presente em outro lugar, e a checagem
   * continuaria verdadeira. É o comportamento do script original.
   */
  it("um centavo trocado no total reprova", () => {
    const { html, fatura } = santaTereza();

    const adulterado = html.split("174.636,70").join("174.636,71");

    expect(verificar(adulterado, fatura).problemas.join(" ")).toContain("valor total");
  });

  it("uma linha da tabela de 20 anos que some reprova", () => {
    const { html, estudo } = santaTereza();
    const formatado = fmt(estudo.fluxoSolar.fluxo_anual[10]!);

    const adulterado = html.split(formatado).join("0,00");

    expect(verificar(adulterado).aprovado).toBe(false);
  });

  it("KPI trocado reprova, mesmo com o resto intacto", () => {
    const { html, estudo } = santaTereza();
    const tir = `${fmt((estudo.fluxoSolar.indicadores.tir_aa ?? 0) * 100)}%`;

    const adulterado = html.split(tir).join("99,99%");

    expect(verificar(adulterado).problemas.join(" ")).toContain("TIR");
  });

  it("CSS alterado reprova", () => {
    const { html } = santaTereza();

    const adulterado = html.replace("<style", "<style data-x='1'").replace(
      /(<style[^>]*>)/,
      "$1/* invadido */",
    );

    expect(verificar(adulterado).problemas.join(" ")).toContain("CSS");
  });

  it("fatura que não passou pela Trava 1 reprova antes de tudo", () => {
    const { html, fatura, estudo } = santaTereza();

    const resultado = verificarRelatorio({
      html,
      fatura,
      fluxo: estudo.fluxoSolar,
      conciliada: false,
    });

    expect(resultado.aprovado).toBe(false);
    expect(resultado.problemas[0]).toContain("trava 1");
  });

  it("resíduo do caso-fonte reprova mesmo com as contas certas", () => {
    const { html } = santaTereza();

    const adulterado = html.replace("</body>", "<p>AGROINDUSTRIAL</p></body>");

    expect(verificar(adulterado).problemas.join(" ")).toContain("caso-fonte");
  });
});
