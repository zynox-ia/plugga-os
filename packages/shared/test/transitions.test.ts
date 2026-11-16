import assert from "node:assert/strict";
import { it } from "node:test";
import { moveDealStageRequestSchema, winDealRequestSchema, loseDealRequestSchema, transferDealRequestSchema, convertLeadRequestSchema, bulkDealsRequestSchema } from "../dist/deals.js";
import { catalogoEventos, padraoNomeDeEvento } from "../dist/events.js";

const id = "abcdef00-0000-4000-8000-000000000001";
it("transições individuais aceitam versão e origem pública sem quebrar legado", () => {
  for (const [schema, input] of [
    [moveDealStageRequestSchema, { stageId: id }], [winDealRequestSchema, {}],
    [loseDealRequestSchema, { lossReasonId: id }], [convertLeadRequestSchema, {}],
  ]) {
    assert.equal(schema.safeParse(input).success, true);
    for (const origin of ["quadro", "ficha", "api"]) assert.equal(schema.safeParse({ ...input, version: 3, origin }).success, true);
    for (const origin of ["lote", "transferencia", "processo", "configuracao"]) assert.equal(schema.safeParse({ ...input, origin }).success, false);
    for (const version of [0, -1, 1.5, "3"]) assert.equal(schema.safeParse({ ...input, version }).success, false);
  }
});
it("transferência aceita versão mas origem é fixada no servidor", () => {
  assert.equal(transferDealRequestSchema.safeParse({ pipelineId: id, stageId: id, version: 4 }).success, true);
  assert.equal(transferDealRequestSchema.safeParse({ pipelineId: id, stageId: id, origin: "quadro" }).success, false);
});
it("lote opcionalmente versionado exige mapa completo e sem IDs estranhos", () => {
  const action = { type: "stage", stageId: id };
  const other = "abcdef00-0000-4000-8000-000000000002";
  assert.equal(bulkDealsRequestSchema.safeParse({ dealIds: [id], action }).success, true);
  assert.equal(bulkDealsRequestSchema.safeParse({ dealIds: [id], action, versions: { [id]: 3 } }).success, true);
  assert.deepEqual(bulkDealsRequestSchema.parse({ dealIds: [id], action, versions: { [id.toUpperCase()]: 3 } }).versions, { [id]: 3 });
  for (const versions of [{}, { [other]: 3 }, { [id]: 3, [other]: 4 }, { [id]: 0 }, { [id]: 3, [id.toUpperCase()]: 4 }]) {
    assert.equal(bulkDealsRequestSchema.safeParse({ dealIds: [id], action, versions }).success, false);
  }
});
it("evento de etapa está no catálogo sem alias duplicado e com três segmentos", () => {
  assert.ok(catalogoEventos["commercial.deal.stage_changed"]?.descricao);
  assert.match("commercial.deal.stage_changed", padraoNomeDeEvento);
  assert.equal("negocio.etapa_alterada" in catalogoEventos, false);
});
