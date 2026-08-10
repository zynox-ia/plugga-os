import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { safeRedirect, safeRelativePath } from "../app/lib/safe-redirect.ts";

describe("safeRelativePath", () => {
  it("accepts an in-app path, with query and fragment", () => {
    assert.equal(safeRelativePath("/clientes"), "/clientes");
    assert.equal(safeRelativePath("/energia-opm/ciclos?mes=8"), "/energia-opm/ciclos?mes=8");
    assert.equal(safeRelativePath("/documentos#topo"), "/documentos#topo");
  });

  it("rejects a protocol-relative URL", () => {
    // `//evil.example.com` parece caminho e é outro site.
    assert.equal(safeRelativePath("//evil.example.com"), null);
    assert.equal(safeRelativePath("//evil.example.com/clientes"), null);
  });

  it("rejects the backslash variant browsers treat as a slash", () => {
    assert.equal(safeRelativePath("/\\evil.example.com"), null);
  });

  it("rejects an absolute URL, even to a plausible host", () => {
    assert.equal(safeRelativePath("https://os.plugga.app.br/clientes"), null);
    assert.equal(safeRelativePath("http://localhost:3000/clientes"), null);
    assert.equal(safeRelativePath("javascript:alert(1)"), null);
  });

  it("rejects control characters that would break a Location header", () => {
    assert.equal(safeRelativePath("/clientes\r\nSet-Cookie: a=b"), null);
    assert.equal(safeRelativePath("/clientes\u0000"), null);
  });

  it("rejects empty and missing values", () => {
    assert.equal(safeRelativePath(""), null);
    assert.equal(safeRelativePath(undefined), null);
    assert.equal(safeRelativePath(null), null);
    assert.equal(safeRelativePath("clientes"), null);
  });
});

describe("safeRedirect", () => {
  it("falls back to the root instead of refusing to navigate", () => {
    assert.equal(safeRedirect("//evil.example.com"), "/");
    assert.equal(safeRedirect(undefined), "/");
    assert.equal(safeRedirect("/clientes"), "/clientes");
  });
});
