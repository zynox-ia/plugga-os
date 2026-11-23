import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { acaoDoPedidoSchema } from "../dist/compras.js";
import {
  abrirPedidoDeReposicaoSchema,
  criarItemDeEstoqueSchema,
  listarItensDeEstoqueQuerySchema,
  listarMovimentacoesQuerySchema,
  registrarMovimentacaoSchema,
} from "../dist/estoque.js";

const UUID = "00000000-0000-0000-0000-0000000000c1";
const item = { empresa: "waze", nome: "Cabo 6 mm", categoria: "material_eletrico", unidade: "m", estoqueMinimo: "100" };

describe("criarItemDeEstoqueSchema", () => {
  it("o código é opcional e fica em maiúsculas", () => {
    assert.equal(criarItemDeEstoqueSchema.parse(item).codigo, undefined);
    assert.equal(criarItemDeEstoqueSchema.parse({ ...item, codigo: "cab-6mm" }).codigo, "CAB-6MM");
    assert.equal(criarItemDeEstoqueSchema.safeParse({ ...item, codigo: "cabo 6" }).success, false);
  });

  it("saldo inicial e custo unitário andam juntos", () => {
    assert.equal(criarItemDeEstoqueSchema.safeParse({ ...item, saldoInicial: "10" }).success, false);
    assert.equal(criarItemDeEstoqueSchema.safeParse({ ...item, custoUnitario: "5.00" }).success, false);
    assert.equal(criarItemDeEstoqueSchema.safeParse({ ...item, saldoInicial: "10.5", custoUnitario: "5.00" }).success, true);
  });

  it("exige a empresa", () => {
    assert.equal(criarItemDeEstoqueSchema.safeParse({ ...item, empresa: undefined }).success, false);
  });
});

describe("registrarMovimentacaoSchema", () => {
  it("entrada exige custo unitário e origem; pedido só na compra", () => {
    assert.equal(registrarMovimentacaoSchema.safeParse({ tipo: "entrada", itemId: UUID, quantidade: "1", origem: { tipo: "outra" } }).success, false);
    assert.equal(registrarMovimentacaoSchema.safeParse({ tipo: "entrada", itemId: UUID, quantidade: "1", custoUnitario: "2.00", origem: { tipo: "compra", pedidoId: UUID } }).success, true);
    assert.equal(registrarMovimentacaoSchema.safeParse({ tipo: "entrada", itemId: UUID, quantidade: "1", custoUnitario: "2.00", origem: { tipo: "devolucao", pedidoId: UUID } }).success, false);
  });

  it("saída exige o vínculo do destino", () => {
    assert.equal(registrarMovimentacaoSchema.safeParse({ tipo: "saida", itemId: UUID, quantidade: "1", destino: { tipo: "obra" } }).success, false);
    assert.equal(registrarMovimentacaoSchema.safeParse({ tipo: "saida", itemId: UUID, quantidade: "1", destino: { tipo: "interno", area: "Escritório" } }).success, true);
    assert.equal(registrarMovimentacaoSchema.safeParse({ tipo: "saida", itemId: UUID, quantidade: "1", destino: { tipo: "obra", obraId: UUID, area: "x" } }).success, false);
  });

  it("ajuste: saldo contado ou diferença, exatamente um, e sempre com motivo", () => {
    const base = { tipo: "ajuste", itemId: UUID, observacao: "Contagem do mês" };
    assert.equal(registrarMovimentacaoSchema.safeParse({ ...base, saldoContado: "12" }).success, true);
    assert.equal(registrarMovimentacaoSchema.safeParse({ ...base, quantidade: "-2.5" }).success, true);
    assert.equal(registrarMovimentacaoSchema.safeParse({ ...base }).success, false);
    assert.equal(registrarMovimentacaoSchema.safeParse({ ...base, saldoContado: "12", quantidade: "1" }).success, false);
    assert.equal(registrarMovimentacaoSchema.safeParse({ ...base, quantidade: "0" }).success, false);
    assert.equal(registrarMovimentacaoSchema.safeParse({ tipo: "ajuste", itemId: UUID, saldoContado: "1" }).success, false);
  });

  it("reserva e liberação não são registradas pela tela", () => {
    assert.equal(registrarMovimentacaoSchema.safeParse({ tipo: "reserva", itemId: UUID, quantidade: "1" }).success, false);
    assert.equal(registrarMovimentacaoSchema.safeParse({ tipo: "liberacao", itemId: UUID, quantidade: "1" }).success, false);
  });
});

describe("consultas", () => {
  it("lista abre em ativos, com qualquer saldo; aceita o filtro com reserva", () => {
    assert.deepEqual(listarItensDeEstoqueQuerySchema.parse({}), { saldo: "todos", situacao: "ativos" });
    assert.equal(listarItensDeEstoqueQuerySchema.safeParse({ saldo: "com_reserva" }).success, true);
  });

  it("movimentações: período rápido ou datas, não os dois", () => {
    assert.equal(listarMovimentacoesQuerySchema.safeParse({ periodo: "mes" }).success, true);
    assert.equal(listarMovimentacoesQuerySchema.safeParse({ periodo: "7", de: "2026-11-01" }).success, false);
  });
});

describe("ligação com Compras", () => {
  it("confirmar recebimento aceita entrada no estoque", () => {
    const acao = { acao: "confirmar_recebimento", valorFaturado: "100.00", entradaNoEstoque: [{ itemDoPedidoId: UUID, quantidade: "2", custoUnitario: "50.00" }] };
    assert.equal(acaoDoPedidoSchema.safeParse(acao).success, true);
    assert.equal(acaoDoPedidoSchema.safeParse({ ...acao, entradaNoEstoque: [] }).success, false);
  });

  it("abrir pedido de reposição exige o prazo e aceita a quantidade", () => {
    assert.equal(abrirPedidoDeReposicaoSchema.safeParse({}).success, false);
    assert.equal(abrirPedidoDeReposicaoSchema.safeParse({ prazoEntregaDesejado: "2026-12-10", quantidade: "40" }).success, true);
  });
});
