import assert from "node:assert/strict";
import { test } from "node:test";
import { criarRascunhoLead, montarAtualizacaoLead } from "../app/lib/rascunho-lead.ts";

const negocio = {
  title: "Projeto solar", value: "1200.50", expectedCloseDate: null,
  owner: { id: "responsavel", name: "Ana" }, tags: [{ id: "solar", name: "Solar", color: "blue" }],
  lead: { personType: "pj" as const, name: "Empresa", companyName: null, landlinePhone: null, website: null, mainInterest: null, jobTitle: null, legalName: null, document: null, phone: null, email: "a@teste.local", postalCode: null, street: null, addressComplement: null, district: null, city: null, state: null, origin: null, notes: null },
  contact: { id: "contato", name: "Ana", jobTitle: "Diretora", role: "decisor" as const, phone: null, phoneIsWhatsapp: false, email: "ana@teste.local", isPrimary: true, cpf: null, rg: "RG existente", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
};

test("campos próprios preservam zero e falso e enviam apenas alterações e limpezas explícitas", () => {
  const original = criarRascunhoLead({ ...negocio, customFields: { numero: "0", aceite: false, texto: "anterior" } });
  assert.equal(original.customFields.aceite, false);
  assert.equal(original.customFields.numero, "0");
  const corpo = montarAtualizacaoLead(original, { ...original, customFields: { ...original.customFields, texto: null } }, 8);
  assert.deepEqual(corpo.customFields, { texto: null });
  assert.equal(corpo.version, 8);
  assert.equal("customFields" in montarAtualizacaoLead(original, original, 8), false);
});

test("alterações carregam versão e apenas os grupos editados, sem metadados do contato", () => {
  const original = criarRascunhoLead(negocio);
  const rascunho = { ...original, contact: { ...original.contact!, name: "Ana editada" } };
  const corpo = montarAtualizacaoLead(original, rascunho, 4);
  assert.equal(corpo.version, 4);
  assert.equal(corpo.contact?.name, "Ana editada");
  assert.equal(corpo.contact?.rg, "RG existente");
  assert.equal(corpo.contact && "id" in corpo.contact, false);
  assert.equal("lead" in corpo, false);
  assert.equal("title" in corpo, false);
});

test("valor em reais mantém centavos, campos limpos viram null e remoção do contato é explícita", () => {
  const original = criarRascunhoLead(negocio);
  const corpo = montarAtualizacaoLead(original, { ...original, value: "2.345,67", contact: null, expectedCloseDate: "" }, 5);
  assert.equal(corpo.value, "2345.67");
  assert.equal(corpo.contact, null);
  const apagado = montarAtualizacaoLead(original, { ...original, value: "" }, 5);
  assert.equal(apagado.value, null);
});

test("valor inválido nunca vira zero nem descarta texto digitado", () => {
  const original = criarRascunhoLead(negocio);
  const rascunho = { ...original, value: "valor inválido" };
  assert.throws(() => montarAtualizacaoLead(original, rascunho, 1), /valor em reais/);
  assert.equal(rascunho.value, "valor inválido");
});

test("a ficha Solar preserva zeros, IDs e conta e só envia o projeto quando ele muda", () => {
  const projeto = { principalUc: { code: "000012-3" }, beneficiaryUcs: [{ id: "00000000-0000-4000-8000-000000000099", code: "000099-0" }], primaryEnergyBillDocumentId: "00000000-0000-4000-8000-000000000098" };
  const original = criarRascunhoLead({ ...negocio, solarProject: projeto });
  assert.deepEqual(original.solarProject, projeto);
  assert.notEqual(original.solarProject, projeto);
  assert.equal("solarProject" in montarAtualizacaoLead(original, original, 7), false);
  const rascunho = { ...original, solarProject: { ...original.solarProject!, principalUc: null, beneficiaryUcs: [] } };
  const corpo = montarAtualizacaoLead(original, rascunho, 7);
  assert.deepEqual(corpo.solarProject, { ...projeto, principalUc: null, beneficiaryUcs: [] });
  assert.equal(corpo.version, 7);
  assert.equal("customFields" in corpo, false);
  assert.equal(projeto.principalUc.code, "000012-3");
});

test("Solar sem ficha tem rascunho vazio; pipeline genérico não ganha ficha ao editar", () => {
  const solar = criarRascunhoLead({ ...negocio, solarProject: null });
  assert.deepEqual(solar.solarProject, { principalUc: null, beneficiaryUcs: [], primaryEnergyBillDocumentId: null });
  assert.equal("solarProject" in montarAtualizacaoLead(solar, solar, 1), false);
  const generico = criarRascunhoLead(negocio);
  assert.equal(generico.solarProject, undefined);
  assert.equal("solarProject" in montarAtualizacaoLead(generico, { ...generico, title: "Título editado" }, 2), false);
});
