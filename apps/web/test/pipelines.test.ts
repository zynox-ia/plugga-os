import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createPipelineRequestSchema, type Pipeline } from "@plugga/shared";

import { hrefDoPipeline, mesmoConteudo, paraCriacao, paraEdicao, rascunhoDe, rascunhoNovo } from "../app/lib/pipelines.ts";

const solar: Pipeline = {
  id: "00000000-0000-4000-8000-0000000000ff",
  companyId: "waze",
  name: "Solar",
  description: null,
  valueLabel: "Investimento estimado",
  color: "#0B7A57",
  wonLabel: "Contrato assinado",
  lostLabel: "Perdido",
  archivedAt: null,
  updatedAt: "2026-10-19T10:00:00.000Z",
  updatedBy: null,
  stages: [{ id: "00000000-0000-4000-8000-000000000001", name: "Qualificação", color: "#00A3FF", position: 0, staleAfterDays: 7 }],
  tags: [],
  lossReasons: [],
  members: [{ userId: "00000000-0000-4000-8000-00000000000a", name: "Ana", role: "vendedor" }],
  canConfigure: true,
};

describe("rascunho de pipeline", () => {
  it("o pipeline novo já passa no contrato de criação, na empresa escolhida, depois de ganhar nome", () => {
    const novo = { ...rascunhoNovo("plugga"), name: "Mercado Livre" };
    const criacao = createPipelineRequestSchema.parse(paraCriacao(novo));
    assert.equal(criacao.companyId, "plugga");
    assert.equal(criacao.stages.length, 4);
    assert.ok(criacao.lossReasons.some((m) => m.asksRevisitDate));
  });

  it("a chave local não vai para a API e não conta como alteração", () => {
    const rascunho = rascunhoDe(solar);
    const corpo = paraEdicao(rascunho, solar.updatedAt);
    assert.equal("chave" in corpo.stages[0]!, false);
    assert.equal(corpo.stages[0]!.id, solar.stages[0]!.id);
    assert.equal(corpo.updatedAt, solar.updatedAt);
    assert.equal(mesmoConteudo(rascunho, rascunhoDe(solar)), true);
    assert.equal(mesmoConteudo(rascunho, { ...rascunho, wonLabel: "Usina contratada" }), false);
  });

  it("o link de um pipeline abre a mesma aba para quem o recebe", () => {
    assert.equal(hrefDoPipeline(solar.id), `/comercial/pipelines?pipeline=${solar.id}`);
    assert.equal(hrefDoPipeline(null), "/comercial/pipelines");
  });
});
