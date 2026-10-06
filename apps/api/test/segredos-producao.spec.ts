import { randomBytes } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { validateEnvironment } from "../src/config/environment";
import { cifrar } from "../src/llm/cripto";

/**
 * SC-015: o sistema não inicia em produção com nenhum dos segredos de exemplo.
 *
 * `validateEnvironment` é exatamente o que o `ConfigModule` chama no boot, então
 * uma recusa aqui é uma recusa de subir. Os valores "bons" são gerados na hora:
 * nenhum segredo, nem de exemplo, é fixado como prova de aceite.
 */

const SEGREDO_BOM = randomBytes(32).toString("base64");
const CHAVE_MESTRA_BOA = randomBytes(32).toString("base64");

function producao(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    NODE_ENV: "production",
    DATABASE_URL:
      "postgresql://plugga_app:" + randomBytes(12).toString("hex") + "@postgres:5432/plugga_os?schema=public",
    REDIS_URL: "redis://redis:6379",
    AUTH_SESSION_SECRET: SEGREDO_BOM,
    ...extra,
  };
}

function motivos(ambiente: Record<string, unknown>): string {
  try {
    validateEnvironment(ambiente);
  } catch (erro) {
    return (erro as Error).message;
  }
  return "";
}

describe("segredos em produção (T118)", () => {
  it("aceita uma configuração de produção com segredos gerados", () => {
    expect(() =>
      validateEnvironment(producao({ SECRETS_ENCRYPTION_KEY: CHAVE_MESTRA_BOA, SESSION_CACHE_HMAC_KEY: SEGREDO_BOM })),
    ).not.toThrow();
  });

  it("não derruba a produção que deixa SECRETS_ENCRYPTION_KEY e SEED_ADMIN_PASSWORD vazios (compose passa ${VAR:-})", () => {
    expect(() => validateEnvironment(producao({ SECRETS_ENCRYPTION_KEY: "", SEED_ADMIN_PASSWORD: "" }))).not.toThrow();
  });

  const exemplos: Array<[string, Record<string, unknown>]> = [
    [
      "AUTH_SESSION_SECRET do .env.example",
      { AUTH_SESSION_SECRET: "local_only_session_secret_change_me_at_least_32_chars" },
    ],
    ["AUTH_SESSION_SECRET da CI", { AUTH_SESSION_SECRET: "ci_local_only_session_secret_change_me_please" }],
    ["AUTH_SESSION_SECRET dos testes", { AUTH_SESSION_SECRET: "test_only_session_secret_change_me_please" }],
    [
      "AUTH_SESSION_SECRET com marcador 'change_me'",
      { AUTH_SESSION_SECRET: "xK9f2LmQ7vB3nR8tY1wZ5cD4hJ6pS0aE_change_me" },
    ],
    ["AUTH_SESSION_SECRET de um caractere repetido", { AUTH_SESSION_SECRET: "a".repeat(48) }],
    ["AUTH_SESSION_SECRET de baixa entropia", { AUTH_SESSION_SECRET: "abababababababababababababababababababab" }],
    [
      "SECRETS_ENCRYPTION_KEY toda zero (exemplo do .env.example)",
      { SECRETS_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=" },
    ],
    ["SECRETS_ENCRYPTION_KEY de 32 bytes iguais", { SECRETS_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64") }],
    [
      "SECRETS_ENCRYPTION_KEY de poucos bytes distintos",
      { SECRETS_ENCRYPTION_KEY: Buffer.from("ab".repeat(16)).toString("base64") },
    ],
    [
      "SESSION_CACHE_HMAC_KEY de exemplo",
      { SESSION_CACHE_HMAC_KEY: "local_only_session_secret_change_me_at_least_32_chars" },
    ],
    ["SEED_ADMIN_PASSWORD de exemplo", { SEED_ADMIN_PASSWORD: "local_only_change_me" }],
    ["STORAGE_SECRET_KEY de exemplo", { STORAGE_SECRET_KEY: "plugga_local_secret" }],
    [
      "senha do DATABASE_URL de exemplo",
      { DATABASE_URL: "postgresql://plugga_app:local_only_change_me@postgres:5432/plugga_os?schema=public" },
    ],
  ];

  it.each(exemplos)("recusa %s", (_nome, extra) => {
    const mensagem = motivos(producao(extra));
    expect(mensagem).toContain("segredo recusado em produção");
    // A mensagem nomeia a variável, nunca imprime o valor recusado.
    const valor = String(Object.values(extra)[0]);
    if (!valor.startsWith("postgresql://")) expect(mensagem).not.toContain(valor);
  });

  it("os mesmos valores de exemplo continuam valendo fora de produção (CI e testes)", () => {
    for (const [, extra] of exemplos) {
      expect(() =>
        validateEnvironment({
          ...producao(),
          NODE_ENV: "test",
          DATABASE_URL: "postgresql://x:y@localhost:55432/db?schema=public",
          REDIS_URL: "redis://localhost:56380",
          ...extra,
        }),
      ).not.toThrow();
    }
  });
});

describe("cripto.ts em produção (segunda barreira)", () => {
  const original = { NODE_ENV: process.env.NODE_ENV, chave: process.env.SECRETS_ENCRYPTION_KEY };

  afterEach(() => {
    process.env.NODE_ENV = original.NODE_ENV;
    if (original.chave === undefined) delete process.env.SECRETS_ENCRYPTION_KEY;
    else process.env.SECRETS_ENCRYPTION_KEY = original.chave;
  });

  it("recusa cifrar com a chave toda zero em produção, mas aceita em teste", () => {
    process.env.SECRETS_ENCRYPTION_KEY = Buffer.alloc(32).toString("base64");

    process.env.NODE_ENV = "test";
    expect(() => cifrar("segredo")).not.toThrow();

    process.env.NODE_ENV = "production";
    expect(() => cifrar("segredo")).toThrow(/recusada em produção/);
  });

  it("aceita uma chave gerada em produção", () => {
    process.env.SECRETS_ENCRYPTION_KEY = CHAVE_MESTRA_BOA;
    process.env.NODE_ENV = "production";
    expect(() => cifrar("segredo")).not.toThrow();
  });
});
