import assert from "node:assert/strict";
import { it } from "node:test";
import { createPipelineRequestSchema, pipelineParaEdicao, updatePipelineRequestSchema } from "../dist/pipelines.js";
import { updateLeadRequestSchema } from "../dist/deals.js";
const id = "00000000-0000-4000-8000-000000000001";
const config = { companyId: "plugga", name: "Teste", description: null, valueLabel: "Valor", color: "#0077FF", wonLabel: "Ganho", lostLabel: "Perdido", stages: [{ name: "Entrada", color: "#0077FF", staleAfterDays: null, asksClientConversion: false }], tags: [], lossReasons: [] };
it("campos personalizados preservam omissão legada e validam definições e IDs", () => {
  assert.equal(createPipelineRequestSchema.parse(config).fields, undefined);
  const fields = [{ name: "Ativo", type: "boolean", showOnCard: true, showInList: false }];
  assert.deepEqual(createPipelineRequestSchema.parse({ ...config, fields }).fields, fields);
  assert.equal(createPipelineRequestSchema.safeParse({ ...config, fields: [...fields, ...fields] }).success, false);
  assert.equal(createPipelineRequestSchema.safeParse({ ...config, fields: [{ ...fields[0], type: "select", options: [] }] }).success, false);
  assert.equal(createPipelineRequestSchema.safeParse({ ...config, fields: Array.from({ length: 41 }, (_, i) => ({ ...fields[0], name: String(i) })) }).success, false);
});
it("valores false/zero/null sobrevivem contrato e edição exige versão", () => {
  for (const value of [false, "0", null]) {
    assert.equal(updateLeadRequestSchema.safeParse({ customFields: { [id]: value } }).success, false);
    assert.deepEqual(updateLeadRequestSchema.parse({ version: 1, customFields: { [id]: value } }).customFields, { [id]: value });
  }
  assert.equal(updateLeadRequestSchema.safeParse({ version: 1, customFields: { outro: "x" } }).success, false);
  assert.equal(updateLeadRequestSchema.safeParse({ version: 1, customFields: { [id]: 0 } }).success, false);
});
it("roundtrip de pipeline mantém identidade e flags sem dados de resposta", () => {
  const field = { id, name: "Referência", type: "text", options: [], showOnCard: false, showInList: true, position: 0, valueCount: 3 };
  const pipeline = { ...config, id, fields: [field], members: [], updatedAt: "2026-11-09T00:00:00Z", archivedAt: null, updatedBy: null, stages: [{ ...config.stages[0], id, position: 0, dealCount: 0 }], canConfigure: true, dealCount: 0 };
  const edited = updatePipelineRequestSchema.parse(pipelineParaEdicao(pipeline));
  assert.deepEqual(edited.fields, [{ id, name: field.name, type: "text", options: [], showOnCard: false, showInList: true }]);
});
