import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { afterEach, before, describe, it } from "node:test";

import { sessionUserSchema } from "@plugga/shared";
import type { NextRequest, NextResponse } from "next/server";

/**
 * O middleware.ts de verdade (PLU-343), não só as funções que ele compõe: o
 * switch final é que decide entre rewrite para o aviso, redirect ao login e
 * seguir. O Next resolve `next/server` e os imports sem extensão do
 * middleware; o `node --test`, não. Este hook ensina só isso, só neste teste,
 * sem mexer nos imports de produção.
 */
registerHooks({
  resolve(especificador, contexto, proximo) {
    if (especificador === "next/server") return proximo("next/server.js", contexto);
    if (contexto.parentURL?.endsWith("/middleware.ts") && especificador.startsWith("./app/lib/") && !especificador.endsWith(".ts")) {
      return proximo(`${especificador}.ts`, contexto);
    }
    return proximo(especificador, contexto);
  },
});

const USUARIO = sessionUserSchema.parse({
  id: "11111111-1111-4111-8111-111111111111",
  email: "pessoa@plugga.local",
  name: "Pessoa (sintético)",
  status: "active",
  acesso: { plataforma: "admin", departamentos: [] },
});

const FICHA = "/suprimentos/fornecedores?fornecedor=22222222-2222-4222-8222-222222222222";

let middleware: (request: NextRequest) => Promise<NextResponse>;
let CriarRequest: typeof NextRequest;
const fetchOriginal = globalThis.fetch;

before(async () => {
  ({ middleware } = await import("../middleware.ts"));
  ({ NextRequest: CriarRequest } = await import("next/server"));
});

afterEach(() => {
  globalThis.fetch = fetchOriginal;
});

/** A API responde (ou falha) assim em GET /auth/me. */
function apiResponde(resposta: Response | Error): void {
  // O tempo esgotado de verdade (AbortSignal.timeout de 15 s) fica em sessao-do-middleware.test.ts, com 20 ms.
  globalThis.fetch = (async () => {
    if (resposta instanceof Error) throw resposta;
    return resposta;
  }) as typeof fetch;
}

function pedir(caminho: string): NextRequest {
  return new CriarRequest(`http://localhost:3000${caminho}`, { headers: { cookie: "sessao=abc" } });
}

/** O que a pessoa vê: o aviso no mesmo endereço, o login (com o destino) ou a página. */
function resultado(resposta: NextResponse): { tipo: "aviso" | "login" | "seguir" | "outro"; redirectTo?: string | null } {
  const reescrita = resposta.headers.get("x-middleware-rewrite");
  if (reescrita) {
    assert.equal(new URL(reescrita).pathname, "/indisponivel");
    assert.equal(resposta.headers.get("Cache-Control"), "no-store");
    return { tipo: "aviso" };
  }
  const local = resposta.headers.get("location");
  if (local) {
    const url = new URL(local);
    return url.pathname === "/login" ? { tipo: "login", redirectTo: url.searchParams.get("redirectTo") } : { tipo: "outro" };
  }
  return resposta.headers.get("x-middleware-next") ? { tipo: "seguir" } : { tipo: "outro" };
}

describe("middleware: API fora do ar não desloga (PLU-343)", () => {
  it("200 com a sessão: abre a página", async () => {
    apiResponde(Response.json(USUARIO));
    assert.deepEqual(resultado(await middleware(pedir(FICHA))), { tipo: "seguir" });
  });

  it("401 e 403: login, guardando o destino com a query", async () => {
    for (const status of [401, 403]) {
      apiResponde(new Response(null, { status }));
      assert.deepEqual(resultado(await middleware(pedir(FICHA))), { tipo: "login", redirectTo: FICHA }, String(status));
    }
  });

  it("503 e 500: aviso no mesmo endereço, sem redirecionar", async () => {
    for (const status of [503, 500]) {
      apiResponde(new Response(null, { status }));
      const resposta = await middleware(pedir(FICHA));
      assert.deepEqual(resultado(resposta), { tipo: "aviso" }, String(status));
      assert.equal(resposta.headers.get("location"), null);
    }
  });

  it("conexão recusada: aviso, não login", async () => {
    apiResponde(Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:3002"), { code: "ECONNREFUSED" }) }));
    assert.deepEqual(resultado(await middleware(pedir(FICHA))), { tipo: "aviso" });
  });

  it("tempo esgotado: aviso, não login", async () => {
    apiResponde(new DOMException("The operation was aborted due to timeout", "TimeoutError") as unknown as Error);
    assert.deepEqual(resultado(await middleware(pedir(FICHA))), { tipo: "aviso" });
  });

  it("quando a API volta, a mesma página abre sem novo login", async () => {
    apiResponde(new Response(null, { status: 503 }));
    assert.deepEqual(resultado(await middleware(pedir(FICHA))), { tipo: "aviso" });
    apiResponde(Response.json(USUARIO));
    assert.deepEqual(resultado(await middleware(pedir(FICHA))), { tipo: "seguir" });
  });
});
