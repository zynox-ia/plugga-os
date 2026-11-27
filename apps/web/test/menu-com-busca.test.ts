import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { avisoDeListaVazia, filtrarOpcoes, opcaoNoTab, temBusca } from "../app/lib/menu-com-busca.ts";

const OBRAS = [
  { value: "1", label: "Subestação Norte", description: "Hotel Rio Negro (sintético)" },
  { value: "2", label: "Usina do galpão", description: "Mercado Açaí (sintético)" },
  { value: "3", label: "Obra sem cliente" },
];

describe("menu com busca: quando a busca existe", () => {
  it("sem pedir, só acima de 8 opções, como antes", () => {
    assert.equal(temBusca(8), false);
    assert.equal(temBusca(9), true);
  });

  it("pedindo sempre, também com uma ou nenhuma opção: o foco tem para onde ir (PLU-355)", () => {
    assert.equal(temBusca(1, true), true);
    assert.equal(temBusca(0, true), true);
  });
});

describe("menu com busca: o que a busca encontra", () => {
  it("pelo nome ou pela linha secundária, sem diferenciar acento nem caixa", () => {
    assert.deepEqual(filtrarOpcoes(OBRAS, "rio negro").map((o) => o.value), ["1"]);
    assert.deepEqual(filtrarOpcoes(OBRAS, "  ACAI ").map((o) => o.value), ["2"]);
    assert.deepEqual(filtrarOpcoes(OBRAS, "subestacao").map((o) => o.value), ["1"]);
    assert.deepEqual(filtrarOpcoes(OBRAS, "nada disso"), []);
    assert.equal(filtrarOpcoes(OBRAS, "").length, 3);
  });

  it("lista vazia diz se não há opção ou se a busca não achou", () => {
    assert.equal(avisoDeListaVazia(3, 1), null);
    assert.equal(avisoDeListaVazia(3, 0), "Nenhuma opção encontrada.");
    assert.equal(avisoDeListaVazia(0, 0), "Nenhuma opção disponível.");
  });
});

describe("menu com busca: a opção que o Tab alcança", () => {
  it("a focada, depois a marcada, depois a primeira", () => {
    assert.equal(opcaoNoTab(OBRAS, "3", "2"), "3");
    assert.equal(opcaoNoTab(OBRAS, undefined, "2"), "2");
    assert.equal(opcaoNoTab(OBRAS, undefined, ""), "1");
  });

  it("a que saiu da busca ou está desabilitada não conta; sem opção, nenhuma", () => {
    assert.equal(opcaoNoTab([OBRAS[1]!], "1", "3"), "2");
    assert.equal(opcaoNoTab([{ ...OBRAS[0]!, disabled: true }, OBRAS[1]!], "1", "1"), "2");
    assert.equal(opcaoNoTab([], "1", "1"), undefined);
  });
});
