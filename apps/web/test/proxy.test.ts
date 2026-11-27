import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { proxyar } from "../app/lib/proxy.ts";

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
      const r = await proxyar(requisicao(), { metodo: "PUT", modelo: "equipe/:id/acesso", ids: { id: ruim } });
      assert.equal(r.status, 400);
      assert.equal(chamadas.length, 0);
    });
  }

  it("monta o caminho com prefixo e repassa cookie, origin e corpo", async () => {
    simular(() => Response.json({ ok: true }));
    const r = await proxyar(requisicao('{"a":1}', { cookie: "sid=abc", origin: "http://localhost:3000" }), {
      metodo: "PUT",
      prefixo: "/auth",
      modelo: "teste/:id",
      ids: { id: ID },
    });
    assert.equal(r.status, 200);
    assert.equal(chamadas[0]?.url, `http://api.test/auth/teste/${ID}`);
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

  it("codifica a query", async () => {
    simular(() => Response.json({}));
    await proxyar(requisicao(), {
      metodo: "POST",
      modelo: "opportunities/:id/lose",
      ids: { id: ID },
      consulta: { companyId: "a&b" },
    });
    assert.equal(chamadas[0]?.url, `http://api.test/opportunities/${ID}/lose?companyId=a%26b`);
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

  it("preserva os bytes e os cabeçalhos de segurança de documentos", async () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x00, 0xff, 0x80]);
    simular(() => new Response(bytes, { headers: {
      "content-type": "application/pdf",
      "content-disposition": 'inline; filename="exemplo.pdf"',
      "content-security-policy": "sandbox",
      "x-content-type-options": "nosniff",
      "cache-control": "no-store",
    } }));
    const r = await proxyar(requisicao(), {
      metodo: "GET", modelo: "leads/:id/documentos", ids: { id: ID }, resposta: "arquivo",
    });
    assert.deepEqual(new Uint8Array(await r.arrayBuffer()), bytes);
    assert.equal(r.headers.get("content-type"), "application/pdf");
    assert.equal(r.headers.get("content-disposition"), 'inline; filename="exemplo.pdf"');
    assert.equal(r.headers.get("content-security-policy"), "sandbox");
    assert.equal(r.headers.get("x-content-type-options"), "nosniff");
    assert.equal(r.headers.get("cache-control"), "no-store");
  });
});

describe("portão do Financeiro no destino montado (PLU-336)", () => {
  /** Fixa NODE_ENV e a flag, e devolve como estavam. */
  async function comPortao(aberto: boolean, fazer: () => Promise<void>): Promise<void> {
    const ambiente = process.env as Record<string, string | undefined>;
    const anteriores = { NODE_ENV: ambiente.NODE_ENV, NEXT_PUBLIC_FINANCEIRO_HABILITADO: ambiente.NEXT_PUBLIC_FINANCEIRO_HABILITADO };
    ambiente.NODE_ENV = "production";
    if (aberto) ambiente.NEXT_PUBLIC_FINANCEIRO_HABILITADO = "true";
    else delete ambiente.NEXT_PUBLIC_FINANCEIRO_HABILITADO;
    try {
      await fazer();
    } finally {
      for (const [chave, valor] of Object.entries(anteriores)) {
        if (valor === undefined) delete ambiente[chave];
        else ambiente[chave] = valor;
      }
    }
  }

  it("fechado: o destino do Financeiro responde 404 antes da origem, do corpo e da API", async () => {
    await comPortao(false, async () => {
      simular(() => Response.json({}));
      // Sem origin (seria 403) e com corpo inválido (seria 400): o portão vem antes.
      for (const opcoes of [
        { metodo: "POST", modelo: "/tarefas/financeiro" },
        { metodo: "POST", modelo: "/tarefas/financeiro/:id/encerrar", ids: { id: ID } },
        { metodo: "POST", modelo: "/financeiro/conciliacao/conciliar" },
        { metodo: "GET", modelo: "financeiro/lancamentos" },
        { metodo: "PATCH", modelo: "/financeiro/categorias/:id", ids: { id: "../x" } },
        { metodo: "POST", prefixo: "", modelo: "/tarefas/Financeiro" },
      ] as const) {
        const r = await proxyar(requisicao("não é json"), opcoes);
        assert.equal(r.status, 404, opcoes.modelo);
        assert.deepEqual(await r.json(), { codigo: "NAO_ENCONTRADO", mensagem: "Não encontramos o que você procura.", message: "Não encontramos o que você procura." });
      }
      assert.equal(chamadas.length, 0);
    });
  });

  it("fechado: os outros destinos seguem; aberto: o Financeiro segue", async () => {
    await comPortao(false, async () => {
      simular(() => Response.json({ ok: true }));
      for (const modelo of ["/tarefas/engenharia-obras", "/financeiros", "/compras/pedidos"]) {
        assert.equal((await proxyar(requisicao(), { metodo: "GET", modelo })).status, 200, modelo);
      }
    });
    await comPortao(true, async () => {
      simular(() => Response.json({ ok: true }));
      assert.equal((await proxyar(requisicao(), { metodo: "GET", modelo: "/tarefas/financeiro" })).status, 200);
      assert.equal(chamadas.at(-1)?.url, "http://api.test/tarefas/financeiro");
    });
  });
});
