import assert from "node:assert/strict";
import { it } from "node:test";

import * as shared from "../dist/index.js";

function documentoSintetico(base, pesos) {
  let digitos = base;
  for (const peso of pesos) {
    const resto = [...digitos].reduce((soma, digito, indice) => soma + Number(digito) * peso[indice], 0) % 11;
    digitos += resto < 2 ? 0 : 11 - resto;
  }
  return digitos;
}

const cpf = documentoSintetico("999999001", [[10, 9, 8, 7, 6, 5, 4, 3, 2], [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]]);
const cnpj = documentoSintetico("999999990001", [[5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]]);
const lead = { name: "Lead sintético", personType: "pf" };

it("conversão aceita nome com telefone, e-mail ou documento válido, sem exigir os demais", () => {
  for (const dados of [{ phone: "92999990000" }, { email: "lead@teste.local" }, { document: cpf }]) {
    assert.deepEqual(shared.problemasDaConversaoDoLead({ ...lead, ...dados }), []);
  }
  assert.deepEqual(shared.problemasDaConversaoDoLead({ name: "Empresa sintética", personType: "pj", document: cnpj }), []);
  assert.deepEqual(shared.problemasDaConversaoDoLead({ ...lead, name: "A", phone: "92999990000" }), []);
});

it("nome continua obrigatório mesmo com dois identificadores e espaços não contam como preenchimento", () => {
  for (const name of ["", "   "]) {
    assert.ok(shared.problemasDaConversaoDoLead({ ...lead, name, email: "lead@teste.local", phone: "92999990000" }).some((p) => p.campo === "name"));
  }
  assert.ok(shared.problemasDaConversaoDoLead({ ...lead, phone: " ", email: "", document: null }).some((p) => p.campo === "phone"));
});

it("conversão conserva a validação de todo identificador informado e do tipo de pessoa", () => {
  const casos = [
    { phone: "123", email: "lead@teste.local", campo: "phone" },
    { phone: "92999990000", email: "inválido", campo: "email" },
    { phone: "92999990000", document: cpf.slice(0, -1) + ((Number(cpf.at(-1)) + 1) % 10), campo: "document" },
    { phone: "92999990000", document: cnpj, campo: "document" },
    { phone: "92999990000", temContatos: true, campo: "personType" },
  ];
  for (const { campo, ...dados } of casos) {
    assert.ok(shared.problemasDaConversaoDoLead({ ...lead, ...dados }).some((p) => p.campo === campo), campo);
  }
  assert.ok(shared.problemasDaConversaoDoLead({ name: "Empresa sintética", personType: "pj", document: cnpj, rg: "inválido para PJ" }).some((p) => p.campo === "rg"));
});

it("regra de conversão não afrouxa o cadastro geral de clientes", () => {
  assert.ok(shared.problemasDoCadastro({ ...lead, document: cpf }).some((p) => p.campo === "phone"));
  assert.equal(shared.createClientRequestSchema.safeParse({ ...lead, document: cpf }).success, false);
});
