import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { GOOGLE_COMPLETE_PATH, handleGoogleCallback } from "../app/lib/google-callback.ts";

const CREDENTIAL = "eyJhbGciOiJSUzI1NiJ9.fake.payload";
const CSRF = "csrf-from-gis";

interface Recorded {
  url: string;
  init: RequestInit;
}

/** Substitui só o `fetch` para a API — o resto do caminho é o código real. */
function stubUpstream(response: Response, recorded: Recorded[] = []): typeof fetch {
  return (async (url: string | URL | Request, init: RequestInit = {}) => {
    recorded.push({ url: String(url), init });
    return response;
  }) as unknown as typeof fetch;
}

/** `X-Forwarded-For` da única chamada registrada, exigindo que ela exista. */
function forwardedHeader(recorded: Recorded[]): string | undefined {
  const primeira = recorded[0];
  assert.ok(primeira, "a API deveria ter sido chamada");
  return (primeira.init.headers as Record<string, string>)["x-forwarded-for"];
}

function googlePost(body?: string, headers: Record<string, string> = {}): Request {
  const raw =
    body ??
    new URLSearchParams({
      credential: CREDENTIAL,
      g_csrf_token: CSRF,
      select_by: "btn",
    }).toString();
  return new Request("http://localhost:3000/api/auth/google/callback", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      // O Google posta de outra origem; bloquear por Origin mataria o fluxo.
      origin: "https://accounts.google.com",
      cookie: `g_csrf_token=${CSRF}`,
      ...headers,
    },
    body: raw,
  });
}

afterEach(() => {
  delete process.env.WEB_TRUST_PROXY;
});

describe("handleGoogleCallback", () => {
  it("forwards the raw form and the cookie, then redirects with the session cookie", async () => {
    const recorded: Recorded[] = [];
    const upstream = new Response(JSON.stringify({ user: { id: "u1" } }), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "set-cookie": "plugga_session=abc; Path=/; HttpOnly; SameSite=Lax",
      },
    });

    const response = await handleGoogleCallback(googlePost(), {
      fetchImpl: stubUpstream(upstream, recorded),
    });

    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), GOOGLE_COMPLETE_PATH);
    assert.equal(response.headers.get("cache-control"), "no-store");
    // O cookie de sessão sai sob a NOSSA origem: o browser nunca fala com a API.
    assert.ok(response.headers.getSetCookie().some((c) => c.startsWith("plugga_session=")));

    assert.equal(recorded.length, 1);
    const chamada = recorded[0];
    assert.ok(chamada);
    assert.ok(chamada.url.endsWith("/auth/google"));
    assert.equal(chamada.init.method, "POST");
    const headers = chamada.init.headers as Record<string, string>;
    assert.equal(headers["content-type"], "application/x-www-form-urlencoded");
    assert.equal(headers.cookie, `g_csrf_token=${CSRF}`);
    // Encaminhado como veio, inclusive o campo que só o Google entende.
    assert.ok(String(chamada.init.body).includes("select_by=btn"));
  });

  it("relays every Set-Cookie the API sent, not just the first", async () => {
    const upstream = new Response("{}", { status: 200 });
    upstream.headers.append("set-cookie", "plugga_session=abc; Path=/");
    upstream.headers.append("set-cookie", "g_csrf_token=; Max-Age=0; Path=/");

    const response = await handleGoogleCallback(googlePost(), {
      fetchImpl: stubUpstream(upstream),
    });

    assert.equal(response.headers.getSetCookie().length, 2);
  });

  it("turns an API refusal into a login redirect carrying only the public code", async () => {
    const upstream = new Response(JSON.stringify({ message: "google login refused", code: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });

    const response = await handleGoogleCallback(googlePost(), {
      fetchImpl: stubUpstream(upstream),
    });

    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), "/login?googleError=unauthorized");
    assert.equal(response.headers.getSetCookie().length, 0);
  });

  it("maps the remaining refusals to their own public codes", async () => {
    const casos: Array<[number, string, string]> = [
      [429, "", "rate_limited"],
      [503, "unavailable", "unavailable"],
      [403, "disabled", "disabled"],
      [502, "", "unavailable"],
    ];

    for (const [status, code, esperado] of casos) {
      const body = code ? JSON.stringify({ code }) : "gateway error";
      const upstream = new Response(body, {
        status,
        headers: { "content-type": code ? "application/json" : "text/plain" },
      });
      const response = await handleGoogleCallback(googlePost(), {
        fetchImpl: stubUpstream(upstream),
      });
      assert.equal(response.headers.get("location"), `/login?googleError=${esperado}`);
    }
  });

  it("ignores an unknown code the upstream might invent", async () => {
    // A query da tela de login é enumerada: um código novo vira o genérico em
    // vez de virar texto livre num parâmetro que o browser exibe.
    const upstream = new Response(JSON.stringify({ code: "conta-da-fulana-nao-existe" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });

    const response = await handleGoogleCallback(googlePost(), {
      fetchImpl: stubUpstream(upstream),
    });
    assert.equal(response.headers.get("location"), "/login?googleError=unauthorized");
  });

  it("refuses a body without credential or csrf without calling the API", async () => {
    const recorded: Recorded[] = [];
    const fetchImpl = stubUpstream(new Response("{}", { status: 200 }), recorded);

    for (const body of ["", "credential=x", `g_csrf_token=${CSRF}`, "select_by=btn"]) {
      const response = await handleGoogleCallback(googlePost(body), { fetchImpl });
      assert.equal(response.headers.get("location"), "/login?googleError=unauthorized");
    }
    assert.equal(recorded.length, 0);
  });

  it("drops an oversized body before parsing it", async () => {
    const recorded: Recorded[] = [];
    const enorme = new URLSearchParams({
      credential: "a".repeat(20_000),
      g_csrf_token: CSRF,
    }).toString();

    const response = await handleGoogleCallback(googlePost(enorme), {
      fetchImpl: stubUpstream(new Response("{}", { status: 200 }), recorded),
    });

    assert.equal(response.headers.get("location"), "/login?googleError=unauthorized");
    assert.equal(recorded.length, 0);
  });

  it("reports the API being unreachable as a temporary failure, not as a refusal", async () => {
    const fetchImpl = (async () => {
      throw new Error("connect ECONNREFUSED");
    }) as unknown as typeof fetch;

    const response = await handleGoogleCallback(googlePost(), { fetchImpl });
    assert.equal(response.headers.get("location"), "/login?googleError=unavailable");
  });

  it("only forwards the client IP when the app is behind a trusted proxy", async () => {
    const semConfianca: Recorded[] = [];
    await handleGoogleCallback(googlePost(undefined, { "x-forwarded-for": "203.0.113.7" }), {
      fetchImpl: stubUpstream(new Response("{}", { status: 200 }), semConfianca),
    });
    assert.equal(forwardedHeader(semConfianca), undefined);

    process.env.WEB_TRUST_PROXY = "true";
    const comConfianca: Recorded[] = [];
    await handleGoogleCallback(googlePost(undefined, { "x-forwarded-for": "203.0.113.7" }), {
      fetchImpl: stubUpstream(new Response("{}", { status: 200 }), comConfianca),
    });
    assert.equal(forwardedHeader(comConfianca), "203.0.113.7");
  });
});
