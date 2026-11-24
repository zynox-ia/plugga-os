import assert from "node:assert/strict";
import { it } from "node:test";
import {
  createLeadSolarProjectRequestSchema,
  pendenciasDaQualificacao,
  leadSolarProjectSchema,
  listLeadSolarProjectsResponseSchema,
  updateLeadSolarProjectRequestSchema,
} from "../dist/solar.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const agora = "2026-11-12T21:00:00.000Z";

const rascunho = {
  installationType: "rural" as const,
  averageConsumptionKwh: "1.840,5",
  consumerUnit: "  004578912  ",
  energyBillDocumentIds: [id(1)],
  roofType: "metalico" as const,
  availableAreaM2: "190",
  estimatedPowerKwp: "15,2",
  estimatedInvestment: "117500,00",
};

it("cria projeto Solar do lead normalizando decimais e UC", () => {
  const parsed = createLeadSolarProjectRequestSchema.parse(rascunho);
  assert.equal(parsed.averageConsumptionKwh, "1840.5");
  assert.equal(parsed.consumerUnit, "004578912");
  assert.equal(parsed.estimatedPowerKwp, "15.2");
  assert.equal(parsed.estimatedInvestment, "117500.00");
  assert.deepEqual(parsed.energyBillDocumentIds, [id(1)]);
});

it("aceita criar sem contas de energia e rejeita campos inválidos", () => {
  assert.equal(createLeadSolarProjectRequestSchema.parse({ ...rascunho, energyBillDocumentIds: undefined }).energyBillDocumentIds.length, 0);
  for (const invalid of [
    { ...rascunho, installationType: "industrial" },
    { ...rascunho, roofType: "madeira" },
    { ...rascunho, consumerUnit: " " },
    { ...rascunho, averageConsumptionKwh: "-10" },
    { ...rascunho, estimatedInvestment: "abc" },
  ]) {
    assert.equal(createLeadSolarProjectRequestSchema.safeParse(invalid).success, false);
  }
});

it("lista e serializa o projeto completo com identificadores", () => {
  const project = leadSolarProjectSchema.parse({
    id: id(2),
    ...createLeadSolarProjectRequestSchema.parse(rascunho),
    createdAt: agora,
    updatedAt: agora,
  });
  assert.equal(project.id, id(2));
  assert.deepEqual(listLeadSolarProjectsResponseSchema.parse({ projects: [project] }).projects, [project]);
});

it("atualiza projeto com o mesmo contrato da criação", () => {
  const atualizado = updateLeadSolarProjectRequestSchema.parse({
    ...rascunho,
    installationType: "commercial",
    consumerUnit: "UC-99",
    estimatedInvestment: "130000",
  });
  assert.equal(atualizado.installationType, "commercial");
  assert.equal(atualizado.consumerUnit, "UC-99");
  assert.equal(atualizado.estimatedInvestment, "130000");
});

it("só tipo, consumo e UC são obrigatórios; telhado, área, potência e investimento ficam para depois", () => {
  const minimo = createLeadSolarProjectRequestSchema.parse({ installationType: "commercial", averageConsumptionKwh: "900", consumerUnit: "UC-7" });
  assert.equal(minimo.roofType, null);
  assert.equal(minimo.availableAreaM2, null);
  assert.equal(minimo.estimatedPowerKwp, null);
  assert.equal(minimo.estimatedInvestment, null);
  assert.deepEqual(minimo.beneficiaryUcs, []);
  assert.equal(createLeadSolarProjectRequestSchema.parse({ ...rascunho, roofType: "", availableAreaM2: "" }).roofType, null);
  for (const faltando of ["installationType", "averageConsumptionKwh", "consumerUnit"]) {
    const resto = Object.fromEntries(Object.entries(rascunho).filter(([chave]) => chave !== faltando));
    assert.equal(createLeadSolarProjectRequestSchema.safeParse(resto).success, false, faltando);
  }
});

it("UCs beneficiárias são opcionais e não repetem a UC principal", () => {
  const ok = createLeadSolarProjectRequestSchema.parse({ ...rascunho, beneficiaryUcs: [{ id: id(5), code: "UC-BENEF" }] });
  assert.equal(ok.beneficiaryUcs.length, 1);
  assert.equal(createLeadSolarProjectRequestSchema.safeParse({ ...rascunho, beneficiaryUcs: [{ id: id(5), code: "004578912" }] }).success, false);
  assert.equal(createLeadSolarProjectRequestSchema.safeParse({ ...rascunho, beneficiaryUcs: [{ id: id(5), code: "A" }, { id: id(5), code: "B" }] }).success, false);
});

it("projeto gravado antes dos campos opcionais continua legível", () => {
  const antigo = { id: id(2), ...rascunho, averageConsumptionKwh: "1840.5", consumerUnit: "004578912", estimatedPowerKwp: "15.2", estimatedInvestment: "117500.00", createdAt: agora, updatedAt: agora };
  assert.deepEqual(leadSolarProjectSchema.parse(antigo).beneficiaryUcs, []);
});

it("a Qualificação exige os quatro dados num mesmo projeto", () => {
  const base = { installationType: "rural" as const, averageConsumptionKwh: "100", consumerUnit: "UC", energyBillDocumentIds: [id(1)] };
  assert.deepEqual(pendenciasDaQualificacao([base]), []);
  assert.equal(pendenciasDaQualificacao([]).length, 1);
  assert.match(pendenciasDaQualificacao([{ ...base, energyBillDocumentIds: [] }])[0]!, /conta de energia/);
  assert.match(pendenciasDaQualificacao([{ ...base, averageConsumptionKwh: "0" }])[0]!, /consumo/);
});
