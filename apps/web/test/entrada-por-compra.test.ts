import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { dicaDoPedido, opcaoDoPedido, problemaDaQuantidadeDoPedido } from "../app/lib/entrada-por-compra.ts";

const pedido = { id: "11111111-1111-4111-8111-111111111111", numero: 12, titulo: "Cabos da obra", etapa: "retirada" as const, pedida: "10.000", recebida: "4.000", falta: "6.000" };

describe("Estoque: entrada por compra ligada ao pedido (PLU-333)", () => {
  it("mostra o pedido com o que ainda falta do item", () => {
    assert.deepEqual(opcaoDoPedido(pedido, "m"), { value: pedido.id, label: "PC-0012 · Cabos da obra", description: "Faltam 6 m de 10 m" });
  });

  it("diz o estado da lista em vez de esconder a falha como lista vazia", () => {
    assert.equal(dicaDoPedido("sem_item", null, "m"), "Escolha o item para ver os pedidos com ele.");
    assert.equal(dicaDoPedido("carregando", null, "m"), "Carregando os pedidos deste item…");
    assert.match(dicaDoPedido("erro", null, "m"), /Não foi possível carregar os pedidos/);
    assert.equal(dicaDoPedido([], null, "m"), "Nenhum pedido em aberto espera este item.");
    assert.equal(dicaDoPedido([pedido], pedido, "m"), "Faltam 6 m de 10 m pedidos deste item.");
  });

  it("não deixa a quantidade passar do que o pedido espera", () => {
    assert.equal(problemaDaQuantidadeDoPedido(pedido, 6, "m"), null);
    assert.equal(problemaDaQuantidadeDoPedido(pedido, 6.5, "m"), "o pedido PC-0012 só espera mais 6 m deste item.");
    assert.equal(problemaDaQuantidadeDoPedido(null, 99, "m"), null);
  });
});
