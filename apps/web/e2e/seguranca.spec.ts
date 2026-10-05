import { expect, test } from "@playwright/test";

/**
 * Não regressão ponta a ponta das defesas do web que a spec 002 manda preservar
 * (FR-080, constituição V): CSP com nonce por requisição, cabeçalhos de segurança
 * e o portão de sessão. Roda sem sessão, contra o servidor real, porque o que se
 * prova aqui é o que um visitante anônimo recebe.
 */
test.use({ storageState: { cookies: [], origins: [] } });

function nonceDe(csp: string): string {
  const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
  expect(nonce, `CSP sem nonce: ${csp}`).toBeTruthy();
  return nonce!;
}

test("a página de login sai com CSP de nonce e com os cabeçalhos de segurança", async ({ request }) => {
  const resposta = await request.get("/login", { maxRedirects: 0 });
  const h = resposta.headers();

  expect(resposta.status()).toBe(200);
  const csp = h["content-security-policy"] ?? "";
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("object-src 'none'");
  const scripts = csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("script-src ")) ?? "";
  expect(scripts).toContain("'strict-dynamic'");
  expect(scripts).not.toContain("'unsafe-inline'");
  nonceDe(csp);

  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["referrer-policy"]).toBe("no-referrer");
  expect(h["cross-origin-opener-policy"]).toBe("same-origin");
  expect(h["cross-origin-resource-policy"]).toBe("same-origin");
  expect(h["x-powered-by"]).toBeUndefined();
});

test("cada requisição recebe um nonce diferente, em página e em rota de API", async ({ request }) => {
  const nonces = new Set<string>();
  for (const caminho of ["/login", "/login", "/privacidade", "/api/rota-que-nao-existe"]) {
    const resposta = await request.get(caminho, { maxRedirects: 0 });
    nonces.add(nonceDe(resposta.headers()["content-security-policy"] ?? ""));
  }
  expect(nonces.size).toBe(4);
});

test("sem sessão, uma página interna redireciona para o login, e o redirect também leva CSP", async ({ request }) => {
  const resposta = await request.get("/clientes", { maxRedirects: 0 });

  expect([302, 303, 307, 308]).toContain(resposta.status());
  const destino = new URL(resposta.headers()["location"] ?? "", "http://localhost");
  expect(destino.pathname).toBe("/login");
  expect(destino.searchParams.get("redirectTo")).toBe("/clientes");
  nonceDe(resposta.headers()["content-security-policy"] ?? "");
});

test("o cabeçalho Host forjado não vira destino do redirect (sem open redirect)", async ({ request }) => {
  const resposta = await request.get("/clientes", {
    maxRedirects: 0,
    headers: { "x-forwarded-host": "evil.example.com", host: "evil.example.com" },
  });

  const local = resposta.headers()["location"] ?? "";
  expect(local).not.toContain("evil.example.com");
});
