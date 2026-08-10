import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { buscarDivergencia } from "../divergencias.ts";
import {
  compararSaidas,
  resultadoGeral,
  type DivergenciaAplicavel,
  type ToleranciaDeCampo,
} from "./diff.ts";
import { bloqueiaPromocao, montarRelatorio } from "./relatorio.ts";

const d001 = buscarDivergencia("D-001");
assert.ok(d001, "D-001 precisa existir para este teste fazer sentido");

const divergenciaDoSemaforo: DivergenciaAplicavel = {
  divergencia: d001,
  campos: ["semaforo.faixa"],
};

const toleranciaInterna: ToleranciaDeCampo = {
  campo: "interno.utilizacaoKwh",
  absoluta: 1e-9,
  justificativa: "valor de ponto flutuante antes do arredondamento normativo",
};

describe("comparação campo a campo", () => {
  test("igualdade é o padrão", () => {
    const campos = compararSaidas(
      { indicadores: { tir: 0.2513, capex: 2_625_750 } },
      { indicadores: { tir: 0.2513, capex: 2_625_750 } },
    );

    assert.deepEqual(
      campos.map((c) => c.estado),
      ["exact", "exact"],
    );
    assert.equal(resultadoGeral(campos), "exact");
  });

  test("um centavo a mais reprova quando não há registro", () => {
    const campos = compararSaidas(
      { indicadores: { capex: 2_625_750 } },
      { indicadores: { capex: 2_625_750.01 } },
    );

    assert.equal(campos[0]?.estado, "failed");
    assert.equal(resultadoGeral(campos), "failed");
  });

  test("tolerância vale só para o campo declarado", () => {
    const python = { interno: { utilizacaoKwh: 17_419 }, publicado: { total: 100 } };
    const typescript = {
      interno: { utilizacaoKwh: 17_419.0000000001 },
      publicado: { total: 100.0000000001 },
    };

    const campos = compararSaidas(python, typescript, {
      tolerancias: [toleranciaInterna],
    });

    const interno = campos.find((c) => c.campo === "interno.utilizacaoKwh");
    const publicado = campos.find((c) => c.campo === "publicado.total");
    assert.equal(interno?.estado, "within_tolerance");
    assert.equal(publicado?.estado, "failed");
  });

  test("não existe tolerância global: campo sem entrada é comparado ao exato", () => {
    const campos = compararSaidas(
      { a: 1, b: 1 },
      { a: 1.0000001, b: 1.0000001 },
      { tolerancias: [{ campo: "a", absoluta: 1e-6, justificativa: "interno" }] },
    );

    assert.equal(campos.find((c) => c.campo === "a")?.estado, "within_tolerance");
    assert.equal(campos.find((c) => c.campo === "b")?.estado, "failed");
  });

  test("divergência registrada passa, mas fica visível", () => {
    const campos = compararSaidas(
      { semaforo: { faixa: "amarelo" } },
      { semaforo: { faixa: "vermelho" } },
      { divergencias: [divergenciaDoSemaforo] },
    );

    assert.equal(campos[0]?.estado, "approved_divergence");
    assert.match(campos[0]?.regra ?? "", /^D-001:/);
  });

  test("a mesma diferença em campo não coberto reprova", () => {
    const campos = compararSaidas(
      { semaforo: { motivo: "spread" } },
      { semaforo: { motivo: "payback" } },
      { divergencias: [divergenciaDoSemaforo] },
    );

    assert.equal(campos[0]?.estado, "failed");
  });

  test("campo presente de um lado só reprova, em vez de sumir", () => {
    const campos = compararSaidas(
      { indicadores: { tir: 0.25 } },
      { indicadores: { tir: 0.25, payback: 54 } },
    );

    const payback = campos.find((c) => c.campo === "indicadores.payback");
    assert.equal(payback?.estado, "failed");
    assert.equal(payback?.regra, "campo existe só no TypeScript");
  });

  test("linhas do fluxo anual são comparadas uma a uma", () => {
    const campos = compararSaidas(
      { fluxo: [{ ano: 1, liquido: 10 }, { ano: 2, liquido: 20 }] },
      { fluxo: [{ ano: 1, liquido: 10 }, { ano: 2, liquido: 21 }] },
    );

    assert.equal(campos.length, 4);
    assert.equal(campos.find((c) => c.campo === "fluxo[1].liquido")?.estado, "failed");
  });
});

describe("relatório de paridade", () => {
  const base = {
    caso: "santa-tereza-2026-06",
    versaoNormativa: "2026-08-09",
    versaoDoMotor: "solar-bess-v2",
    versaoDoPython: "3.14.6",
    hashes: { entrada: "a".repeat(64) },
  };

  test("uma divergência não registrada bloqueia a promoção", () => {
    const relatorio = montarRelatorio({
      ...base,
      campos: compararSaidas({ x: 1 }, { x: 2 }),
    });

    assert.equal(relatorio.resultado, "failed");
    assert.equal(relatorio.reprovados.length, 1);
    assert.ok(bloqueiaPromocao(relatorio));
  });

  test("divergência aprovada não bloqueia, mas aparece listada", () => {
    const relatorio = montarRelatorio({
      ...base,
      campos: compararSaidas(
        { semaforo: { faixa: "amarelo" } },
        { semaforo: { faixa: "vermelho" } },
        { divergencias: [divergenciaDoSemaforo] },
      ),
    });

    assert.equal(relatorio.resultado, "approved_divergence");
    assert.equal(relatorio.divergenciasAplicadas.length, 1);
    assert.equal(bloqueiaPromocao(relatorio), false);
  });

  test("o relatório carrega versões e hash da entrada", () => {
    const relatorio = montarRelatorio({ ...base, campos: compararSaidas({}, {}) });

    assert.equal(relatorio.versaoDoPython, "3.14.6");
    assert.equal(relatorio.hashes.entrada.length, 64);
  });
});
