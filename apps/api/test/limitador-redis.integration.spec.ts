import { afterAll, describe, expect, it } from "vitest";

import { ContadorThrottlerStorage } from "../src/auth/limitador/contador-throttler-storage";
import { RedisContadorTentativas } from "../src/auth/limitador/redis-contador-tentativas";

/**
 * O contador de abuso contra o Redis de verdade (US11, T112). Fica atrás de
 * variável porque exige Redis no ar:
 *
 *     RUN_REDIS_INTEGRATION_TESTS=true pnpm --filter @plugga/api exec vitest run test/limitador-redis.integration.spec.ts
 *
 * O Redis de teste é compartilhado: toda chave aqui nasce sob um prefixo único
 * deste arquivo e é apagada no fim.
 */
const HABILITADO = process.env.RUN_REDIS_INTEGRATION_TESTS === "true";
const PRAZO_MS = 30_000;

describe.skipIf(!HABILITADO)("RedisContadorTentativas (Redis real)", () => {
  const prefixo = `teste-limitador-${process.pid}-${Date.now()}:`;
  const contador = new RedisContadorTentativas(process.env.REDIS_URL as string, { prefixo });

  afterAll(async () => {
    await contador.apagarTudoDoPrefixo();
    await contador.onModuleDestroy();
  }, PRAZO_MS);

  it("incrementa de forma atômica sob concorrência", async () => {
    const resultados = await Promise.all(
      Array.from({ length: 50 }, () => contador.incrementar("concorrente", 60_000)),
    );
    expect(resultados.map((r) => r.total).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 50 }, (_, i) => i + 1),
    );
  }, PRAZO_MS);

  it("janela fixa não renova a validade; a deslizante renova", async () => {
    await contador.incrementar("fixa", 400);
    await new Promise((r) => setTimeout(r, 250));
    const segundoFixa = await contador.incrementar("fixa", 400);
    expect(segundoFixa.total).toBe(2);
    expect(segundoFixa.ttlRestanteMs).toBeLessThanOrEqual(200);

    await contador.incrementar("desliza", 400, { renovarTtl: true });
    await new Promise((r) => setTimeout(r, 250));
    const segundoDesliza = await contador.incrementar("desliza", 400, { renovarTtl: true });
    expect(segundoDesliza.total).toBe(2);
    expect(segundoDesliza.ttlRestanteMs).toBeGreaterThan(300);

    await new Promise((r) => setTimeout(r, 450));
    expect((await contador.incrementar("fixa", 400)).total).toBe(1);
  }, PRAZO_MS);

  it("apagar zera o contador", async () => {
    await contador.incrementar("zera", 60_000);
    await contador.incrementar("zera", 60_000);
    await contador.apagar("zera");
    expect((await contador.incrementar("zera", 60_000)).total).toBe(1);
  }, PRAZO_MS);

  it("o estado vale para outra conexão (o que faz sobreviver a reinício)", async () => {
    await contador.incrementar("compartilhado", 60_000);
    const outra = new RedisContadorTentativas(process.env.REDIS_URL as string, { prefixo });
    try {
      expect((await outra.incrementar("compartilhado", 60_000)).total).toBe(2);
    } finally {
      await outra.onModuleDestroy();
    }
  }, PRAZO_MS);

  it("serve de armazenamento do throttler, com bloqueio acima do limite", async () => {
    const storage = new ContadorThrottlerStorage(contador);
    const registros = [];
    for (let i = 0; i < 4; i += 1) {
      registros.push(await storage.increment("rota", 60_000, 3, 60_000, "default"));
    }
    expect(registros.map((r) => r.isBlocked)).toEqual([false, false, false, true]);
  }, PRAZO_MS);
});

describe("RedisContadorTentativas sem Redis (falha aberta)", () => {
  it("cai para a memória do processo, sem erro, e deixa de esperar o Redis a cada chamada", async () => {
    // Porta fechada: nenhum Redis responde.
    const contador = new RedisContadorTentativas("redis://127.0.0.1:1", { prefixo: "teste-sem-redis:" });
    try {
      const primeiro = await contador.incrementar("a", 60_000);
      const segundo = await contador.incrementar("a", 60_000);
      expect([primeiro.total, segundo.total]).toEqual([1, 2]);

      // Com o disjuntor aberto a chamada seguinte é imediata.
      const inicio = performance.now();
      await contador.incrementar("a", 60_000);
      expect(performance.now() - inicio).toBeLessThan(100);

      await contador.apagar("a");
      expect((await contador.incrementar("a", 60_000)).total).toBe(1);
    } finally {
      await contador.onModuleDestroy();
    }
  }, PRAZO_MS);
});
