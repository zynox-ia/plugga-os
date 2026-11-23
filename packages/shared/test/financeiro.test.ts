import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  acaoDoLancamentoSchema,
  acoesDoLancamento,
  colunaDaEtapa,
  criarContaAPagarSchema,
  editarLancamentoSchema,
  etapasDeEntrada,
  etapasDeLancamento,
  etapasDeSaida,
  listarLancamentosQuerySchema,
  quadroFinanceiroQuerySchema,
} from "../dist/financeiro.js";

const UUID = "00000000-0000-0000-0000-0000000000f1";
const CONTA = { empresa: "plugga", fornecedorId: UUID, categoriaId: UUID, contaCorrenteId: UUID, descricao: "Aluguel", valor: "6500.00", vencimento: "2026-11-10", forma: "boleto" };

describe("contrato do Financeiro", () => {
  it("toda etapa dos dois tipos está na lista geral e tem coluna no quadro", () => {
    assert.deepEqual([...new Set([...etapasDeSaida, ...etapasDeEntrada])].sort(), [...etapasDeLancamento].sort());
    for (const etapa of etapasDeLancamento) assert.ok(colunaDaEtapa[etapa]);
  });

  it("a lista de ações tem todas as ações da união", () => {
    const daUniao = acaoDoLancamentoSchema.options.map((opcao) => opcao.shape.acao.value).sort();
    assert.deepEqual([...acoesDoLancamento].sort(), daUniao);
  });

  it("nova conta: valor positivo, dia que existe e nada fora do contrato", () => {
    assert.equal(criarContaAPagarSchema.safeParse(CONTA).success, true);
    assert.equal(criarContaAPagarSchema.safeParse({ ...CONTA, valor: "0" }).success, false);
    assert.equal(criarContaAPagarSchema.safeParse({ ...CONTA, vencimento: "2026-02-30" }).success, false);
    assert.equal(criarContaAPagarSchema.safeParse({ ...CONTA, etapa: "aprovada" }).success, false);
    assert.equal(criarContaAPagarSchema.parse({ ...CONTA, observacao: "  " }).observacao, null);
  });

  it("editar não aceita empresa nem valor", () => {
    assert.equal(editarLancamentoSchema.safeParse({ empresa: "waze" }).success, false);
    assert.equal(editarLancamentoSchema.safeParse({ valor: "1.00" }).success, false);
  });

  it("cancelar e corrigir valor exigem motivo", () => {
    assert.equal(acaoDoLancamentoSchema.safeParse({ acao: "cancelar", motivo: " " }).success, false);
    assert.equal(acaoDoLancamentoSchema.safeParse({ acao: "corrigir_valor", valor: "10.00" }).success, false);
  });

  it("lista: tipo todos por padrão; o quadro não aceita situação", () => {
    assert.equal(listarLancamentosQuerySchema.parse({}).tipo, "todos");
    assert.equal(listarLancamentosQuerySchema.safeParse({ situacao: "pagas" }).success, false);
    assert.equal(quadroFinanceiroQuerySchema.safeParse({ situacao: "pagar" }).success, false);
  });
});
