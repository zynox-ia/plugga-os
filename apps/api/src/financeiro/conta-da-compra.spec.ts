import { etapasDaContaDoPedido, etapasDoTipo } from "@plugga/shared";
import { describe, expect, it } from "vitest";

describe("a conta a pagar do pedido no contrato de Compras (W3)", () => {
  it("as etapas declaradas em Compras são exatamente as da saída no Financeiro", () => {
    // Compras não importa o contrato do Financeiro (ciclo de módulos); este teste os mantém iguais.
    expect([...etapasDaContaDoPedido].sort()).toEqual([...etapasDoTipo.saida].sort());
  });
});
