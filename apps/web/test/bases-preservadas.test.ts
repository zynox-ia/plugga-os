import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { buildContentSecurityPolicy } from "../app/lib/content-security-policy.ts";
import { clientForwardedFor } from "../app/lib/forwarded-for.ts";
import { safeRelativePath } from "../app/lib/safe-redirect.ts";

/**
 * Não regressão das bases de segurança do web que a spec 002 manda preservar
 * (FR-080, constituição V). A spec mexe em cliente de API e em tratamento de erro
 * do web; estas proteções não podem enfraquecer no caminho. Os testes por
 * unidade ficam nos arquivos próprios (content-security-policy, forwarded-for,
 * safe-redirect); aqui estão os contratos que não podem sumir. O middleware roda
 * no Edge e não carrega em Node puro: ele é provado ponta a ponta em
 * e2e/seguranca.spec.ts.
 */

afterEach(() => {
  delete process.env.WEB_TRUST_PROXY;
});

function diretiva(csp: string, nome: string): string {
  const achada = csp.split(";").map((d) => d.trim()).find((d) => d.startsWith(`${nome} `));
  assert.ok(achada, `CSP sem a diretiva ${nome}: ${csp}`);
  return achada;
}

describe("CSP com nonce", () => {
  it("fecha o que não precisa abrir: sem iframe de terceiros, sem objeto, base e formulário só da própria origem", () => {
    const csp = buildContentSecurityPolicy("n", true);

    assert.equal(diretiva(csp, "default-src"), "default-src 'self'");
    assert.equal(diretiva(csp, "frame-ancestors"), "frame-ancestors 'none'");
    assert.equal(diretiva(csp, "object-src"), "object-src 'none'");
    assert.equal(diretiva(csp, "base-uri"), "base-uri 'self'");
    assert.equal(diretiva(csp, "form-action"), "form-action 'self'");
  });

  it("script-src usa nonce e strict-dynamic, nunca unsafe-inline, nem unsafe-eval em produção", () => {
    const scripts = diretiva(buildContentSecurityPolicy("abc", true), "script-src");

    assert.ok(scripts.includes("'nonce-abc'"));
    assert.ok(scripts.includes("'strict-dynamic'"));
    assert.ok(!scripts.includes("'unsafe-inline'"));
    assert.ok(!scripts.includes("'unsafe-eval'"));
  });
});

describe("cabeçalhos de segurança do next.config", () => {
  async function cabecalhos(producao: boolean): Promise<Map<string, string>> {
    const anterior = process.env.NODE_ENV;
    (process.env as Record<string, string>).NODE_ENV = producao ? "production" : "development";
    try {
      const modulo = await import(`../next.config.ts?${producao ? "prod" : "dev"}`);
      const regras = await modulo.default.headers();
      return new Map(regras[0].headers.map((h: { key: string; value: string }) => [h.key, h.value]));
    } finally {
      (process.env as Record<string, string>).NODE_ENV = anterior ?? "test";
    }
  }

  it("mantém os cabeçalhos fixos em qualquer ambiente", async () => {
    const h = await cabecalhos(false);

    assert.equal(h.get("X-Frame-Options"), "DENY");
    assert.equal(h.get("X-Content-Type-Options"), "nosniff");
    assert.equal(h.get("Referrer-Policy"), "no-referrer");
    assert.equal(h.get("Cross-Origin-Opener-Policy"), "same-origin");
    assert.equal(h.get("Cross-Origin-Resource-Policy"), "same-origin");
    assert.match(h.get("Permissions-Policy") ?? "", /camera=\(\).*geolocation=\(\).*microphone=\(\)/);
  });

  it("liga HSTS só em produção, e o CSP não volta para cá (ele vive no middleware, com nonce)", async () => {
    const dev = await cabecalhos(false);
    const prod = await cabecalhos(true);

    assert.equal(dev.has("Strict-Transport-Security"), false);
    assert.match(prod.get("Strict-Transport-Security") ?? "", /max-age=31536000/);
    assert.equal(prod.has("Content-Security-Policy"), false);
  });
});

describe("destino pós-login só relativo e da própria origem", () => {
  it("recusa URL absoluta, protocolo relativo, barra invertida, javascript: e quebra de cabeçalho", () => {
    for (const ruim of [
      "https://evil.example.com",
      "//evil.example.com",
      "/\\evil.example.com",
      "javascript:alert(1)",
      "/ok\r\nSet-Cookie: a=b",
    ]) {
      assert.equal(safeRelativePath(ruim), null, ruim);
    }
    assert.equal(safeRelativePath("/clientes?mes=8"), "/clientes?mes=8");
  });
});

describe("X-Forwarded-For: um IP validado, cadeia descartada", () => {
  const pedido = (valor: string) =>
    new Request("http://localhost:3000/api/auth/login", { headers: { "x-forwarded-for": valor } });

  it("sem proxy confiável o cabeçalho do cliente nunca é repassado", () => {
    assert.equal(clientForwardedFor(pedido("203.0.113.7")), null);
  });

  it("com proxy confiável repassa um IP válido e descarta cadeia, porta, nome e lixo", () => {
    process.env.WEB_TRUST_PROXY = "true";

    assert.equal(clientForwardedFor(pedido("203.0.113.7")), "203.0.113.7");
    for (const ruim of ["203.0.113.7, 10.0.0.1", "203.0.113.7:443", "exemplo.com", "999.1.1.1", "1.2.3"]) {
      assert.equal(clientForwardedFor(pedido(ruim)), null, ruim);
    }
  });
});
