import assert from "node:assert/strict";
import { it } from "node:test";

import type { Deal, Pipeline } from "@plugga/shared";
import { calcularPrevisao, calcularProjecaoSelecionada, idsSelecionadosDaPipeline, periodoDoTrimestre, projetarNegociosSelecionados } from "../app/lib/previsao.ts";

const pipeline = { stages: [
  { id: "inicio", position: 0 },
  { id: "proposta", position: 1 },
  { id: "final", position: 2 },
] } as unknown as Pipeline;

function deal(id: string, parcial: Partial<Deal>): Deal {
  return {
    id, number: Number(id), pipelineId: "p", companyId: "waze", stageId: "inicio", status: "open", priority: null,
    title: `Negócio ${id}`, value: "100.00", expectedCloseDate: "2026-11-20", lead: { name: "Conta", personType: "pj" } as Deal["lead"],
    client: null, contact: null, owner: { id: "ana", name: "Ana" }, tags: [], stageEnteredAt: "2026-10-01T00:00:00Z",
    closedAt: null, lossReason: null, revisitOn: null, createdAt: "2026-10-01T00:00:00Z", ...parcial,
  } as Deal;
}

it("encontra o trimestre calendário e fecha os limites inclusivos", () => {
  assert.deepEqual(periodoDoTrimestre("2026-11-19"), { inicio: "2026-10-01", fim: "2026-12-31" });
  assert.deepEqual(periodoDoTrimestre("2027-01-01"), { inicio: "2027-01-01", fim: "2027-03-31" });
});

it("classifica ganhos pelas datas locais de Manaus nas duas bordas do trimestre", () => {
  const resultado = calcularPrevisao([
    deal("6", { status: "won", value: "125.00", expectedCloseDate: null, closedAt: "2026-12-31T18:00:00.000Z" }),
    deal("7", { status: "won", value: "900.00", expectedCloseDate: null, closedAt: "2026-10-01T01:00:00.000Z" }),
  ], pipeline, "2026-12-31", 1_000);

  assert.equal(resultado.realizado, 125);
  assert.equal(resultado.serie.at(-1)?.data, "2026-12-31");
  assert.equal(resultado.serie.at(-1)?.realizado, 125);
});

it("calcula cenários ponderados, realizado, série semanal e totais por vendedor", () => {
  const deals = [
    deal("1", { stageId: "final", value: "400.00" }),
    deal("2", { stageId: "proposta", value: "300.00" }),
    deal("3", { status: "won", stageId: "final", value: "200.00", expectedCloseDate: null, closedAt: "2026-11-05T12:00:00Z" }),
    deal("4", { status: "lost", value: "999.00", expectedCloseDate: null, closedAt: "2026-11-05T12:00:00Z" }),
    deal("5", { status: "open", expectedCloseDate: "2027-01-01" }),
  ];
  const resultado = calcularPrevisao(deals, pipeline, "2026-11-19", 1_000);
  assert.equal(resultado.realizado, 200);
  assert.equal(resultado.negociosAbertos.length, 2);
  assert.equal(resultado.cenarios.comprometido.valor, 600);
  assert.equal(resultado.cenarios.provavel.valor, 650);
  assert.equal(resultado.cenarios.melhor.valor, 900);
  assert.ok(resultado.serie.some((ponto) => ponto.data === "2026-11-19"));
  assert.equal(resultado.serie.at(-1)?.ritmoMeta, 1_000);
  assert.deepEqual(resultado.vendedores[0], { id: "ana", nome: "Ana", meta: 1_000, ganho: 200, comprometido: 400, provavel: 450, lacuna: 350 });
});

it("recalcula a projeção e o percentual da meta com a seleção", () => {
  const deals = [deal("1", { value: "250.00" }), deal("2", { value: "750.00" })];
  assert.deepEqual(projetarNegociosSelecionados(deals, new Set(["2"]), 1_000), { valor: 750, percentualMeta: 75 });
  assert.deepEqual(calcularProjecaoSelecionada(deals, new Set(["2"]), "provavel", pipeline.stages, 1_000), { valor: 187.5, percentualMeta: 18.75 });
});

it("redefine os negócios incluídos ao trocar de pipeline e descarta IDs fora do funil", () => {
  const negocios = [deal("1", {}), deal("2", {})];
  assert.deepEqual(idsSelecionadosDaPipeline("p2", { pipelineId: "p1", ids: new Set(["1"]) }, negocios), new Set(["1", "2"]));
  assert.deepEqual(idsSelecionadosDaPipeline("p1", { pipelineId: "p1", ids: new Set(["1", "fora-do-funil"]) }, negocios), new Set(["1"]));
});
