import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("configuração de sessão chega ao container da API", () => {
  const compose = readFileSync(resolve(__dirname, "../../../compose.yaml"), "utf8");
  const api = compose.slice(compose.indexOf("  api:"), compose.indexOf("  web:"));

  it.each([
    ["SESSION_CACHE_ENABLED", "true"],
    ["SESSION_CACHE_TTL_SECONDS", "60"],
    ["SESSION_CACHE_HMAC_KEY", ""],
    ["SESSION_TTL_MINUTES", "720"],
    ["SESSION_ABSOLUTE_TTL_HOURS", "720"],
    ["SESSION_RENEWAL_DEBOUNCE_MINUTES", "5"],
  ])("transmite %s sem segredo embutido", (key, fallback) => {
    expect(api).toContain(`${key}: \${${key}:-${fallback}}`);
  });
});
