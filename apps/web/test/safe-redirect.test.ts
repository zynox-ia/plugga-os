import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { safeRedirect, safeRelativePath } from "../app/lib/safe-redirect.ts";

describe("safeRelativePath", () => {
  it("accepts an in-app path, with query and fragment", () => {
    assert.equal(safeRelativePath("/clientes"), "/clientes");
    assert.equal(safeRelativePath("/comercial/pipelines?mes=8"), "/comercial/pipelines?mes=8");
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

  it("rejects a path that only becomes protocol-relative after normalization (PLU-357)", () => {
    // Passam na entrada (começam com uma barra só), mas o `URL` os resolve para `//evil.example`.
    for (const valor of ["/.//evil.example", "/x/..//evil.example", "/..//evil.example", "/%2e%2e//evil.example", "/.%2e//evil.example/clientes?x=1#y"]) {
      assert.equal(safeRelativePath(valor), null, valor);
    }
    // A barra invertida no meio, que o parser WHATWG troca por "/".
    for (const valor of ["/.\\/evil.example", "/x/..\\\\evil.example", "/a/../\\evil.example", "/.\\\\evil.example"]) {
      assert.equal(safeRelativePath(valor), null, valor);
    }
    assert.equal(safeRedirect("/.//evil.example"), "/");
  });

  it("keeps an encoded slash encoded: it does not become `//`", () => {
    assert.equal(safeRelativePath("/%2F/evil.example"), "/%2F/evil.example");
    assert.equal(safeRelativePath("/%2f%2fevil.example"), "/%2f%2fevil.example");
    assert.equal(safeRelativePath("/%5C/evil.example"), "/%5C/evil.example");
  });

  it("still accepts in-app paths that normalize to a single leading slash", () => {
    assert.equal(safeRelativePath("/./clientes?mes=8#topo"), "/clientes?mes=8#topo");
    assert.equal(safeRelativePath("/x/../suprimentos/fornecedores?fornecedor=1"), "/suprimentos/fornecedores?fornecedor=1");
    assert.equal(safeRelativePath("/comercial//pipelines"), "/comercial//pipelines");
  });

  it("rejects empty and missing values", () => {
    assert.equal(safeRelativePath(""), null);
    assert.equal(safeRelativePath(undefined), null);
    assert.equal(safeRelativePath(null), null);
    assert.equal(safeRelativePath("clientes"), null);
  });

  it("rejects a repeated search param, which arrives as an array", () => {
    assert.equal(safeRelativePath(["/clientes", "/documentos"] as unknown as string), null);
  });
});

describe("safeRedirect", () => {
  it("falls back to the root instead of refusing to navigate", () => {
    assert.equal(safeRedirect("//evil.example.com"), "/");
    assert.equal(safeRedirect(undefined), "/");
    assert.equal(safeRedirect("/clientes"), "/clientes");
  });
});
