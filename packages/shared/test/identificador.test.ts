import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ehIdentificador } from "../src/identificador.ts";

describe("ehIdentificador", () => {
  it("aceita id do banco fora da RFC 9562, como os fixos de dado sintético", () => {
    assert.equal(ehIdentificador("00000000-0000-0000-0000-0000000000c1"), true);
    assert.equal(ehIdentificador("0b7c1d0e-6a53-4c1f-9d57-3f4b2a9e8c11"), true);
  });

  it("recusa o que não é 8-4-4-4-12 hexadecimal", () => {
    assert.equal(ehIdentificador("../.."), false);
    assert.equal(ehIdentificador("%2F"), false);
    assert.equal(ehIdentificador("00000000-0000-0000-0000-0000000000cg"), false);
  });
});
