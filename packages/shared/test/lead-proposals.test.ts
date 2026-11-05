import assert from "node:assert/strict";
import { it } from "node:test";

import { createLeadProposalRequestSchema, generateLeadProposalRequestSchema, leadProposalContentSchema, updateLeadProposalRequestSchema } from "../dist/lead-proposals.js";

const content = {
  title: "Proposta · João", recipient: "João", company: "", email: "", phone: "", city: "",
  owner: "", jobTitle: "", amount: "", validUntil: "2028-02-29", introduction: "", scope: "", payment: "", notes: "",
};

it("aceita rascunho sem investimento nem CPF/CNPJ e permite limpar opcionais", () => {
  assert.equal(leadProposalContentSchema.parse(content).amount, "");
  assert.equal(createLeadProposalRequestSchema.safeParse({ templateId: "bead0000-0000-4000-8000-000000000001", content }).success, true);
});

it("recusa datas civis inexistentes, valores inválidos e campos excessivos", () => {
  for (const validUntil of ["2026-02-29", "2026-04-31", "2026-13-01", ""]) {
    assert.equal(leadProposalContentSchema.safeParse({ ...content, validUntil }).success, false);
  }
  for (const amount of ["-1", "1,50", "1.234", "1e5", "1000000000000.00"]) {
    assert.equal(leadProposalContentSchema.safeParse({ ...content, amount }).success, false);
  }
  assert.equal(leadProposalContentSchema.safeParse({ ...content, email: "inválido" }).success, false);
  assert.equal(leadProposalContentSchema.safeParse({ ...content, scope: "x".repeat(6001) }).success, false);
});

it("exige revisão inteira positiva nas mutações e recusa propriedades desconhecidas", () => {
  assert.equal(generateLeadProposalRequestSchema.safeParse({ revision: 1 }).success, true);
  for (const revision of [0, -1, 1.5, "1", undefined]) {
    assert.equal(generateLeadProposalRequestSchema.safeParse({ revision }).success, false);
  }
  assert.equal(updateLeadProposalRequestSchema.safeParse({ revision: 1, templateId: "bead0000-0000-4000-8000-000000000001", content, dealId: "outro" }).success, false);
});
