import assert from "node:assert/strict";
import { test } from "node:test";
import { mascaraCep, mascaraTelefone, normalizarSite, urlSiteSeguro, mapaDoEndereco } from "../app/lib/perfil-lead.ts";

test("CEP formata durante a digitação, aceita colagem e permite apagar", () => {
  assert.equal(mascaraCep("01001"), "01001");
  assert.equal(mascaraCep("010010"), "01001-0");
  assert.equal(mascaraCep("CEP: 01001-000999"), "01001-000");
  assert.equal(mascaraCep(""), "");
});

test("celular e telefone fixo usam DDD e máscaras próprias sem salvar pontuação", () => {
  assert.equal(mascaraTelefone("1"), "(1");
  assert.equal(mascaraTelefone("11999990000"), "(11) 99999-0000");
  assert.equal(mascaraTelefone("+55 (11) 99999-0000"), "(11) 99999-0000");
  assert.equal(mascaraTelefone("1133334444", true), "(11) 3333-4444");
  assert.equal(mascaraTelefone("113333", true), "(11) 3333");
  assert.equal(mascaraTelefone(""), "");
});

test("site admite domínio digitado e nunca produz link executável", () => {
  assert.equal(normalizarSite(" empresa.example "), "https://empresa.example");
  assert.equal(normalizarSite("https://empresa.example/contato"), "https://empresa.example/contato");
  assert.equal(urlSiteSeguro("javascript:alert(1)"), null);
  assert.equal(urlSiteSeguro("data:text/html,x"), null);
  assert.equal(urlSiteSeguro("https://empresa.example"), "https://empresa.example/");
  assert.equal(urlSiteSeguro(""), null);
});

test("mapa usa endereço/CEP atuais, codifica a busca e ignora complemento e CEP parcial", () => {
  assert.equal(mapaDoEndereco({ postalCode: "01001", street: null, district: null, city: null, state: null }), null);
  const endereco = { postalCode: "01001000", street: "Praça da Sé, s/n", district: "Sé", city: "São Paulo", state: "SP" };
  const mapa = mapaDoEndereco(endereco)!;
  assert.equal(new URL(mapa.embedUrl).hostname, "maps.google.com");
  assert.equal(new URL(mapa.externalUrl).searchParams.get("api"), "1");
  assert.equal(new URL(mapa.externalUrl).searchParams.get("query"), "Praça da Sé, s/n, Sé, São Paulo, SP, 01001-000, Brasil");
  const outro = mapaDoEndereco({ ...endereco, postalCode: "01310200", street: "Avenida Paulista, 1578" })!;
  assert.match(new URL(outro.externalUrl).searchParams.get("query")!, /1578.*01310-200/);
});
