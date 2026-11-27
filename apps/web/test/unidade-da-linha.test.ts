import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { unidadeDaLinha } from "../app/lib/unidade-da-linha.ts";

const ID = "11111111-1111-4111-8111-111111111111";

describe("Compras: unidade da linha vinculada ao estoque (PLU-328)", () => {
  it("linha sem vínculo tem unidade livre", () => {
    assert.deepEqual(unidadeDaLinha({ unidade: "cx", estoqueId: null }, [{ id: ID, unidade: "m" }]), { unidade: "cx", travada: false, dica: null });
  });

  it("vinculada, usa a unidade do item e trava o campo", () => {
    assert.deepEqual(unidadeDaLinha({ unidade: "cx", estoqueId: ID }, [{ id: ID, unidade: "m" }]), {
      unidade: "m", travada: true, dica: "Na unidade do item do estoque (m). Desvincule para mudar.",
    });
  });

  it("enquanto a lista do estoque não chega, mantém a unidade da linha travada", () => {
    assert.equal(unidadeDaLinha({ unidade: "m", estoqueId: ID }, null).unidade, "m");
    assert.equal(unidadeDaLinha({ unidade: "m", estoqueId: ID }, null).travada, true);
  });
});
