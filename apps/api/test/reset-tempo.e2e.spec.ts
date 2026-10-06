import { Test } from "@nestjs/testing";
import type { ConfigService } from "@nestjs/config";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module";
import { AuditRepository } from "../src/audit/audit.repository";
import { AuthRepository } from "../src/auth/auth.repository";
import { AuthTokenIssuer } from "../src/auth/auth-token-issuer.service";
import { ResetEmailDispatcher } from "../src/auth/reset-email.dispatcher";
import { RESET_EMAIL_JOB_KEY, ResetEmailHandler } from "../src/auth/reset-email.handler";
import { configureApp } from "../src/configure-app";
import { NullSessionCache } from "../src/core/auth/null-session-cache";
import { SessionCache } from "../src/core/auth/session-cache";
import { SessionLookupRepository } from "../src/core/auth/session-lookup.repository";
import { EmailPort, type TransactionalEmail } from "../src/email/email.port";
import { JobsQueue, type EnqueueOptions, type EnqueueResult } from "../src/jobs/queue/jobs-queue.port";
import {
  access,
  CapturingEmailPort,
  InMemoryAuthRepository,
  InMemorySessionLookup,
  InMemoryStore,
  NoopAuditRepository,
} from "./support/in-memory-auth";

/**
 * FR-051: a resposta E O TEMPO do pedido de redefinição são indistinguíveis
 * entre conta existente e inexistente.
 *
 * O envio real custa tempo só para quem existe (consulta do token, gravação,
 * provedor de e-mail). Para a prova ser dura, o provedor aqui é LENTO (200 ms):
 * se o envio rodasse dentro da requisição, a conta existente responderia 200 ms
 * mais devagar que a inexistente e a diferença apareceria de longe.
 */

const ATRASO_DO_PROVEDOR_MS = 200;

class ProvedorLento extends CapturingEmailPort {
  override async sendTransactional(email: TransactionalEmail): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ATRASO_DO_PROVEDOR_MS));
    await super.sendTransactional(email);
  }
}

function mediana(valores: number[]): number {
  const ordenados = [...valores].sort((a, b) => a - b);
  return ordenados[Math.floor(ordenados.length / 2)] ?? 0;
}

describe("redefinição de senha: resposta e tempo indistinguíveis (e2e)", () => {
  let app: NestExpressApplication;
  let store: InMemoryStore;
  let email: ProvedorLento;
  let dispatcher: ResetEmailDispatcher;

  const existente = "existe@plugga.local";
  const inexistente = "nao.existe@plugga.local";

  beforeAll(async () => {
    store = new InMemoryStore();
    email = new ProvedorLento();

    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthRepository)
      .useValue(new InMemoryAuthRepository(store))
      .overrideProvider(SessionLookupRepository)
      .useValue(new InMemorySessionLookup(store))
      .overrideProvider(EmailPort)
      .useValue(email)
      .overrideProvider(AuditRepository)
      .useValue(new NoopAuditRepository())
      .overrideProvider(SessionCache)
      .useValue(new NullSessionCache())
      .compile();

    app = module.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    await app.listen(0);
    dispatcher = app.get(ResetEmailDispatcher);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    store.clear();
    email.sent.length = 0;
    await store.addUser({ email: existente, name: "Existe", password: "uma senha longa aqui", access: access() });
  });

  let ip = 0;
  async function pedir(destino: string): Promise<{ status: number; corpo: unknown; ms: number }> {
    ip += 1;
    const inicio = performance.now();
    // IP próprio por pedido: o teto de 5/min por IP não pode entrar na medida.
    const resposta = await request(app.getHttpServer())
      .post("/auth/reset/request")
      .set("X-Forwarded-For", `10.55.${Math.floor(ip / 250)}.${ip % 250}`)
      .send({ email: destino });
    return { status: resposta.status, corpo: resposta.body, ms: performance.now() - inicio };
  }

  it("mesmo status, mesmo corpo e mediana de tempo equivalente para conta existente e inexistente", async () => {
    // Aquecimento: a primeira requisição paga a inicialização dos módulos.
    await pedir(existente);
    await pedir(inexistente);
    await dispatcher.aguardarPendentes();

    const comConta: number[] = [];
    const semConta: number[] = [];
    for (let i = 0; i < 15; i += 1) {
      const a = await pedir(existente);
      const b = await pedir(inexistente);
      expect(a.status).toBe(200);
      expect(b.status).toBe(200);
      expect(a.corpo).toEqual({ ok: true });
      expect(b.corpo).toEqual(a.corpo);
      comConta.push(a.ms);
      semConta.push(b.ms);
    }

    const diferenca = Math.abs(mediana(comConta) - mediana(semConta));
    // Com o envio dentro da requisição a diferença seria >= 200 ms. Fora dela é
    // ruído de milissegundos; 40 ms dá folga a CI lenta sem esconder o defeito.
    expect(
      diferenca,
      `medianas: com conta ${mediana(comConta).toFixed(1)} ms, sem conta ${mediana(semConta).toFixed(1)} ms`,
    ).toBeLessThan(40);
    expect(mediana(comConta)).toBeLessThan(ATRASO_DO_PROVEDOR_MS);

    // E o e-mail da conta existente sai, só que fora da requisição.
    await dispatcher.aguardarPendentes();
    expect(email.sent.length).toBeGreaterThan(0);
    expect(email.sent.every((e) => e.to === existente)).toBe(true);
  }, 60_000);

  it("falha do provedor de e-mail não muda a resposta (conta existente continua igual à inexistente)", async () => {
    email.failNext = true;
    const a = await pedir(existente);
    const b = await pedir(inexistente);
    await dispatcher.aguardarPendentes();
    expect([a.status, a.corpo]).toEqual([b.status, b.corpo]);
  });
});

describe("ResetEmailDispatcher: o caminho da requisição é o mesmo para qualquer e-mail", () => {
  class FilaFalsa extends JobsQueue {
    readonly chamadas: Array<{ jobKey: string; payload: unknown; options?: EnqueueOptions }> = [];
    falhar = false;

    async enqueue<Payload>(jobKey: string, payload: Payload, options?: EnqueueOptions): Promise<EnqueueResult> {
      if (this.falhar) throw new Error("redis fora do ar");
      this.chamadas.push({ jobKey, payload, options });
      return { jobId: String(this.chamadas.length), jobKey, deduped: false };
    }
  }

  function montar(filaLigada: boolean) {
    const fila = new FilaFalsa();
    const processados: string[] = [];
    const handler = {
      process: async (payload: { email: string }) => {
        processados.push(payload.email);
      },
    } as unknown as ResetEmailHandler;
    const config = { get: (_: string, padrao?: unknown) => (filaLigada ? true : padrao) } as unknown as ConfigService;
    return { fila, processados, dispatcher: new ResetEmailDispatcher(fila, config, handler) };
  }

  it("com a fila ligada, enfileira para existente e inexistente e não executa nada na hora", async () => {
    const { fila, processados, dispatcher } = montar(true);

    await dispatcher.solicitar("existe@plugga.local");
    await dispatcher.solicitar("nao.existe@plugga.local");

    expect(fila.chamadas.map((c) => c.jobKey)).toEqual([RESET_EMAIL_JOB_KEY, RESET_EMAIL_JOB_KEY]);
    expect(fila.chamadas.map((c) => Object.keys(c.options ?? {}).sort())).toEqual([
      ["dedupeKey", "triggeredBy"],
      ["dedupeKey", "triggeredBy"],
    ]);
    // O e-mail em claro não vira chave de deduplicação.
    expect(fila.chamadas.every((c) => !String(c.options?.dedupeKey).includes("@"))).toBe(true);
    expect(processados).toEqual([]);
  });

  it("a chave de deduplicação é a mesma para o mesmo e-mail, em qualquer caixa", async () => {
    const { fila, dispatcher } = montar(true);
    await dispatcher.solicitar("Ana@Plugga.local");
    await dispatcher.solicitar("ana@plugga.local");
    expect(fila.chamadas[0]?.options?.dedupeKey).toBe(fila.chamadas[1]?.options?.dedupeKey);
  });

  it("sem fila, executa em segundo plano, depois de responder", async () => {
    const { processados, dispatcher } = montar(false);

    await dispatcher.solicitar("existe@plugga.local");
    expect(processados).toEqual([]);

    await dispatcher.aguardarPendentes();
    expect(processados).toEqual(["existe@plugga.local"]);
  });

  it("fila ligada porém fora do ar: cai para o segundo plano, sem erro para quem pediu", async () => {
    const { fila, processados, dispatcher } = montar(true);
    fila.falhar = true;

    await expect(dispatcher.solicitar("existe@plugga.local")).resolves.toBeUndefined();
    await dispatcher.aguardarPendentes();
    expect(processados).toEqual(["existe@plugga.local"]);
  });

  it("erro do handler em segundo plano é engolido (nunca vira 500)", async () => {
    const handler = {
      process: async () => {
        throw new Error("provedor fora do ar");
      },
    } as unknown as ResetEmailHandler;
    const config = { get: (_: string, padrao?: unknown) => padrao } as unknown as ConfigService;
    const dispatcher = new ResetEmailDispatcher(new FilaFalsa(), config, handler);

    await expect(dispatcher.solicitar("existe@plugga.local")).resolves.toBeUndefined();
    await expect(dispatcher.aguardarPendentes()).resolves.toBeUndefined();
  });
});

describe("ResetEmailHandler", () => {
  it("só conta ativa recebe token; inexistente e desativada terminam sem erro e sem e-mail", async () => {
    const store = new InMemoryStore();
    const repository = new InMemoryAuthRepository(store);
    const email = new CapturingEmailPort();
    const config = { get: (_: string, padrao?: unknown) => padrao } as unknown as ConfigService;
    const tokens = new AuthTokenIssuer(repository, email, config);
    const eventos: string[] = [];
    const audit = new (class extends NoopAuditRepository {
      override async appendEvent(evento: { eventName: string }): Promise<void> {
        eventos.push(evento.eventName);
      }
    })();
    const handler = new ResetEmailHandler(repository, tokens, audit);

    await store.addUser({ email: "ativa@plugga.local", password: "senha longa aqui 1", access: access() });
    await store.addUser({ email: "off@plugga.local", password: "senha longa aqui 2", status: "disabled", access: access() });

    await handler.process({ email: "nao.existe@plugga.local" });
    await handler.process({ email: "off@plugga.local" });
    expect(email.sent).toHaveLength(0);

    await handler.process({ email: "ativa@plugga.local" });
    expect(email.sent).toHaveLength(1);
    expect(eventos).toEqual(["auth.reset.requested"]);
  });
});
