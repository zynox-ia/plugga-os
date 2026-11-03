import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { documentoFormatado, enderecoEmUmaLinha, hrefDaFicha, iniciais, lerErro } from "../app/lib/clientes.ts";

describe("documentoFormatado", () => {
  it("formata CNPJ para PJ e CPF para PF; sem documento, nada", () => {
    assert.equal(documentoFormatado("pj", "99999001000159"), "99.999.001/0001-59");
    assert.equal(documentoFormatado("pf", "99999900100"), "999.999.001-00");
    assert.equal(documentoFormatado("pj", null), null);
  });
});

describe("enderecoEmUmaLinha", () => {
  it("junta só as partes informadas", () => {
    assert.equal(
      enderecoEmUmaLinha({ street: "Av. do Turismo, 1500", addressComplement: null, district: "Tarumã", city: "Manaus", state: "AM", postalCode: "69041010" }),
      "Av. do Turismo, 1500 · Tarumã · Manaus/AM · CEP 69041-010",
    );
    assert.equal(
      enderecoEmUmaLinha({ street: null, addressComplement: null, district: null, city: null, state: null, postalCode: null }),
      null,
    );
  });
});

describe("hrefDaFicha", () => {
  it("abre a ficha mantendo a busca, para o link reproduzir a mesma tela", () => {
    assert.equal(hrefDaFicha("abc", { q: "hotel" }), "/clientes?q=hotel&cliente=abc");
    assert.equal(hrefDaFicha(null, { q: "hotel" }), "/clientes?q=hotel");
    assert.equal(hrefDaFicha(null), "/clientes");
  });
});

describe("iniciais", () => {
  it("usa as duas primeiras palavras, sem conectivos", () => {
    assert.equal(iniciais("Hotel Mirante do Rio"), "HM");
    assert.equal(iniciais("Condomínio de Palmeiras"), "CP");
    assert.equal(iniciais("Rafael"), "R");
  });
});

describe("lerErro", () => {
  it("preserva campos do lead e aliases legados sem misturar telefone, e-mail e nome", () => {
    const erro = lerErro({ detalhes: [
      { campo: "lead.phone", problema: "Telefone inválido" },
      { campo: "lead.email", problema: "E-mail inválido" },
      { campo: "lead.name", problema: "Nome obrigatório" },
      { campo: "contacts.0.phone", problema: "Telefone do contato inválido" },
      { campo: "ownerId", problema: "Responsável inválido" },
    ] }, "padrão");

    assert.equal(erro.porCampo["lead.phone"], "Telefone inválido");
    assert.equal(erro.porCampo["lead.email"], "E-mail inválido");
    assert.equal(erro.porCampo["lead.name"], "Nome obrigatório");
    assert.equal(erro.porCampo.lead, "Telefone inválido");
    assert.equal(erro.porCampo["contacts.0.phone"], "Telefone do contato inválido");
    assert.equal(erro.porCampo.contacts, "Telefone do contato inválido");
    assert.equal(erro.porCampo.ownerId, "Responsável inválido");
  });

  it("separa os problemas por campo quando a API devolve detalhes", () => {
    const erro = lerErro(
      { codigo: "REQUISICAO_INVALIDA", mensagem: "request validation failed", detalhes: [{ campo: "phone", problema: "Informe pelo menos um telefone ou e-mail." }] },
      "padrão",
    );
    assert.equal(erro.porCampo.phone, "Informe pelo menos um telefone ou e-mail.");
    assert.equal(erro.mensagem, "Confira os campos destacados.");
  });

  it("usa a mensagem da API quando não há campo, e o padrão quando não há corpo", () => {
    assert.equal(lerErro({ codigo: "CONFLITO_UNICIDADE", mensagem: "Já existe um cliente com este CNPJ." }, "padrão").mensagem, "Já existe um cliente com este CNPJ.");
    assert.equal(lerErro(null, "padrão").mensagem, "padrão");
  });

  it("preserva apenas candidatos de conversão válidos no erro da API", () => {
    const erro = lerErro({
      codigo: "REQUISICAO_INVALIDA",
      mensagem: "Escolha como continuar.",
      candidatos: [
        { id: "00000000-0000-4000-8000-000000000001", name: "Cliente existente", personType: "pj", matchedOn: ["email"] },
        { id: "invalido", name: "Ignorado" },
      ],
    }, "padrão");

    assert.deepEqual(erro.candidatos?.map(({ id, name }) => ({ id, name })), [
      { id: "00000000-0000-4000-8000-000000000001", name: "Cliente existente" },
    ]);
  });
});
