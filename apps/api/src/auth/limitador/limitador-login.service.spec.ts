import type { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";

import { ContadorThrottlerStorage } from "./contador-throttler-storage";
import { atrasoProgressivo, LimitadorLogin } from "./limitador-login.service";
import { MemoriaContadorTentativas } from "./memoria-contador-tentativas";

/**
 * Lógica do limitador sobre o contador em memória (a variante sem Redis; o
 * mesmo contrato roda contra o Redis de verdade em test/limitador-redis).
 */

function config(valores: Record<string, number> = {}): ConfigService {
  return {
    get: (chave: string, padrao?: unknown) => valores[chave] ?? padrao,
  } as unknown as ConfigService;
}

describe("atrasoProgressivo", () => {
  it("não atrasa as falhas livres e depois dobra até o teto", () => {
    const serie = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => atrasoProgressivo(n, 5, 500, 8_000));
    expect(serie).toEqual([0, 0, 0, 0, 0, 500, 1_000, 2_000, 4_000, 8_000, 8_000, 8_000]);
  });

  it("não estoura com contagens enormes e com base zero desliga o atraso", () => {
    expect(atrasoProgressivo(1_000_000, 5, 500, 8_000)).toBe(8_000);
    expect(atrasoProgressivo(100, 5, 0, 8_000)).toBe(0);
  });
});

describe("MemoriaContadorTentativas", () => {
  it("janela fixa expira no primeiro acerto; deslizante renova a cada incremento", async () => {
    let agora = 1_000;
    const contador = new MemoriaContadorTentativas(() => agora);

    await contador.incrementar("fixa", 100);
    agora += 60;
    expect((await contador.incrementar("fixa", 100)).total).toBe(2);
    agora += 60; // 120ms desde o primeiro: venceu
    expect((await contador.incrementar("fixa", 100)).total).toBe(1);

    agora = 5_000;
    await contador.incrementar("desliza", 100, { renovarTtl: true });
    agora += 60;
    await contador.incrementar("desliza", 100, { renovarTtl: true });
    agora += 60; // 120ms desde o primeiro, mas só 60 desde o último
    expect((await contador.incrementar("desliza", 100, { renovarTtl: true })).total).toBe(3);
  });
});

describe("LimitadorLogin", () => {
  const opcoes = { LOGIN_FREE_ATTEMPTS_ACCOUNT: 5, LOGIN_FREE_ATTEMPTS_ORIGIN: 15, LOGIN_DELAY_BASE_MS: 10, LOGIN_DELAY_MAX_MS: 80 };

  it("30 falhas contra a conta A só atrasam A: a conta B (outra origem) segue sem atraso", async () => {
    const limitador = new LimitadorLogin(new MemoriaContadorTentativas(), config(opcoes));

    let ultimoDeA = 0;
    for (let i = 0; i < 30; i += 1) {
      ultimoDeA = await limitador.registrarFalha("a@plugga.local", `198.51.100.${i}`);
    }
    expect(ultimoDeA).toBe(80);

    // Primeira falha de B, de outra origem: ainda é "livre".
    expect(await limitador.registrarFalha("b@plugga.local", "203.0.113.7")).toBe(0);
  });

  it("o contador da conta zera quando o dono acerta; o da origem não", async () => {
    const limitador = new LimitadorLogin(new MemoriaContadorTentativas(), config(opcoes));

    for (let i = 0; i < 8; i += 1) await limitador.registrarFalha("a@plugga.local", "203.0.113.1");
    expect(await limitador.registrarFalha("a@plugga.local", "203.0.113.1")).toBeGreaterThan(0);

    await limitador.registrarSucesso("a@plugga.local");
    // Conta zerada (1ª falha de novo) e a origem ainda está nas 10 falhas livres.
    expect(await limitador.registrarFalha("a@plugga.local", "203.0.113.1")).toBe(0);
  });

  it("a origem acumula entre contas diferentes e passa a atrasar depois do limite livre", async () => {
    const limitador = new LimitadorLogin(new MemoriaContadorTentativas(), config(opcoes));

    let atraso = 0;
    for (let i = 0; i < 20; i += 1) {
      atraso = await limitador.registrarFalha(`alvo${i}@plugga.local`, "203.0.113.50");
    }
    expect(atraso).toBeGreaterThan(0);
    // Outra origem não paga por esta.
    expect(await limitador.registrarFalha("alvo0@plugga.local", "203.0.113.51")).toBe(0);
  });

  it("e-mail em caixa diferente é a mesma conta; e conta nenhuma é recusada (só atrasada)", async () => {
    const limitador = new LimitadorLogin(new MemoriaContadorTentativas(), config(opcoes));
    for (let i = 0; i < 5; i += 1) await limitador.registrarFalha("Ana@Plugga.local", `10.0.0.${i}`);
    expect(await limitador.registrarFalha("ana@plugga.local", "10.0.0.99")).toBe(10);
  });

  it("falha do contador não vira erro de login: sem atraso", async () => {
    const quebrado = {
      incrementar: async () => {
        throw new Error("boom");
      },
      apagar: async () => {
        throw new Error("boom");
      },
    };
    const limitador = new LimitadorLogin(quebrado, config(opcoes));
    expect(await limitador.registrarFalha("a@plugga.local", "10.0.0.1")).toBe(0);
    await expect(limitador.registrarSucesso("a@plugga.local")).resolves.toBeUndefined();
  });
});

describe("ContadorThrottlerStorage", () => {
  it("bloqueia a partir do acerto acima do limite e informa o tempo restante", async () => {
    const storage = new ContadorThrottlerStorage(new MemoriaContadorTentativas());

    const registros = [];
    for (let i = 0; i < 4; i += 1) {
      registros.push(await storage.increment("chave", 60_000, 3, 60_000, "default"));
    }
    expect(registros.map((r) => r.totalHits)).toEqual([1, 2, 3, 4]);
    expect(registros.map((r) => r.isBlocked)).toEqual([false, false, false, true]);
    expect(registros[3]?.timeToBlockExpire).toBeGreaterThan(0);
    expect(registros[0]?.timeToExpire).toBeLessThanOrEqual(60);
  });

  it("chaves diferentes não se misturam", async () => {
    const storage = new ContadorThrottlerStorage(new MemoriaContadorTentativas());
    await storage.increment("a", 60_000, 1, 60_000, "default");
    await storage.increment("a", 60_000, 1, 60_000, "default");
    const outra = await storage.increment("b", 60_000, 1, 60_000, "default");
    expect(outra.isBlocked).toBe(false);
  });
});
