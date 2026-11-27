import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resumoDaCobertura, textoDaLinha, tomDaLinha, type LinhaDaCobertura } from "../app/lib/cobertura-do-estoque.ts";

const ID = "11111111-1111-4111-8111-111111111111";
const estoque = { id: ID, codigo: "EST-0001", nome: "Cabo 6mm", unidade: "m" };
const linha = (dados: Partial<LinhaDaCobertura> = {}): LinhaDaCobertura => ({
  itemDoPedidoId: ID, descricao: "Cabo", quantidadePedida: "4.000", itemDeEstoque: estoque, disponivel: "5.000", pedidoDoItem: "4.000", atende: "4.000", motivo: null, ...dados,
});

describe("Compras: quanto o estoque atende na análise (PLU-328)", () => {
  it("linha atendida inteira", () => {
    assert.equal(tomDaLinha(linha()), "atende");
    assert.deepEqual(textoDaLinha(linha()), { atende: "Atende 4 m de 4 m", porque: null });
  });

  it("explica a falta somando as linhas do mesmo item", () => {
    const parcial = linha({ atende: "1.000", pedidoDoItem: "8.000", motivo: "insuficiente" });
    assert.equal(tomDaLinha(parcial), "parcial");
    assert.deepEqual(textoDaLinha(parcial), { atende: "Atende 1 m de 4 m", porque: "Disponível insuficiente. 5 m disponíveis para 8 m pedidos deste item no pedido." });
    assert.equal(textoDaLinha(linha({ atende: "0.000", disponivel: "2.000", motivo: "insuficiente" })).porque, "Disponível insuficiente. 2 m disponíveis.");
  });

  it("diz por que não atende: sem vínculo, inativo, outra empresa", () => {
    assert.deepEqual(textoDaLinha(linha({ itemDeEstoque: null, disponivel: null, pedidoDoItem: null, atende: "0.000", motivo: "sem_vinculo" })), { atende: "Não atende pelo estoque", porque: "Sem item do estoque vinculado." });
    assert.equal(textoDaLinha(linha({ atende: "0.000", motivo: "inativo" })).porque, "O item do estoque está inativo.");
    assert.equal(tomDaLinha(linha({ atende: "0.000", motivo: "outra_empresa" })), "nao");
  });

  it("resume o pedido", () => {
    assert.equal(resumoDaCobertura({ itens: [linha()], atendeTudo: true }), "O estoque atende o pedido inteiro.");
    assert.equal(resumoDaCobertura({ itens: [linha(), linha({ motivo: "inativo", atende: "0.000" })], atendeTudo: false }), "O estoque atende 1 de 2 itens.");
    assert.equal(resumoDaCobertura({ itens: [linha({ motivo: "inativo", atende: "0.000" })], atendeTudo: false }), "O estoque não atende nenhum item do pedido.");
  });
});
