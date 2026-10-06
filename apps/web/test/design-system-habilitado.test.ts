import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { designSystemHabilitado } from "../app/lib/design-system-habilitado.ts";

describe("design-system fora de produção", () => {
  it("fica habilitado em desenvolvimento e teste, e bloqueado em produção", () => {
    assert.equal(designSystemHabilitado("development"), true);
    assert.equal(designSystemHabilitado("test"), true);
    assert.equal(designSystemHabilitado(undefined), true);
    assert.equal(designSystemHabilitado("production"), false);
  });

  it("o layout da rota usa a regra e responde 404", () => {
    const layout = readFileSync(new URL("../app/design-system/layout.tsx", import.meta.url), "utf8");
    assert.match(layout, /designSystemHabilitado\(process\.env\.NODE_ENV\)/);
    assert.match(layout, /notFound\(\)/);
  });
});
