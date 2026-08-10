import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { gerarVersaoCelular, MARCA_DA_CAMADA } from "./relatorio-celular.js";
import {
  gerarRelatorio,
  lerModeloOficial,
  RelatorioInvalidoError,
  type CasoDoRelatorio,
} from "./relatorio-literal.js";

/**
 * Trava 3 — golden do documento.
 *
 * O caso de Santa Tereza guardado no corpus traz as 121 substituições que o
 * oráculo usou. Gerar o relatório a partir delas tem que devolver exatamente os
 * bytes aprovados, medidos pelo MD5 que o pacote congelou.
 */
const REFERENCIA = join(
  __dirname,
  "../../../../../packages/auditoria-oraculo/referencia",
  "skill-estudo-eficiencia-energetica",
);

function md5(texto: string): string {
  return createHash("md5").update(texto, "utf8").digest("hex");
}

function casoDoCorpus(): CasoDoRelatorio {
  const bruto = JSON.parse(
    readFileSync(
      join(REFERENCIA, "casos", "caso-relatorio-santa-tereza-2026-06.json"),
      "utf8",
    ),
  ) as {
    substituicoes: Record<string, string>;
    manter_marcadores?: string[];
    insercoes?: { html: string; antes_de?: string; apos_titulo?: string }[];
  };

  return {
    substituicoes: bruto.substituicoes,
    manterMarcadores: bruto.manter_marcadores,
    insercoes: (bruto.insercoes ?? []).map((insercao) => ({
      html: insercao.html,
      ...(insercao.antes_de === undefined ? {} : { antesDe: insercao.antes_de }),
      ...(insercao.apos_titulo === undefined ? {} : { aposTitulo: insercao.apos_titulo }),
    })),
  };
}

const GOLDEN = JSON.parse(
  readFileSync(join(REFERENCIA, "casos", "golden-hashes.json"), "utf8"),
) as { desktop: string; celular: string };

describe("relatório literal — golden Santa Tereza", () => {
  it("o modelo promovido é byte a byte o do pacote congelado", () => {
    const congelado = readFileSync(
      join(
        REFERENCIA,
        "templates",
        "modelo-aprovado-cliente-serra-verde-2025-06-b.html",
      ),
      "utf8",
    );

    expect(lerModeloOficial()).toBe(congelado);
  });

  it("gera o desktop aprovado, byte a byte", () => {
    expect(md5(gerarRelatorio(casoDoCorpus()))).toBe(GOLDEN.desktop);
  });

  it("gera o celular aprovado, byte a byte", () => {
    const desktop = gerarRelatorio(casoDoCorpus());

    expect(md5(gerarVersaoCelular(desktop))).toBe(GOLDEN.celular);
  });
});

describe("relatório literal — o que ele recusa", () => {
  it("chave que não existe no modelo reprova, e nada é gerado", () => {
    const caso = casoDoCorpus();
    caso.substituicoes["texto que o modelo nunca teve"] = "qualquer coisa";

    expect(() => gerarRelatorio(caso)).toThrow(RelatorioInvalidoError);
  });

  it("resíduo do caso-fonte reprova", () => {
    const caso = casoDoCorpus();
    delete caso.substituicoes["AGROINDUSTRIAL SERRA VERDE LTDA"];

    expect(() => gerarRelatorio(caso)).toThrow(/caso-fonte/);
  });

  /**
   * Santa Tereza é em Boa Vista, atendida pela Roraima Energia — a mesma
   * distribuidora do caso-fonte. Sem a exceção declarada, o gerador recusaria
   * um cliente legítimo por parecer resíduo de template. A válvula é do próprio
   * pacote, e o caso do corpus a usa.
   */
  it("cliente legítimo na distribuidora do caso-fonte passa com exceção declarada", () => {
    const caso = casoDoCorpus();
    expect(caso.manterMarcadores).toEqual(["Roraima", "Boa Vista"]);

    const semExcecao = { ...caso, manterMarcadores: [] };
    expect(() => gerarRelatorio(semExcecao)).toThrow(/Roraima/);
    expect(() => gerarRelatorio(caso)).not.toThrow();
  });

  it("o CSS do modelo não pode ser tocado por substituição", () => {
    const modelo = lerModeloOficial();
    const trechoDoCss = /<style[^>]*>([\s\S]{40,80})/.exec(modelo)![1]!.slice(0, 40);
    const caso = casoDoCorpus();
    caso.substituicoes[trechoDoCss] = "/* invadido */";

    expect(() => gerarRelatorio(caso)).toThrow(/CSS/);
  });

  it("mapa vazio reprova em vez de devolver o modelo do caso-fonte", () => {
    expect(() => gerarRelatorio({ substituicoes: {} })).toThrow(/substitui/);
  });
});

describe("versão celular", () => {
  it("acrescenta a camada sem tocar o CSS do modelo", () => {
    const desktop = gerarRelatorio(casoDoCorpus());
    const celular = gerarVersaoCelular(desktop);

    const cssDo = (html: string): string =>
      /<style[^>]*>([\s\S]*?)<\/style>/.exec(html)![1]!;
    expect(cssDo(celular)).toBe(cssDo(desktop));
    expect(celular).toContain(MARCA_DA_CAMADA);
    expect(celular).toContain('content="light only"');
  });

  it("não aplica duas vezes", () => {
    const celular = gerarVersaoCelular(gerarRelatorio(casoDoCorpus()));

    expect(() => gerarVersaoCelular(celular)).toThrow(/já tem a camada/);
  });

  it("recusa HTML que não veio do gerador oficial", () => {
    expect(() =>
      gerarVersaoCelular("<html><head><style>body{}</style></head></html>"),
    ).toThrow(/modelo congelado/);
  });
});
