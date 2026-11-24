import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { CategoriaFinanceira, ContaCorrente } from "@plugga/shared";

import { categoriasAgrupadas, contagemDasCategorias, contasDaTela, detalheDaConta } from "../app/lib/configuracoes-do-financeiro.ts";

const u = (n: number) => `6f1c2a3b-0000-4000-8000-${String(n).padStart(12, "0")}`;
const conta = (n: number, parcial: Partial<ContaCorrente>): ContaCorrente => ({
  id: u(n), empresa: "plugga", nome: `Conta ${n}`, banco: null, agencia: null, numero: null, saldo: null, saldoLidoEm: null, ativa: true, ...parcial,
});
const categoria = (n: number, codigo: string, parcial: Partial<CategoriaFinanceira> = {}): CategoriaFinanceira => ({
  id: u(n), empresa: "plugga", codigo, nome: `Categoria ${codigo}`, tipo: "despesa", natureza: "outros",
  grupo: { codigo: codigo.split(".").slice(0, 2).join("."), nome: `Grupo ${codigo.split(".").slice(0, 2).join(".")}` }, ativa: true, ...parcial,
});

describe("contas correntes", () => {
  it("filtra pela empresa e põe as ativas primeiro", () => {
    const opcoes = { contasCorrentes: [conta(1, { nome: "Sicoob", ativa: false }), conta(2, { nome: "Itaú" }), conta(3, { nome: "BB", empresa: "waze" })] };
    assert.deepEqual(contasDaTela(opcoes, "plugga").map((c) => c.nome), ["Itaú", "Sicoob"]);
    assert.deepEqual(contasDaTela(opcoes, null).map((c) => c.nome), ["Itaú", "BB", "Sicoob"]);
  });

  it("o detalhe mostra só o que a conta tem cadastrado", () => {
    assert.equal(detalheDaConta({ banco: "Itaú", agencia: "0412", numero: "23456-7" }), "Itaú · ag 0412 · cc 23456-7");
    assert.equal(detalheDaConta({ banco: "Itaú", agencia: null, numero: null }), "Itaú");
    assert.equal(detalheDaConta({ banco: null, agencia: null, numero: null }), "");
  });
});

describe("categorias", () => {
  const opcoes = { categorias: [categoria(1, "2.01.10"), categoria(2, "1.01.01", { tipo: "receita", nome: "Gestão de energia" }), categoria(3, "2.01.2"), categoria(4, "1.02.01", { empresa: "waze", nome: "Serviços de engenharia" })] };

  it("agrupa pelos dois primeiros níveis do código, na ordem numérica", () => {
    const grupos = categoriasAgrupadas(opcoes, null);
    assert.deepEqual(grupos.map((g) => [g.codigo, g.categorias.map((c) => c.codigo)]), [["1.01", ["1.01.01"]], ["1.02", ["1.02.01"]], ["2.01", ["2.01.2", "2.01.10"]]]);
    assert.equal(contagemDasCategorias(grupos), "4 categorias em 3 grupos");
  });

  it("com as duas empresas, o grupo de mesmo código e nome diferente não leva o nome do outro", () => {
    const plano = { categorias: [
      categoria(5, "2.03.01", { grupo: { codigo: "2.03", nome: "Locações" } }),
      categoria(6, "2.03.01", { empresa: "waze", grupo: { codigo: "2.03", nome: "Aluguéis" } }),
      categoria(7, "2.03.02", { empresa: "waze", grupo: { codigo: "2.03", nome: "Locações" } }),
    ] };
    assert.deepEqual(categoriasAgrupadas(plano, null).map((g) => [g.codigo, g.nome, g.categorias.map((c) => c.id)]),
      [["2.03", "Locações", [u(5), u(7)]], ["2.03", "Aluguéis", [u(6)]]]);
  });

  it("filtra por empresa e busca sem acento por nome, código ou grupo", () => {
    assert.deepEqual(categoriasAgrupadas(opcoes, "waze").map((g) => g.codigo), ["1.02"]);
    assert.deepEqual(categoriasAgrupadas(opcoes, null, "gestao").flatMap((g) => g.categorias.map((c) => c.codigo)), ["1.01.01"]);
    assert.deepEqual(categoriasAgrupadas(opcoes, null, "2.01.").flatMap((g) => g.categorias.map((c) => c.codigo)), ["2.01.2", "2.01.10"]);
    assert.equal(contagemDasCategorias(categoriasAgrupadas(opcoes, null, "nada")), "0 categorias em 0 grupos");
    assert.equal(contagemDasCategorias(categoriasAgrupadas(opcoes, "waze")), "1 categoria em 1 grupo");
  });
});
