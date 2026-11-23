import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  avisoDeCopia,
  cepFormatado,
  documentoFormatado,
  enderecoNoMapa,
  larguraDaBarra,
  linksDoTelefone,
  mascararSegredo,
  ruaDoFornecedor,
  textosDoDesempenho,
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

describe("ficha rica do fornecedor (PLU-334)", () => {
  it("endereço: CEP formatado, rua com número e complemento, e o formato do mapa", () => {
    assert.equal(cepFormatado("69000000"), "69000-000");
    assert.equal(cepFormatado(null), null);
    assert.equal(ruaDoFornecedor({ logradouro: "Av. Teste", numero: "120", complemento: "sala 3" }), "Av. Teste, 120 · sala 3");
    assert.equal(ruaDoFornecedor({ logradouro: null, numero: null, complemento: null }), null);
    assert.deepEqual(enderecoNoMapa({ cep: "69000000", logradouro: "Av. Teste", numero: "120", bairro: "Centro", cidade: "Manaus", uf: "AM" }),
      { postalCode: "69000000", street: "Av. Teste, 120", district: "Centro", city: "Manaus", state: "AM" });
  });

  it("telefone vira Ligar e WhatsApp com o 55 uma vez só", () => {
    assert.deepEqual(linksDoTelefone("92999990001"), { ligar: "tel:+5592999990001", whatsapp: "https://wa.me/5592999990001" });
    assert.deepEqual(linksDoTelefone("5592999990001"), { ligar: "tel:+5592999990001", whatsapp: "https://wa.me/5592999990001" });
    assert.equal(linksDoTelefone("123"), null);
    assert.equal(linksDoTelefone(null), null);
  });

  it("o aviso de cópia concorda com o campo", () => {
    assert.equal(avisoDeCopia("Chave PIX"), "Chave PIX copiada.");
    assert.equal(avisoDeCopia("Dados bancários"), "Dados bancários copiados.");
    assert.equal(avisoDeCopia("E-mail"), "E-mail copiado.");
  });

  it("segredo de pagamento mostra só o fim", () => {
    assert.equal(mascararSegredo("99999001000159"), "•••• 0159");
    assert.equal(mascararSegredo("abc"), "••••");
  });

  it("cards de desempenho, com e sem cotação", () => {
    const dia = (iso: string) => iso.slice(0, 10);
    const cheio = textosDoDesempenho({ cotacoes: 5, vitorias: 2, percentualDeVitorias: 40, valorComprado: "1000.00", prazoMedioDeEntregaDias: 4.5, ultimaCotacaoEm: "2026-11-20T12:00:00Z" }, dia);
    assert.deepEqual(cheio, { cotacoes: { valor: "5", nota: "última em 2026-11-20" }, vitorias: { valor: "2", nota: "40% das cotações", barra: 40 }, prazo: { valor: "4,5 d.u.", nota: "de entrega declarado" } });
    const vazio = textosDoDesempenho({ cotacoes: 0, vitorias: 0, percentualDeVitorias: null, valorComprado: "0", prazoMedioDeEntregaDias: null, ultimaCotacaoEm: null }, dia);
    assert.equal(vazio.cotacoes.nota, "nenhuma ainda");
    assert.equal(vazio.vitorias.nota, "sem cotação ainda");
    assert.equal(vazio.prazo.valor, "—");
  });

  it("barra de valor relativa à maior cotação, sempre visível", () => {
    assert.equal(larguraDaBarra("500", 1000), 50);
    assert.equal(larguraDaBarra("1", 1000), 2);
    assert.equal(larguraDaBarra("x", 1000), 0);
  });
});
