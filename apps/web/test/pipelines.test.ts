import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createPipelineRequestSchema, type Pipeline } from "@plugga/shared";

import { conferirCamposAntesDeSalvar, hrefDoPipeline, mesclarPipelineAtual, mesmoConteudo, paraCriacao, paraEdicao, rascunhoDe, rascunhoNovo } from "../app/lib/pipelines.ts";

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
  stages: [{ id: "00000000-0000-4000-8000-000000000001", name: "Qualificação", color: "#00A3FF", position: 0, staleAfterDays: 7, asksClientConversion: false, dealCount: 0 }],
  tags: [],
  lossReasons: [],
  members: [{ userId: "00000000-0000-4000-8000-00000000000a", name: "Ana", role: "vendedor" }],
  dealCount: 0,
  canConfigure: true,
};

describe("rascunho de pipeline", () => {
  it("a edição de nomes preserva a associação Solar por referências estáveis", () => {
    const id = (numero: number) => `00000000-0000-4000-8000-${String(numero).padStart(12, "0")}`;
    const profile = { key: "solar_commercial" as const, version: 1 as const, bindings: {
      installationType: { fieldId: id(20), options: { residential: id(30), commercial: id(31), rural: id(32) } },
      averageConsumptionKwh: { fieldId: id(21) }, roofType: { fieldId: id(22) }, availableAreaM2: { fieldId: id(23) }, estimatedPowerKwp: { fieldId: id(24) },
    } };
    const rascunho = { ...rascunhoDe({ ...solar, processProfile: profile }), name: "Solar renomeado" };
    assert.deepEqual(paraEdicao(rascunho, solar.updatedAt).processProfile, profile);
    assert.equal("processProfile" in paraCriacao(rascunhoNovo("plugga")), false);
  });
  it("atualiza o pipeline lido sem remover outros funis ou alterar sua ordem", () => {
    const outro = { ...solar, id: "outro", name: "Mercado Livre" };
    const atualizado = { ...solar, name: "Solar atual" };
    assert.deepEqual(mesclarPipelineAtual([solar, outro], atualizado), [atualizado, outro]);
    assert.equal(outro.name, "Mercado Livre");
  });
  const campo = { id: "00000000-0000-4000-8000-000000000020", name: "Consumo", type: "number" as const, options: [], position: 0, showOnCard: true, showInList: false, valueCount: 0 };

  it("confirma a exclusão com a contagem atual sem perder alterações e campos novos", () => {
    const original = rascunhoDe({ ...solar, fields: [campo] });
    const novo = { chave: "novo-local", name: "Potência", type: "number" as const, options: [], showOnCard: false, showInList: true };
    const rascunho = { ...original, name: "Solar revisado", fields: [novo] };
    const atual = { ...solar, fields: [{ ...campo, valueCount: 2 }] };
    const conferido = conferirCamposAntesDeSalvar(original, rascunho, atual);
    assert.equal(conferido.conflito, false);
    if (conferido.conflito) return;
    assert.deepEqual(conferido.removidos, atual.fields);
    assert.equal(conferido.rascunho.name, "Solar revisado");
    assert.deepEqual(conferido.rascunho.fields, [novo]);
    assert.equal(conferido.rascunho.updatedAt, original.updatedAt);

    const confirmado = conferirCamposAntesDeSalvar(conferido.original, { ...conferido.rascunho, confirmedFieldRemovals: [campo.id] }, atual);
    assert.equal(confirmado.conflito, false);
    if (!confirmado.conflito) assert.deepEqual(confirmado.removidos, []);
  });

  it("atualiza a contagem de um campo limpo e pede nova confirmação se ela crescer", () => {
    const original = rascunhoDe({ ...solar, fields: [{ ...campo, valueCount: 1 }] });
    const limpo = conferirCamposAntesDeSalvar(original, original, { ...solar, fields: [campo] });
    assert.equal(limpo.conflito, false);
    if (!limpo.conflito) {
      assert.equal(limpo.rascunho.fields[0]!.valueCount, 0);
      assert.equal(mesmoConteudo(limpo.rascunho, original), true);
    }
    const removido = { ...original, fields: [], confirmedFieldRemovals: [campo.id] };
    const cresceu = conferirCamposAntesDeSalvar(original, removido, { ...solar, fields: [{ ...campo, valueCount: 3 }] });
    assert.equal(cresceu.conflito, false);
    if (!cresceu.conflito) {
      assert.equal(cresceu.removidos[0]!.valueCount, 3);
      assert.deepEqual(cresceu.rascunho.confirmedFieldRemovals, []);
    }
  });

  it("considera apenas remoções de definições originais e preserva a versão em conflito", () => {
    const original = rascunhoDe({ ...solar, fields: [campo] });
    const outro = { ...campo, id: "00000000-0000-4000-8000-000000000022", valueCount: 4 };
    const conferido = conferirCamposAntesDeSalvar(original, original, { ...solar, fields: [campo, outro] });
    assert.equal(conferido.conflito, false);
    if (!conferido.conflito) {
      assert.deepEqual(conferido.removidos, []);
      assert.equal(conferido.rascunho.fields.length, 1);
    }
    const rascunho = { ...original, name: "Minha edição" };
    const antes = structuredClone(rascunho);
    assert.equal(conferirCamposAntesDeSalvar(original, rascunho, { ...solar, updatedAt: "2026-10-20T10:00:00.000Z", fields: [campo, outro] }).conflito, true);
    assert.deepEqual(rascunho, antes);
  });

  it("preserva IDs dos campos e opções e envia confirmações apenas na edição", () => {
    const fieldId = "00000000-0000-4000-8000-000000000020";
    const optionId = "00000000-0000-4000-8000-000000000021";
    const configurado = { ...solar, fields: [{ id: fieldId, name: "Telhado", type: "select" as const, options: [{ id: optionId, name: "Laje" }], position: 0, showOnCard: true, showInList: false, valueCount: 2 }] };
    const rascunho = rascunhoDe(configurado);
    const corpo = paraEdicao({ ...rascunho, confirmedFieldRemovals: [fieldId] }, solar.updatedAt);
    assert.deepEqual(corpo.fields, [{ id: fieldId, name: "Telhado", type: "select", options: [{ id: optionId, name: "Laje" }], showOnCard: true, showInList: false }]);
    assert.deepEqual(corpo.confirmedFieldRemovals, [fieldId]);
    assert.equal("confirmedFieldRemovals" in paraCriacao(rascunho), false);
    assert.equal(mesmoConteudo(rascunho, { ...rascunho, fields: [] }), false);
  });
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
