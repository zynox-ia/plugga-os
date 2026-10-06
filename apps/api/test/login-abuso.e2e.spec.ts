import "./support/login-abuso-env";

import { Test } from "@nestjs/testing";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { afterAll, afterEach, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module";
import { AuditRepository } from "../src/audit/audit.repository";
import { AuthRepository } from "../src/auth/auth.repository";
import { ContadorTentativas } from "../src/auth/limitador/contador-tentativas";
import { LimitadorLogin } from "../src/auth/limitador/limitador-login.service";
import { MemoriaContadorTentativas } from "../src/auth/limitador/memoria-contador-tentativas";
import { RedisContadorTentativas } from "../src/auth/limitador/redis-contador-tentativas";
import { configureApp } from "../src/configure-app";
import { NullSessionCache } from "../src/core/auth/null-session-cache";
import { SessionCache } from "../src/core/auth/session-cache";
import { SessionLookupRepository } from "../src/core/auth/session-lookup.repository";
import { EmailPort } from "../src/email/email.port";
import {
  access,
  CapturingEmailPort,
  InMemoryAuthRepository,
  InMemorySessionLookup,
  InMemoryStore,
  NoopAuditRepository,
} from "./support/in-memory-auth";

/**
 * SC-013 / SEC-006: em ataque simulado de tentativas de login, quem informa a
 * senha correta entra em 100% das vezes. 30 falhas contra a conta A não impedem
 * a conta B, nem a própria A com a senha certa; quem erra é atrasado.
 *
 * Duas variantes do MESMO cenário: contador em memória (roda sempre) e contador
 * no Redis de verdade (`RUN_REDIS_INTEGRATION_TESTS=true`), esta última também
 * provando que os contadores sobrevivem a reinício do app.
 */

const COM_REDIS = process.env.RUN_REDIS_INTEGRATION_TESTS === "true";
const PRAZO_MS = 60_000;

const emailA = "conta.a@plugga.local";
const senhaA = "senha da conta a muito longa";
const emailB = "conta.b@plugga.local";
const senhaB = "senha da conta b muito longa";

interface Ambiente {
  app: NestExpressApplication;
  store: InMemoryStore;
  contador: ContadorTentativas;
}

async function subirApp(contador: ContadorTentativas, store: InMemoryStore): Promise<Ambiente> {
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(AuthRepository)
    .useValue(new InMemoryAuthRepository(store))
    .overrideProvider(SessionLookupRepository)
    .useValue(new InMemorySessionLookup(store))
    .overrideProvider(EmailPort)
    .useValue(new CapturingEmailPort())
    .overrideProvider(AuditRepository)
    .useValue(new NoopAuditRepository())
    .overrideProvider(SessionCache)
    .useValue(new NullSessionCache())
    .overrideProvider(ContadorTentativas)
    .useValue(contador)
    .compile();

  const app = module.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();
  await app.listen(0);
  return { app, store, contador };
}

async function criarContas(store: InMemoryStore): Promise<void> {
  store.clear();
  await store.addUser({ email: emailA, password: senhaA, access: access() });
  await store.addUser({ email: emailB, password: senhaB, access: access() });
}

function login(app: NestExpressApplication, email: string, password: string, ip: string) {
  return request(app.getHttpServer()).post("/auth/login").set("X-Forwarded-For", ip).send({ email, password });
}

/** Tempo, em ms, que a resposta leva para chegar. */
async function medir(requisicao: PromiseLike<unknown>): Promise<number> {
  const inicio = performance.now();
  await requisicao;
  return performance.now() - inicio;
}

function cenario(nome: string, criarContador: () => ContadorTentativas, limpar: (c: ContadorTentativas) => Promise<void>) {
  describe(nome, () => {
    const abertos: Ambiente[] = [];

    afterEach(async () => {
      for (const ambiente of abertos.splice(0)) {
        await limpar(ambiente.contador);
        await ambiente.app.close();
      }
    });

    async function abrir(contador = criarContador(), store = new InMemoryStore()): Promise<Ambiente> {
      await criarContas(store);
      const ambiente = await subirApp(contador, store);
      abertos.push(ambiente);
      return ambiente;
    }

    it(
      "30 falhas contra a conta A (IPs diferentes) não impedem a B nem a própria A com a senha certa",
      async () => {
        const { app } = await abrir();

        for (let i = 0; i < 30; i += 1) {
          await login(app, emailA, "senha errada", `198.51.100.${i + 1}`).expect(401);
        }

        await login(app, emailB, senhaB, "203.0.113.10").expect(200);
        const resposta = await login(app, emailA, senhaA, "203.0.113.11").expect(200);
        expect(resposta.body.user).toMatchObject({ email: emailA });
        expect(resposta.headers["set-cookie"]?.[0]).toContain("plugga_session=");
      },
      PRAZO_MS,
    );

    it(
      "30 falhas do MESMO IP contra a A não impedem B nem A de entrar a partir desse IP",
      async () => {
        const { app } = await abrir();
        const ip = "203.0.113.77";

        for (let i = 0; i < 30; i += 1) {
          await login(app, emailA, "senha errada", ip).expect(401);
        }

        await login(app, emailB, senhaB, ip).expect(200);
        await login(app, emailA, senhaA, ip).expect(200);
      },
      PRAZO_MS,
    );

    it(
      "quem erra é atrasado de forma progressiva, e quem acerta não espera",
      async () => {
        const { app } = await abrir();

        const tempos: number[] = [];
        for (let i = 0; i < 12; i += 1) {
          tempos.push(await medir(login(app, emailA, "senha errada", `198.51.100.${100 + i}`)));
        }
        // As livres respondem só com o custo do hash; as seguintes pagam o atraso (20 -> 60 ms).
        const atrasadas = tempos.slice(7);
        expect(Math.min(...atrasadas)).toBeGreaterThanOrEqual(50);

        // Quem erra de novo continua pagando o teto; quem acerta paga só a
        // verificação argon2 e entra (o sucesso zera o contador da conta, por
        // isso o erro vem ANTES do acerto).
        const erro = await medir(login(app, emailA, "senha errada", "203.0.113.201"));
        expect(erro).toBeGreaterThanOrEqual(50);
        const acerto = await medir(login(app, emailA, senhaA, "203.0.113.200").expect(200));
        expect(acerto).toBeLessThan(erro + 200);
      },
      PRAZO_MS,
    );

    it(
      "conta inexistente recebe o mesmo atraso e a mesma resposta (sem oráculo de existência)",
      async () => {
        const { app } = await abrir();
        const fantasma = "ninguem@plugga.local";

        let ultima = 0;
        let corpo: { codigo?: string; mensagem?: string } = {};
        for (let i = 0; i < 12; i += 1) {
          const inicio = performance.now();
          const resposta = await login(app, fantasma, "senha errada", `198.51.100.${150 + i}`).expect(401);
          ultima = performance.now() - inicio;
          corpo = resposta.body as typeof corpo;
        }
        expect(ultima).toBeGreaterThanOrEqual(50);

        const existente = await login(app, emailA, "senha errada", "203.0.113.222").expect(401);
        expect({ codigo: existente.body.codigo, mensagem: existente.body.mensagem }).toEqual({
          codigo: corpo.codigo,
          mensagem: corpo.mensagem,
        });
      },
      PRAZO_MS,
    );

    if (COM_REDIS && nome.includes("Redis")) {
      it(
        "os contadores sobrevivem a reinício do app",
        async () => {
          const store = new InMemoryStore();
          const primeiro = await abrir(criarContador(), store);

          const limitador = primeiro.app.get(LimitadorLogin);
          for (let i = 0; i < 30; i += 1) {
            await limitador.registrarFalha(emailA, `198.51.100.${i + 1}`);
          }

          // "Reinício": o processo morre (fecha o app e a conexão) e sobe outro.
          const indice = abertos.indexOf(primeiro);
          abertos.splice(indice, 1);
          await primeiro.app.close();

          const segundo = await abrir(criarContador(), store);
          const novoLimitador = segundo.app.get(LimitadorLogin);
          // A conta A continua no teto; a B (e outra origem) segue limpa.
          expect(await novoLimitador.registrarFalha(emailA, "203.0.113.30")).toBe(60);
          expect(await novoLimitador.registrarFalha(emailB, "203.0.113.31")).toBe(0);

          // Na prática HTTP: o erro contra A paga o atraso, o acerto de A entra.
          const erro = await medir(login(segundo.app, emailA, "senha errada", "203.0.113.32"));
          expect(erro).toBeGreaterThanOrEqual(50);
          await login(segundo.app, emailA, senhaA, "203.0.113.33").expect(200);
          await login(segundo.app, emailB, senhaB, "203.0.113.34").expect(200);
        },
        PRAZO_MS,
      );
    }
  });
}

cenario(
  "login resistente a abuso (contador em memória)",
  () => new MemoriaContadorTentativas(),
  async () => undefined,
);

describe.skipIf(!COM_REDIS)("login resistente a abuso com Redis de verdade", () => {
  // Prefixo único: o Redis de teste é compartilhado, e só as chaves deste
  // arquivo são criadas e apagadas aqui.
  const prefixo = `teste-login-abuso-${process.pid}-${Date.now()}:`;

  afterAll(async () => {
    const limpeza = new RedisContadorTentativas(process.env.REDIS_URL as string, { prefixo });
    await limpeza.apagarTudoDoPrefixo();
    await limpeza.onModuleDestroy();
  });

  cenario(
    "login resistente a abuso (Redis)",
    () => new RedisContadorTentativas(process.env.REDIS_URL as string, { prefixo }),
    async () => undefined,
  );
});
