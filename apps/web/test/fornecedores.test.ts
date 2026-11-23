import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  documentoFormatado,
  formasResumidas,
  hrefDeFornecedores,
  lerFiltrosDeFornecedores,
  localDoFornecedor,
  mascaraDocumento,
  nomeDoFornecedor,
  textoDaContagem,
  textoDeCotacoes,
} from "../app/lib/fornecedores.ts";

describe("lerFiltrosDeFornecedores", () => {
  it("aceita só situação e categoria conhecidas e corta a busca", () => {
    assert.deepEqual(lerFiltrosDeFornecedores({}), { busca: undefined, situacao: "todos" });
    assert.deepEqual(lerFiltrosDeFornecedores({ busca: "  solar ", situacao: "inativos", categoria: "kit_solar" }), { busca: "solar", situacao: "inativos", categoria: "kit_solar" });
    assert.deepEqual(lerFiltrosDeFornecedores({ situacao: "qualquer", categoria: "carro" }), { busca: undefined, situacao: "todos" });
    assert.equal(lerFiltrosDeFornecedores({ busca: "x".repeat(200) }).busca?.length, 150);
  });
});

describe("hrefDeFornecedores", () => {
  it("leva os filtros e a ficha no endereço, sem o padrão 'todos'", () => {
    assert.equal(hrefDeFornecedores({ situacao: "todos" }), "/suprimentos/fornecedores");
    assert.equal(hrefDeFornecedores({ busca: "Solar Tec", situacao: "ativos", categoria: "servico" }, "abc"),
      "/suprimentos/fornecedores?busca=Solar+Tec&situacao=ativos&categoria=servico&fornecedor=abc");
  });
});

describe("documento", () => {
  it("formata pelo tamanho: 11 é CPF, 14 é CNPJ", () => {
    assert.equal(documentoFormatado("99999001000159"), "99.999.001/0001-59");
    assert.equal(documentoFormatado("99999900100"), "999.999.001-00");
    assert.equal(documentoFormatado(null), null);
  });

  it("mascara enquanto se digita e passa de CPF para CNPJ no 12º dígito", () => {
    assert.equal(mascaraDocumento("4829"), "482.9");
    assert.equal(mascaraDocumento("99999900100"), "999.999.001-00");
    assert.equal(mascaraDocumento("999990010001"), "99.999.001/0001-");
    assert.equal(mascaraDocumento("99.999.001/0001-59999"), "99.999.001/0001-59");
  });
});

describe("textos da lista", () => {
  it("usa o fantasia quando existe e junta cidade e UF", () => {
    assert.equal(nomeDoFornecedor({ nome: "Solartec Distribuidora Ltda.", nomeFantasia: "Solartec" }), "Solartec");
    assert.equal(nomeDoFornecedor({ nome: "João Batista", nomeFantasia: null }), "João Batista");
    assert.equal(localDoFornecedor({ cidade: "Manaus", uf: "AM" }), "Manaus / AM");
    assert.equal(localDoFornecedor({ cidade: null, uf: null }), null);
  });

  it("resume formas de pagamento, cotações e contagem no singular e no plural", () => {
    assert.equal(formasResumidas(["pix", "cartao_credito"]), "PIX · Cartão");
    assert.equal(formasResumidas(["pix", "cartao_credito"], false), "PIX, Cartão de crédito");
    assert.equal(formasResumidas([]), null);
    assert.equal(textoDeCotacoes(0), "Nenhuma cotação");
    assert.equal(textoDeCotacoes(1), "1 cotação");
    assert.equal(textoDeCotacoes(14), "14 cotações");
    assert.equal(textoDaContagem(1, 1), "1 fornecedor · 1 ativo");
    assert.equal(textoDaContagem(9, 8), "9 fornecedores · 8 ativos");
  });
});
