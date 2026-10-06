import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { proxyar, proxyAuthPut, proxyComprasPost } from "../app/lib/proxy.ts";

const ID = "00000000-0000-4000-8000-000000001001";
const originalFetch = globalThis.fetch;

type Chamada = { url: string; init: RequestInit };
let chamadas: Chamada[];

function simular(resposta: () => Response | Promise<Response>): void {
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    chamadas.push({ url: String(url), init: init ?? {} });
    return resposta();
  }) as typeof fetch;
}

function requisicao(corpo = "{}", cabecalhos: Record<string, string> = {}): Request {
  return new Request("http://localhost:3000/api/x", { method: "POST", body: corpo, headers: cabecalhos });
}

beforeEach(() => {
  chamadas = [];
  process.env.API_INTERNAL_URL = "http://api.test";
  delete process.env.AUTH_ALLOWED_ORIGINS;
  delete process.env.WEB_TRUST_PROXY;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.API_INTERNAL_URL;
});

describe("proxy genérico (T123/T124)", () => {
  for (const ruim of ["../..", "..%2F..", "%2F", "123", "x/y"]) {
    it(`recusa identificador ${JSON.stringify(ruim)} com 400 e sem chamar a API`, async () => {
      simular(() => Response.json({}));
      const r = await proxyAuthPut(requisicao(), "users/:id/access", { id: ruim });
      assert.equal(r.status, 400);
      assert.equal(chamadas.length, 0);
    });
  }

  it("monta o caminho com prefixo e repassa cookie, origin e corpo", async () => {
    simular(() => Response.json({ ok: true }));
    const r = await proxyAuthPut(
      requisicao('{"a":1}', { cookie: "sid=abc", origin: "http://localhost:3000" }),
      "users/:id/access",
      { id: ID },
    );
    assert.equal(r.status, 200);
    assert.equal(chamadas[0]?.url, `http://api.test/auth/users/${ID}/access`);
    assert.equal(chamadas[0]?.init.method, "PUT");
    assert.equal(chamadas[0]?.init.body, '{"a":1}');
    const cab = chamadas[0]?.init.headers as Record<string, string>;
    assert.equal(cab.cookie, "sid=abc");
    assert.equal(cab.origin, "http://localhost:3000");
  });

  it("repassa X-Forwarded-For só com WEB_TRUST_PROXY", async () => {
    simular(() => Response.json({}));
    await proxyar(requisicao("{}", { "x-forwarded-for": "203.0.113.7" }), { metodo: "POST", modelo: "x" });
    assert.equal((chamadas[0]?.init.headers as Record<string, string>)["x-forwarded-for"], undefined);

    process.env.WEB_TRUST_PROXY = "true";
    await proxyar(requisicao("{}", { "x-forwarded-for": "203.0.113.7" }), { metodo: "POST", modelo: "x" });
    assert.equal((chamadas[1]?.init.headers as Record<string, string>)["x-forwarded-for"], "203.0.113.7");
  });

  it("codifica a query de Compras", async () => {
    simular(() => Response.json({}));
    await proxyComprasPost(requisicao(), "pedidos/:id/triagem", { id: ID }, { companyId: "a&b" });
    assert.equal(chamadas[0]?.url, `http://api.test/compras/pedidos/${ID}/triagem?companyId=a%26b`);
  });

  it("recusa origem não permitida com 403, sem chamar a API", async () => {
    simular(() => Response.json({}));
    const r = await proxyar(requisicao("{}", { origin: "https://evil.example" }), { metodo: "POST", modelo: "x" });
    assert.equal(r.status, 403);
    assert.equal(chamadas.length, 0);
  });

  it("recusa JSON inválido com 400", async () => {
    simular(() => Response.json({}));
    const r = await proxyar(requisicao("{nao-e-json"), { metodo: "POST", modelo: "x" });
    assert.equal(r.status, 400);
    assert.equal(chamadas.length, 0);
  });

  it("devolve 503 quando a API não responde", async () => {
    simular(() => {
      throw new Error("ECONNREFUSED");
    });
    const r = await proxyar(requisicao(), { metodo: "POST", modelo: "x" });
    assert.equal(r.status, 503);
  });

  it("repassa status, corpo e Set-Cookie da API", async () => {
    simular(() => {
      const resposta = Response.json({ mensagem: "negado" }, { status: 403 });
      resposta.headers.append("set-cookie", "sid=; Max-Age=0");
      return resposta;
    });
    const r = await proxyar(requisicao(), { metodo: "POST", modelo: "x" });
    assert.equal(r.status, 403);
    assert.deepEqual(await r.json(), { mensagem: "negado" });
    assert.equal(r.headers.getSetCookie().length, 1);
  });
});
