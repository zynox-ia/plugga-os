import assert from "node:assert/strict";
import { test } from "node:test";

import { agruparOpcoes } from "../app/lib/agrupar-opcoes.ts";

test("opções sem grupo formam um bloco só, sem rótulo (Estoque e Compras não mudam)", () => {
  const planas: { v: number; grupo?: string }[] = [{ v: 1 }, { v: 2 }];
  assert.deepEqual(agruparOpcoes(planas), [{ grupo: undefined, opcoes: [{ v: 1 }, { v: 2 }] }]);
  assert.deepEqual(agruparOpcoes([]), []);
});

test("agrupa as seguidas com o mesmo grupo e mantém a ordem (filtro de Situação do Financeiro)", () => {
  const grupos = agruparOpcoes([
    { v: "", grupo: undefined },
    { v: "pagar", grupo: "A pagar" },
    { v: "pagar-aberto", grupo: "A pagar" },
    { v: "receber", grupo: "A receber" },
    { v: "erro", grupo: "Atenção" },
  ]);
  assert.deepEqual(grupos.map((g) => [g.grupo, g.opcoes.map((o) => o.v)]), [
    [undefined, [""]],
    ["A pagar", ["pagar", "pagar-aberto"]],
    ["A receber", ["receber"]],
    ["Atenção", ["erro"]],
  ]);
});

test("com a busca filtrando, o grupo que ficou sem opção não aparece", () => {
  const filtradas = [{ v: "pagar-vencido", grupo: "A pagar" }, { v: "receber-vencido", grupo: "A receber" }];
  assert.deepEqual(agruparOpcoes(filtradas).map((g) => g.grupo), ["A pagar", "A receber"]);
});
