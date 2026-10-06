import { randomBytes } from "node:crypto";

import { Redis } from "ioredis";
import { afterAll, describe, expect, it } from "vitest";

import { RedisSessionCache } from "../src/core/auth/redis-session-cache";
import type { SessionCacheEntry } from "../src/core/auth/session-cache";

/**
 * T115 contra o Redis de verdade: com `SESSION_CACHE_HMAC_KEY`, uma entrada
 * adulterada por quem escreve direto no Redis é recusada. Atrás de variável
 * porque exige Redis no ar:
 *
 *     RUN_REDIS_INTEGRATION_TESTS=true pnpm --filter @plugga/api exec vitest run test/session-cache-hmac.integration.spec.ts
 *
 * As chaves de sessão têm `tokenHash` aleatório (únicas por execução) e são
 * apagadas no fim: o Redis de teste é compartilhado.
 */
const HABILITADO = process.env.RUN_REDIS_INTEGRATION_TESTS === "true";
const PRAZO_MS = 30_000;
const PREFIXO_CHAVE = "session:v1:principal:";

const HMAC_KEY = randomBytes(32).toString("base64");

const entrada: SessionCacheEntry = {
  user: {
    id: "u-hmac-teste",
    email: "ana@plugga.local",
    name: "Ana",
    status: "active",
    access: { platformRoles: [], companies: [] },
  },
};

describe.skipIf(!HABILITADO)("cache de sessão com HMAC (Redis real)", () => {
  const url = process.env.REDIS_URL as string;
  const direto = new Redis(url);
  const caches: RedisSessionCache[] = [];
  const hashes: string[] = [];

  function novoHash(): string {
    const hash = `hmac-teste-${randomBytes(8).toString("hex")}`;
    hashes.push(hash);
    return hash;
  }

  function cache(hmacKey?: string): RedisSessionCache {
    const instancia = new RedisSessionCache(url, hmacKey);
    caches.push(instancia);
    return instancia;
  }

  afterAll(async () => {
    await direto.del(...hashes.map((h) => PREFIXO_CHAVE + h), "session:v1:by-user:u-hmac-teste");
    await direto.quit();
    for (const c of caches) await c.onModuleDestroy();
  }, PRAZO_MS);

  it("entrada gravada pelo app volta intacta", async () => {
    const hash = novoHash();
    const selado = cache(HMAC_KEY);
    await selado.set(hash, entrada.user.id, entrada, 60);
    expect(await selado.get(hash)).toEqual(entrada);
    // No Redis o valor está selado, não em JSON puro.
    expect(await direto.get(PREFIXO_CHAVE + hash)).toMatch(/^h1\./);
  }, PRAZO_MS);

  it("entrada adulterada direto no Redis é recusada (miss)", async () => {
    const hash = novoHash();
    const selado = cache(HMAC_KEY);
    await selado.set(hash, entrada.user.id, entrada, 60);

    const original = (await direto.get(PREFIXO_CHAVE + hash)) as string;
    const adulterada = original.replace('"platformRoles":[]', '"platformRoles":["admin"]');
    expect(adulterada).not.toBe(original);
    await direto.set(PREFIXO_CHAVE + hash, adulterada, "EX", 60);

    expect(await selado.get(hash)).toBeNull();
  }, PRAZO_MS);

  it("entrada em JSON puro, forjada por quem só tem acesso ao Redis, é recusada", async () => {
    const hash = novoHash();
    await direto.set(PREFIXO_CHAVE + hash, JSON.stringify(entrada), "EX", 60);
    expect(await cache(HMAC_KEY).get(hash)).toBeNull();
  }, PRAZO_MS);

  it("entrada selada com outra chave é recusada", async () => {
    const hash = novoHash();
    await cache(randomBytes(32).toString("base64")).set(hash, entrada.user.id, entrada, 60);
    expect(await cache(HMAC_KEY).get(hash)).toBeNull();
  }, PRAZO_MS);

  it("sem a chave (padrão) o comportamento é o de sempre: JSON puro, ida e volta", async () => {
    const hash = novoHash();
    const puro = cache();
    await puro.set(hash, entrada.user.id, entrada, 60);
    expect(await direto.get(PREFIXO_CHAVE + hash)).toBe(JSON.stringify(entrada));
    expect(await puro.get(hash)).toEqual(entrada);
  }, PRAZO_MS);
});
