import assert from "node:assert/strict";
import { it } from "node:test";

import { calcularLayoutKanban } from "../app/lib/layout-kanban.ts";

it("encaixa cinco etapas compactas inteiras sem alargar os cartões", () => {
  assert.deepEqual(calcularLayoutKanban(1464, 5), { larguraColuna: 280, larguraQuadro: 1464 });
});

it("só acrescenta a próxima coluna quando ela cabe com o espaçamento", () => {
  assert.deepEqual(calcularLayoutKanban(575, 5), { larguraColuna: 320, larguraQuadro: 320 });
  assert.deepEqual(calcularLayoutKanban(576, 5), { larguraColuna: 280, larguraQuadro: 576 });
});

it("respeita o teto quando há poucas etapas em uma tela larga", () => {
  assert.deepEqual(calcularLayoutKanban(1920, 2), { larguraColuna: 320, larguraQuadro: 656 });
});

it("adapta uma coluna ao celular, inclusive abaixo do mínimo preferido", () => {
  assert.deepEqual(calcularLayoutKanban(240, 5), { larguraColuna: 240, larguraQuadro: 240 });
  assert.deepEqual(calcularLayoutKanban(375, 5), { larguraColuna: 320, larguraQuadro: 320 });
});

it("não corta colunas ao variar a largura e a quantidade de etapas", () => {
  for (const etapas of [1, 2, 5, 12]) {
    for (let disponivel = 200; disponivel <= 3000; disponivel++) {
      const { larguraColuna, larguraQuadro } = calcularLayoutKanban(disponivel, etapas);
      const visiveis = (larguraQuadro + 16) / (larguraColuna + 16);
      assert.ok(Math.abs(visiveis - Math.round(visiveis)) < 0.000001);
      assert.ok(visiveis <= etapas + 0.000001);
      assert.ok(larguraQuadro <= disponivel + 0.000001);
      assert.ok(larguraColuna >= Math.min(280, disponivel) && larguraColuna <= 320);
    }
  }
});
