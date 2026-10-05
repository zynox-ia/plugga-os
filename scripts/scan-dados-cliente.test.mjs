import assert from "node:assert/strict";
import { test } from "node:test";

import { carregaPermitidos, relatorio, varreArquivos } from "./scan-dados-cliente.mjs";
import { cnpjSintetico, cnpjValido, cpfSintetico, cpfValido, formataCnpj } from "./dados-sinteticos.mjs";
import { geraFixtures, listaDePermitidos } from "./gera-fixtures-sinteticas.mjs";

// Os valores são montados na hora, fora da faixa reservada, só para exercitar o
// validador: nenhum documento aparece escrito neste arquivo.
function documentoForaDaFaixa(tipo) {
  const dv = (base, pesos) => {
    const r = [...base].reduce((a, d, i) => a + Number(d) * pesos[i], 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  if (tipo === "cnpj") {
    const base = "123456780001";
    const p1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const d1 = dv(base, p1);
    return base + d1 + dv(base + d1, [6, ...p1]);
  }
  const base = "123456789";
  const d1 = dv(base, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return base + d1 + dv(base + d1, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
}

const NOME = "Fulano Teste Ltda";
const opcoes = { nomes: ["fulano teste"], permitidos: carregaPermitidos("/inexistente.json") };

test("acha CNPJ válido, com e sem pontuação", () => {
  const cnpj = documentoForaDaFaixa("cnpj");
  assert.ok(cnpjValido(cnpj));
  const r = varreArquivos({ "a.ts": `x = "${cnpj}"\ny = "${formataCnpj(cnpj)}"` }, opcoes);
  assert.deepEqual(r.map((o) => [o.linha, o.tipo]), [[1, "cnpj"], [2, "cnpj"]]);
});

test("acha CPF válido", () => {
  const cpf = documentoForaDaFaixa("cpf");
  assert.ok(cpfValido(cpf));
  assert.deepEqual(varreArquivos({ "a.ts": cpf }, opcoes).map((o) => o.tipo), ["cpf"]);
});

test("ignora número de 14 dígitos com dígito verificador inválido", () => {
  const cnpj = documentoForaDaFaixa("cnpj");
  const invalido = cnpj.slice(0, 13) + String((Number(cnpj[13]) + 1) % 10);
  assert.equal(cnpjValido(invalido), false);
  assert.deepEqual(varreArquivos({ "a.ts": invalido }, opcoes), []);
});

test("ignora dígitos que fazem parte de um número maior", () => {
  const cnpj = documentoForaDaFaixa("cnpj");
  assert.deepEqual(varreArquivos({ "a.ts": `9${cnpj}` }, opcoes), []);
});

test("acha nome da lista, sem acento e sem diferença de caixa", () => {
  const r = varreArquivos({ "a.md": "contrato do FÚLANO Teste" }, { ...opcoes, nomes: ["fulano teste"] });
  assert.deepEqual(r.map((o) => o.tipo), ["nome-de-cliente"]);
});

test("a faixa reservada dos sintéticos e a lista de permitidos não geram ocorrência", () => {
  const fixtures = geraFixtures(5);
  const permitidos = carregaPermitidos("/inexistente.json");
  const texto = [...fixtures.cnpjs, ...fixtures.cpfs, cnpjSintetico(1), cpfSintetico(1)].join("\n");
  assert.deepEqual(varreArquivos({ "a.json": texto }, { permitidos }), []);

  const uc = fixtures.ucs[0];
  assert.equal(varreArquivos({ "a.json": uc }, { permitidos }).length, 1);
  const lista = listaDePermitidos(fixtures);
  const comLista = { documentos: new Set(lista.documentos), ucs: new Set(lista.ucs.map((u) => u.toLowerCase())), nomes: new Set(), arquivos: new Set() };
  assert.deepEqual(varreArquivos({ "a.json": uc }, { permitidos: comLista }), []);
});

test("arquivo na lista de permitidos é ignorado", () => {
  const cnpj = documentoForaDaFaixa("cnpj");
  const permitidos = { documentos: new Set(), ucs: new Set(), nomes: new Set(), arquivos: new Set(["fixtures/x.json"]) };
  assert.deepEqual(varreArquivos({ "fixtures/x.json": cnpj }, { permitidos }), []);
});

test("não imprime o valor no relatório", () => {
  const cnpj = documentoForaDaFaixa("cnpj");
  const texto = relatorio(varreArquivos({ "a.ts": `${cnpj} ${NOME}` }, opcoes));
  assert.ok(texto.includes("a.ts:1 cnpj"));
  assert.ok(!texto.includes(cnpj));
  assert.ok(!texto.toLowerCase().includes("fulano"));
});

test("acusa UC ou CNPJ em .md de specs/ e docs/", () => {
  const cnpj = documentoForaDaFaixa("cnpj");
  const r = varreArquivos(
    { "specs/002/relatorio.md": "A unidade UC-1234567 consome", "docs/x.md": `CNPJ ${cnpj}` },
    opcoes,
  );
  assert.deepEqual(r.map((o) => [o.arquivo, o.tipo]), [
    ["specs/002/relatorio.md", "unidade-consumidora"],
    ["docs/x.md", "cnpj"],
  ]);
});

test("o gerador é determinístico e só produz documentos válidos", () => {
  const a = geraFixtures(10);
  assert.deepEqual(a, geraFixtures(10));
  assert.ok(a.cnpjs.every(cnpjValido));
  assert.ok(a.cpfs.every(cpfValido));
});
