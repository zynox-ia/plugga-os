import assert from "node:assert/strict";
import { it } from "node:test";
import { createPipelineRequestSchema, pipelineParaEdicao } from "../dist/pipelines.js";
import { createDealRequestSchema, updateLeadRequestSchema } from "../dist/deals.js";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const profile = { key: "solar_commercial", version: 1, bindings: {
  installationType: { fieldId: id(1), options: { residential: id(6), commercial: id(7), rural: id(8) } },
  averageConsumptionKwh: { fieldId: id(2) }, roofType: { fieldId: id(3) },
  availableAreaM2: { fieldId: id(4) }, estimatedPowerKwp: { fieldId: id(5) },
} };
const config = { companyId: "plugga", name: "Nome livre", description: null, valueLabel: "Valor", color: "#0077FF", wonLabel: "Ganho", lostLabel: "Perdido", stages: [{ name: "Entrada", color: "#0077FF", staleAfterDays: null, asksClientConversion: false }], tags: [], lossReasons: [] };
const project = { principalUc: { code: "  000-12  " }, beneficiaryUcs: [{ id: id(10), code: "UC-02" }], primaryEnergyBillDocumentId: null };

it("perfil Solar tem chave e versão estáveis e é opcional para clientes antigos", () => {
  assert.deepEqual(createPipelineRequestSchema.parse({ ...config, processProfile: profile }).processProfile, profile);
  assert.equal(createPipelineRequestSchema.parse(config).processProfile, undefined);
  for (const invalid of [{ ...profile, version: 2 }, { ...profile, key: "Solar" }, { ...profile, bindings: { ...profile.bindings, roofType: { fieldId: "nome" } } }]) {
    assert.equal(createPipelineRequestSchema.safeParse({ ...config, processProfile: invalid }).success, false);
  }
});

it("roundtrip de configuração preserva a associação sem depender de nomes", () => {
  const pipeline = { ...config, processProfile: profile, id: id(20), members: [], updatedAt: "2026-11-09T00:00:00Z", archivedAt: null, updatedBy: null, stages: [{ ...config.stages[0], id: id(21), position: 0, dealCount: 0 }], canConfigure: true, dealCount: 0 };
  assert.deepEqual(pipelineParaEdicao(pipeline).processProfile, profile);
});

it("ficha prospectiva normaliza código sem perder zeros/pontuação e exige versão", () => {
  const parsed = updateLeadRequestSchema.parse({ version: 3, solarProject: project });
  assert.equal(parsed.solarProject.principalUc.code, "000-12");
  assert.equal(updateLeadRequestSchema.safeParse({ solarProject: project }).success, false);
  assert.equal(updateLeadRequestSchema.safeParse({ version: 3, solarProject: null }).success, false);
  assert.equal(updateLeadRequestSchema.parse({ version: 3 }).solarProject, undefined);
});

it("rascunho permite quatro dados ainda ausentes e criação sem Cliente", () => {
  const solarProject = { principalUc: null, beneficiaryUcs: [], primaryEnergyBillDocumentId: null };
  const created = createDealRequestSchema.parse({ pipelineId: id(20), stageId: id(21), title: "Projeto", ownerId: id(22), lead: { personType: "pj", name: "Lead sintético", phone: "92999990000" }, solarProject });
  assert.deepEqual(created.solarProject, solarProject);
  assert.equal(created.clientId, undefined);
});

it("UCs rejeitam códigos vazios, principal repetida, IDs e códigos duplicados", () => {
  for (const invalid of [
    { ...project, principalUc: { code: " " } },
    { ...project, beneficiaryUcs: [{ id: id(10), code: "000-12" }] },
    { ...project, beneficiaryUcs: [{ id: id(10), code: "UC-02" }, { id: id(10), code: "UC-03" }] },
    { ...project, beneficiaryUcs: [{ id: id(10), code: "uc-02" }, { id: id(11), code: " UC-02 " }] },
    { ...project, primaryEnergyBillDocumentId: "arquivo.pdf" },
    { ...project, principalUc: { code: "x".repeat(81) } },
  ]) assert.equal(updateLeadRequestSchema.safeParse({ version: 3, solarProject: invalid }).success, false);
});
