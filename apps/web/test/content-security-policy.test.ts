import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildContentSecurityPolicy } from "../app/lib/content-security-policy.ts";

/**
 * VULN-4 (auditoria zero-trust): antes, `script-src` incluía `'unsafe-inline'`,
 * o que permite QUALQUER `<script>` inline executar — inclusive um payload
 * injetado por XSS (o vetor do VULN-1). A correção troca `'unsafe-inline'` por
 * um nonce único por requisição + `'strict-dynamic'`.
 */
describe("buildContentSecurityPolicy", () => {
  it("nunca inclui 'unsafe-inline' em script-src", () => {
    const csp = buildContentSecurityPolicy("abc123", true);
    const scriptSrc = csp.split(";").find((diretiva) => diretiva.trim().startsWith("script-src"));
    assert.ok(scriptSrc, "script-src directive must exist");
    assert.ok(
      !scriptSrc!.includes("'unsafe-inline'"),
      `script-src must not contain 'unsafe-inline': ${scriptSrc}`,
    );
  });

  it("inclui o nonce recebido e 'strict-dynamic' em script-src", () => {
    const csp = buildContentSecurityPolicy("meu-nonce-unico", true);
    const scriptSrc = csp.split(";").find((diretiva) => diretiva.trim().startsWith("script-src"))!;
    assert.ok(scriptSrc.includes("'nonce-meu-nonce-unico'"), scriptSrc);
    assert.ok(scriptSrc.includes("'strict-dynamic'"), scriptSrc);
  });

  it("dois nonces diferentes produzem diretivas diferentes (prova que não há valor fixo)", () => {
    const cspA = buildContentSecurityPolicy("nonce-a", true);
    const cspB = buildContentSecurityPolicy("nonce-b", true);
    assert.notEqual(cspA, cspB);
  });

  it("mantém 'unsafe-eval' apenas fora de produção (Next.js dev precisa dele; produção não)", () => {
    const dev = buildContentSecurityPolicy("n", false);
    const prod = buildContentSecurityPolicy("n", true);
    assert.ok(dev.includes("'unsafe-eval'"));
    assert.ok(!prod.includes("'unsafe-eval'"));
  });

  it("mantém object-src 'none' e frame-ancestors 'none' (defesa contra clickjacking/plugin injection)", () => {
    const csp = buildContentSecurityPolicy("n", true);
    assert.ok(csp.includes("object-src 'none'"));
    assert.ok(csp.includes("frame-ancestors 'none'"));
  });

  it("preserva as origens externas necessárias (Google Identity, jsDelivr do UnicornStudio)", () => {
    const csp = buildContentSecurityPolicy("n", true);
    assert.ok(csp.includes("https://accounts.google.com"));
    assert.ok(csp.includes("https://cdn.jsdelivr.net"));
  });
});
