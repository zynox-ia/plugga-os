import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { verifica } from "./tamanho-componentes.mjs";

const config = { limite: 600, excecoes: { "a.tsx": 700 } };

describe("tamanho-componentes", () => {
  it("aceita arquivo dentro do limite e exceção dentro do teto", () => {
    assert.deepEqual(verifica([{ caminho: "b.tsx", linhas: 600 }, { caminho: "a.tsx", linhas: 700 }], config), []);
  });
  it("recusa arquivo novo acima do limite", () => {
    assert.equal(verifica([{ caminho: "b.tsx", linhas: 601 }], config).length, 1);
  });
  it("recusa exceção que cresceu", () => {
    assert.equal(verifica([{ caminho: "a.tsx", linhas: 701 }], config).length, 1);
  });
});
