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
});
