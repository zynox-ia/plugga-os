import assert from "node:assert/strict";
import { it } from "node:test";

import { velocidadeNaBorda, moverCartao } from "../app/components/pipelines/arrasto-kanban.ts";

it("rola progressivamente nas bordas e mantém o centro parado", () => {
  assert.equal(velocidadeNaBorda(200, 100, 500), 0);
  assert.equal(velocidadeNaBorda(100, 100, 500), -720);
  assert.equal(velocidadeNaBorda(500, 100, 500), 720);
  assert.equal(velocidadeNaBorda(132, 100, 500), -360);
  assert.equal(velocidadeNaBorda(520, 100, 500), 720);
  assert.equal(velocidadeNaBorda(600, 100, 500), 0);
});

const entrada = "2026-11-01T12:00:00Z";
const agora = "2026-11-05T12:00:00Z";
const cartoes = [
  { id: "a", stageId: "origem", stageEnteredAt: entrada },
  { id: "b", stageId: "origem", stageEnteredAt: entrada },
  { id: "c", stageId: "destino", stageEnteredAt: entrada },
];

it("reordena na mesma etapa sem reiniciar o tempo nem modificar os dados de entrada", () => {
  const resultado = moverCartao(cartoes, "b", "origem", "a", agora);
  assert.deepEqual(resultado.map((n) => n.id), ["b", "a", "c"]);
  assert.equal(resultado[0]!.stageEnteredAt, entrada);
  assert.deepEqual(cartoes.map((n) => n.id), ["a", "b", "c"]);
});

it("referência omitida insere no topo e null insere no fim da etapa", () => {
  const topo = moverCartao(cartoes, "a", "destino", undefined, agora);
  const fim = moverCartao(cartoes, "a", "destino", null, agora);
  assert.deepEqual(topo.filter((n) => n.stageId === "destino").map((n) => n.id), ["a", "c"]);
  assert.deepEqual(fim.filter((n) => n.stageId === "destino").map((n) => n.id), ["c", "a"]);
  assert.equal(topo.find((n) => n.id === "a")!.stageEnteredAt, agora);
});

it("mover para uma coluna vazia não perde ou duplica cards", () => {
  const resultado = moverCartao(cartoes, "a", "vazia", null, agora);
  assert.equal(resultado.length, cartoes.length);
  assert.equal(new Set(resultado.map((n) => n.id)).size, cartoes.length);
  assert.deepEqual(resultado.filter((n) => n.stageId === "vazia").map((n) => n.id), ["a"]);
});

it("recusa restaura etapa, posição e data sem apagar outros dados atualizados", () => {
  const iniciais = cartoes.map((n) => ({ ...n, titulo: n.id }));
  const otimistas = moverCartao(iniciais, "a", "destino", null, agora)
    .map((n) => n.id === "a" ? { ...n, titulo: "Título atualizado" } : n);
  const restaurados = moverCartao(otimistas, "a", "origem", "b", entrada);
  assert.deepEqual(restaurados.map((n) => n.id), ["a", "b", "c"]);
  assert.deepEqual(restaurados[0], { ...iniciais[0], titulo: "Título atualizado" });
});

it("um card removido durante a operação não reaparece no rollback", () => {
  assert.deepEqual(moverCartao(cartoes.slice(1), "a", "origem", "b", entrada), cartoes.slice(1));
});
