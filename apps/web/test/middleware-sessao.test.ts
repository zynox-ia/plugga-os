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

/** O redirect para a página inicial (sem acesso à página, ou já logado no /login). */
function vaiAoInicio(resposta: NextResponse): boolean {
  const local = resposta.headers.get("location");
  return local !== null && new URL(local).pathname === "/";
}

type Portao = { NODE_ENV: string; NEXT_PUBLIC_FINANCEIRO_HABILITADO: string | undefined };
/** Portão fechado: produção, com a variável desligada ou ausente. */
const FECHADOS: readonly Portao[] = [
  { NODE_ENV: "production", NEXT_PUBLIC_FINANCEIRO_HABILITADO: undefined },
  { NODE_ENV: "production", NEXT_PUBLIC_FINANCEIRO_HABILITADO: "false" },
];
/** Portão aberto: desenvolvimento, ou produção com a variável (a CI liga `true`). */
const ABERTOS: readonly Portao[] = [
  { NODE_ENV: "development", NEXT_PUBLIC_FINANCEIRO_HABILITADO: undefined },
  { NODE_ENV: "production", NEXT_PUBLIC_FINANCEIRO_HABILITADO: "true" },
];

/**
 * O portão do Financeiro lê o NODE_ENV e a NEXT_PUBLIC_FINANCEIRO_HABILITADO
 * (lib/recursos.ts): cada cenário fixa as duas e as devolve, sem depender do
 * ambiente em que o teste roda (a CI liga a variável).
 */
async function comPortao<T>(portao: Portao, fazer: () => Promise<T>): Promise<T> {
  const ambiente = process.env as Record<string, string | undefined>;
  const anteriores = { NODE_ENV: ambiente.NODE_ENV, NEXT_PUBLIC_FINANCEIRO_HABILITADO: ambiente.NEXT_PUBLIC_FINANCEIRO_HABILITADO };
  const fixar = (valores: Record<string, string | undefined>) => {
    for (const [chave, valor] of Object.entries(valores)) {
      if (valor === undefined) delete ambiente[chave];
      else ambiente[chave] = valor;
    }
  };
  fixar(portao);
  try {
    return await fazer();
  } finally {
    fixar(anteriores);
  }
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

  it("o aviso leva a query da página e o destino completo no cabeçalho interno, mesmo com um ?de= na página (PLU-357)", async () => {
    apiResponde(new Response(null, { status: 503 }));
    const pedida = `${FICHA}&de=%2Fadministracao`;
    const resposta = await middleware(pedir(pedida));
    const reescrita = new URL(resposta.headers.get("x-middleware-rewrite")!);
    assert.equal(`${reescrita.pathname}${reescrita.search}`, `/indisponivel${new URL(pedida, "http://x").search}`);
    // O aviso volta por aqui, não pelo ?de= da página.
    assert.equal(resposta.headers.get("x-middleware-request-x-plugga-caminho"), pedida);
  });

  it("um x-plugga-caminho vindo do navegador não chega à página: o middleware sobrescreve", async () => {
    apiResponde(Response.json(USUARIO));
    const pedido = new CriarRequest("http://localhost:3000/indisponivel?de=%2Fclientes", { headers: { cookie: "sessao=abc", "x-plugga-caminho": "/administracao" } });
    assert.equal((await middleware(pedido)).headers.get("x-middleware-request-x-plugga-caminho"), "/indisponivel?de=%2Fclientes");
  });

  it("quando a API volta, a mesma página abre sem novo login", async () => {
    apiResponde(new Response(null, { status: 503 }));
    const aviso = await middleware(pedir(FICHA));
    assert.deepEqual(resultado(aviso), { tipo: "aviso" });
    // A query da página vai junto no rewrite (o aviso reescrito não muda o endereço).
    assert.equal(new URL(aviso.headers.get("x-middleware-rewrite")!).search, new URL(FICHA, "http://x").search);
    apiResponde(Response.json(USUARIO));
    assert.deepEqual(resultado(await middleware(pedir(FICHA))), { tipo: "seguir" });
  });
});

describe("middleware: Financeiro fechado responde 404 (PLU-336)", () => {
  const SEM_FINANCEIRO = sessionUserSchema.parse({ ...USUARIO, acesso: { plataforma: null, departamentos: [{ departamento: "suprimentos", nivel: "membro" }] } });

  it("logado, com o portão fechado: segue até o layout do Financeiro, que responde 404, em vez de ir ao início", async () => {
    for (const portao of FECHADOS) {
      await comPortao(portao, async () => {
        for (const [usuario, caminho] of [[USUARIO, "/financeiro/lancamentos"], [USUARIO, "/financeiro"], [SEM_FINANCEIRO, "/financeiro/conciliacao"]] as const) {
          apiResponde(Response.json(usuario));
          const resposta = await middleware(pedir(caminho));
          const cenario = `${caminho} ${JSON.stringify(portao)}`;
          assert.equal(vaiAoInicio(resposta), false, cenario);
          assert.deepEqual(resultado(resposta), { tipo: "seguir" }, cenario);
        }
      });
    }
  });

  it("sem sessão, com o portão fechado, continua indo ao login", async () => {
    for (const portao of FECHADOS) {
      await comPortao(portao, async () => {
        apiResponde(new Response(null, { status: 401 }));
        assert.deepEqual(resultado(await middleware(pedir("/financeiro/lancamentos"))), { tipo: "login", redirectTo: "/financeiro/lancamentos" }, JSON.stringify(portao));
      });
    }
  });

  it("com o portão aberto, quem não tem acesso ao Financeiro continua indo ao início", async () => {
    for (const portao of ABERTOS) {
      await comPortao(portao, async () => {
        apiResponde(Response.json(SEM_FINANCEIRO));
        assert.equal(vaiAoInicio(await middleware(pedir("/financeiro/lancamentos"))), true, JSON.stringify(portao));
        apiResponde(Response.json(USUARIO));
        assert.deepEqual(resultado(await middleware(pedir("/financeiro/lancamentos"))), { tipo: "seguir" }, JSON.stringify(portao));
      });
    }
  });

  it("o portão fechado não abre outras páginas sem acesso", async () => {
    for (const portao of FECHADOS) {
      await comPortao(portao, async () => {
        apiResponde(Response.json(SEM_FINANCEIRO));
        assert.equal(vaiAoInicio(await middleware(pedir("/clientes"))), true, JSON.stringify(portao));
      });
    }
  });

  it("cada cenário devolve o ambiente como estava", async () => {
    const antes = { NODE_ENV: process.env.NODE_ENV, flag: process.env.NEXT_PUBLIC_FINANCEIRO_HABILITADO };
    await comPortao(FECHADOS[0]!, async () => {});
    await comPortao(ABERTOS[1]!, async () => { throw new Error("falha no meio"); }).catch(() => {});
    assert.deepEqual({ NODE_ENV: process.env.NODE_ENV, flag: process.env.NEXT_PUBLIC_FINANCEIRO_HABILITADO }, antes);
  });
});
