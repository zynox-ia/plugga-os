import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { corrigirParaAUnidadeDoItem, erroDaLinha, problemaDaUnidade, unidadeAoVincular, unidadeDaLinha, unidadeParaEnviar } from "../app/lib/unidade-da-linha.ts";
import { camposDoPedidoAlterados } from "../app/lib/ficha-do-pedido.ts";

const ID = "11111111-1111-4111-8111-111111111111";
const doEstoque = [{ id: ID, unidade: "m" }];

describe("Compras: unidade da linha vinculada ao estoque (PLU-328)", () => {
  it("linha sem vínculo tem unidade livre", () => {
    assert.deepEqual(unidadeDaLinha({ unidade: "cx", estoqueId: null }, doEstoque), { exibida: "cx", travada: false, conflito: null, desconhecida: null, dica: null });
  });

  it("vinculada na unidade do item (ou sem unidade): mostra a do item e trava o campo", () => {
    assert.deepEqual(unidadeDaLinha({ unidade: "m", estoqueId: ID }, doEstoque), { exibida: "m", travada: true, conflito: null, desconhecida: null, dica: "Na unidade do item do estoque (m). Desvincule para mudar." });
    assert.equal(unidadeDaLinha({ unidade: "", estoqueId: ID }, doEstoque).exibida, "m");
    assert.equal(unidadeDaLinha({ unidade: "m", estoqueId: ID.toUpperCase() }, doEstoque).conflito, null);
  });

  it("linha antiga em outra unidade: conflito, sem trocar a unidade em silêncio (revisão leva 9)", () => {
    const u = unidadeDaLinha({ unidade: "cx", estoqueId: ID }, doEstoque);
    assert.deepEqual(u, { exibida: "cx", travada: true, conflito: { daLinha: "cx", doItem: "m" }, desconhecida: null, dica: "Esta linha está em cx, mas o item do estoque é controlado em m." });
    assert.equal(problemaDaUnidade(u), "a linha está em cx e o item do estoque em m: corrija a quantidade para m ou desvincule o item.");
    // Mesmo critério do servidor: caixa conta.
    assert.ok(unidadeDaLinha({ unidade: "M", estoqueId: ID }, doEstoque).conflito);
  });

  it("sem a unidade do item, não envia enquanto a lista carrega; fora da lista, a API confere (revisão leva 13)", () => {
    const carregando = unidadeDaLinha({ unidade: "cx", estoqueId: ID }, null);
    assert.equal(carregando.desconhecida, "carregando");
    assert.equal(problemaDaUnidade(carregando), "aguarde a unidade do item do estoque carregar e salve de novo.");
    const fora = unidadeDaLinha({ unidade: "cx", estoqueId: "22222222-2222-4222-8222-222222222222" }, doEstoque);
    assert.equal(fora.desconhecida, "fora_da_lista");
    assert.equal(problemaDaUnidade(fora), null);
  });

  it("a recusa da API aparece na linha certa, pelo índice no envio", () => {
    const porCampo = { "itens.1.unidade": "A linha “Cabo” está em cx, mas o item EST-0001 do estoque é controlado em m." };
    // Enviadas as linhas de chave 3 e 7 (a 5 estava vazia): o índice 1 é a de chave 7.
    assert.equal(erroDaLinha(porCampo, [3, 7], 7), porCampo["itens.1.unidade"]);
    assert.equal(erroDaLinha(porCampo, [3, 7], 3), null);
    assert.equal(erroDaLinha(porCampo, [3, 7], 5), null);
    assert.equal(erroDaLinha(undefined, [3, 7], 7), null);
  });

  it("corrigir troca para a unidade do item e pede a quantidade de novo", () => {
    assert.deepEqual(corrigirParaAUnidadeDoItem({ doItem: "m" }), { unidade: "m", quantidade: "" });
  });

  it("ao vincular, só adota a unidade do item quando ainda não há quantidade", () => {
    assert.deepEqual(unidadeAoVincular({ quantidade: "" }, { unidade: "m" }), { unidade: "m" });
    assert.deepEqual(unidadeAoVincular({ quantidade: "4" }, { unidade: "m" }), {});
  });

  it("editar só o título de um pedido antigo com 4 cx ligadas a item em m não envia os itens", () => {
    const pedido = {
      empresa: "plugga", titulo: "Antigo", descricao: null, destino: { tipo: "interno", obra: null, cliente: null },
      itens: [{ descricao: "Cabo", quantidade: "4.000", unidade: "cx", itemDeEstoque: { id: ID } }],
      prazoEntregaDesejado: "2026-12-10", valorOrcado: null, responsavel: null,
    } as unknown as Parameters<typeof camposDoPedidoAlterados>[0];
    // O formulário envia a unidade da própria linha (unidadeParaEnviar), não a do item.
    const linha = { descricao: "Cabo", quantidade: "4", unidade: "cx", estoqueId: ID };
    assert.equal(unidadeParaEnviar(linha), "cx");
    assert.equal(unidadeParaEnviar({ unidade: "  " }), null);
    // O recorte é o do contrato (só espaços ASCII): NBSP fica, e a linha conflita com "m" dos dois lados (revisão leva 15).
    const nbsp = String.fromCharCode(0xa0) + "m";
    assert.equal(unidadeParaEnviar({ unidade: nbsp }), nbsp);
    assert.ok(unidadeDaLinha({ unidade: nbsp, estoqueId: ID }, doEstoque).conflito);
    assert.equal(unidadeParaEnviar({ unidade: String.fromCharCode(11) + "m" + String.fromCharCode(13) }), "m");
    const corpo = {
      empresa: "plugga", titulo: "Antigo revisto", descricao: null, destino: "interno", obraId: null, clientId: null,
      itens: [{ descricao: linha.descricao, quantidade: linha.quantidade, unidade: unidadeParaEnviar(linha), itemDeEstoqueId: linha.estoqueId }],
      prazoEntregaDesejado: "2026-12-10", valorOrcado: null, responsavelId: null,
    };
    assert.deepEqual(Object.keys(camposDoPedidoAlterados(pedido, corpo, true)), ["titulo"]);
  });
});
