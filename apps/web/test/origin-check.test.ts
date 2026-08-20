import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { isOriginAllowed } from "../app/lib/origin-check.ts";

/**
 * VULN-6 (auditoria zero-trust): esta função vivia duplicada em cinco
 * arquivos (`api-proxy.ts`, `auth-proxy.ts`, `commercial-proxy.ts`,
 * `compras-proxy.ts`, `energy-proxy.ts`); agora é uma fonte única, e este é o
 * primeiro teste dedicado a ela — antes só era exercitada indiretamente pelos
 * testes de cada proxy.
 */
describe("isOriginAllowed", () => {
  const originalEnv = process.env.AUTH_ALLOWED_ORIGINS;

  beforeEach(() => {
    delete process.env.AUTH_ALLOWED_ORIGINS;
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.AUTH_ALLOWED_ORIGINS;
    else process.env.AUTH_ALLOWED_ORIGINS = originalEnv;
  });

  function requestWithOrigin(origin: string | null): Request {
    const headers = new Headers();
    if (origin !== null) headers.set("origin", origin);
    return new Request("http://127.0.0.1:3000/api/clientes", { headers });
  }

  it("allows a request with no Origin header (same-origin navigation, server-to-server)", () => {
    assert.equal(isOriginAllowed(requestWithOrigin(null)), true);
  });

  it("without AUTH_ALLOWED_ORIGINS, allows localhost/127.0.0.1 origins", () => {
    assert.equal(isOriginAllowed(requestWithOrigin("http://localhost:3000")), true);
    assert.equal(isOriginAllowed(requestWithOrigin("http://127.0.0.1:3000")), true);
  });

  it("without AUTH_ALLOWED_ORIGINS, rejects any other origin", () => {
    assert.equal(isOriginAllowed(requestWithOrigin("https://evil.example.com")), false);
    assert.equal(isOriginAllowed(requestWithOrigin("https://plugga.app.br")), false);
  });

  it("with AUTH_ALLOWED_ORIGINS configured, only exact matches pass — including localhost", () => {
    process.env.AUTH_ALLOWED_ORIGINS = "https://os.plugga.app.br,https://staging.plugga.app.br";
    assert.equal(isOriginAllowed(requestWithOrigin("https://os.plugga.app.br")), true);
    assert.equal(isOriginAllowed(requestWithOrigin("https://staging.plugga.app.br")), true);
    assert.equal(isOriginAllowed(requestWithOrigin("http://localhost:3000")), false);
    assert.equal(isOriginAllowed(requestWithOrigin("https://evil.example.com")), false);
  });

  it("rejects a malformed Origin header instead of throwing", () => {
    assert.equal(isOriginAllowed(requestWithOrigin("not-a-url")), false);
  });
});
