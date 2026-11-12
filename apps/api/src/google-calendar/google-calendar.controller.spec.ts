import { randomBytes } from "node:crypto";

import type { INestApplication } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import type { Acesso } from "@plugga/shared";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AuditPort } from "../audit/audit.port";
import { FiltroGlobalDeExcecoes } from "../common/errors/filtro-global";
import { AcessoGuard } from "../core/auth/acesso.guard";
import { AuthContext, type AuthenticatedRequest } from "../core/auth/auth.types";
import { OriginCheckGuard } from "../core/auth/origin-check.guard";
import { SessionAuthGuard } from "../core/auth/session-auth.guard";
import { SegredoRepository } from "../llm/segredo.repository.js";
import {
  auditoriaEmMemoria,
  ConexoesEmMemoria,
  GoogleCalendarFake,
  LeituraDeCredenciaisEmMemoria,
  SegredosEmMemoria,
  TOKENS_SINTETICOS,
} from "./arquivos-de-teste";
import { ConexaoGoogleCalendarRepository } from "./conexao-google-calendar.repository";
import { GoogleCalendarController } from "./google-calendar.controller";
import { GoogleApiError, GoogleCalendarPort } from "./google-calendar.port";
import { GoogleCalendarService } from "./google-calendar.service";
import { GoogleOAuthCofreService, GoogleOAuthLeitura } from "./google-oauth-cofre.service";

/**
 * A conexão da agenda pela API, com os guards de verdade (sessão, acesso e
 * origem) e o Google de mentira. O que se prova: qualquer papel conecta a
 * PRÓPRIA agenda; sem sessão é 401; identidade de IA é 403; o retorno só vale
 * para a pessoa e a sessão que iniciaram; nenhuma resposta carrega token.
 */

const ORIGEM = "http://localhost:3000";
const CLIENTE = { clientId: "1234567890-abcdefg.apps.googleusercontent.com", clientSecret: "GOCSPX-segredo-sintetico-9z8y" };
const ACESSOS: Record<string, Acesso> = {
  desenvolvedor: { plataforma: "desenvolvedor", departamentos: [] },
  admin: { plataforma: "admin", departamentos: [] },
  gerente: { plataforma: null, departamentos: [{ departamento: "crm", nivel: "gerente" }] },
  membro: { plataforma: null, departamentos: [{ departamento: "crm", nivel: "membro" }] },
};
const mestraAnterior = process.env.SECRETS_ENCRYPTION_KEY;

let app: INestApplication;
let google: GoogleCalendarFake;
let conexoes: ConexoesEmMemoria;
let eventos: ReturnType<typeof auditoriaEmMemoria>["eventos"];
let segredos: SegredosEmMemoria;

/** `comLimite`: usa o ThrottlerGuard de verdade; sem ele, o guard é liberado para os testes não esbarrarem no teto por IP. */
async function criarApp(comLimite: boolean): Promise<INestApplication> {
  const auditoria = auditoriaEmMemoria();
  eventos = auditoria.eventos;
  const construtor = Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        load: [() => ({ AUTH_ALLOWED_ORIGINS: ORIGEM, AUTH_APP_BASE_URL: ORIGEM })],
      }),
      ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1_000 }]),
    ],
    controllers: [GoogleCalendarController],
    providers: [
      GoogleCalendarService,
      GoogleOAuthCofreService,
      SessionAuthGuard,
      AcessoGuard,
      OriginCheckGuard,
      { provide: SegredoRepository, useValue: segredos },
      { provide: GoogleOAuthLeitura, useValue: new LeituraDeCredenciaisEmMemoria(segredos) },
      { provide: ConexaoGoogleCalendarRepository, useValue: conexoes },
      { provide: GoogleCalendarPort, useValue: google },
      { provide: AuditPort, useValue: auditoria.porta },
      {
        provide: AuthContext,
        useValue: {
          // `x-papel` escolhe o acesso; `x-sessao` a sessão (padrão: uma por papel); `x-ia` simula identidade de IA.
          resolve: async (req: AuthenticatedRequest) => {
            const papel = req.headers["x-papel"];
            const acesso = typeof papel === "string" ? ACESSOS[papel] : undefined;
            if (!acesso) return null;
            if (req.headers["x-ia"]) return { id: `service:${papel}`, kind: "service" as const, acesso };
            req.databaseSessionHash = typeof req.headers["x-sessao"] === "string" ? req.headers["x-sessao"] : `sessao-de-${papel}`;
            return { id: `usuario-${papel}`, kind: "user" as const, acesso };
          },
        },
      },
    ],
  });
  const modulo = await (comLimite ? construtor : construtor.overrideGuard(ThrottlerGuard).useValue({ canActivate: () => true })).compile();
  const criada = modulo.createNestApplication();
  criada.useGlobalFilters(new FiltroGlobalDeExcecoes());
  await criada.init();
  await criada.get(GoogleOAuthCofreService).gravar(CLIENTE, "desenvolvedor");
  return criada;
}

beforeAll(async () => {
  process.env.SECRETS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  segredos = new SegredosEmMemoria();
  conexoes = new ConexoesEmMemoria();
  google = new GoogleCalendarFake();
  app = await criarApp(false);
});

beforeEach(() => {
  conexoes.linhas.clear();
  google.chamadas.length = 0;
  google.tokensRevogados.length = 0;
  google.respostaDaTroca = TOKENS_SINTETICOS;
  google.falhaAoRevogar = null;
  eventos.length = 0;
});

afterAll(async () => {
  await app?.close();
  if (mestraAnterior === undefined) delete process.env.SECRETS_ENCRYPTION_KEY;
  else process.env.SECRETS_ENCRYPTION_KEY = mestraAnterior;
});

const servidor = () => app.getHttpServer();
const como = (papel: string, extra: Record<string, string> = {}) => ({ "x-papel": papel, Origin: ORIGEM, ...extra });

/** Inicia o pedido e devolve o `state` que o Google devolveria ao navegador. */
async function iniciar(papel: string, extra: Record<string, string> = {}): Promise<string> {
  const resposta = await request(servidor()).post("/google/calendar/conexao/autorizacao").set(como(papel, extra)).expect(200);
  return new URL(resposta.body.url).searchParams.get("state")!;
}

describe("quem alcança", () => {
  it("recusa sem sessão em toda rota", async () => {
    await request(servidor()).get("/google/calendar/conexao").expect(401);
    await request(servidor()).post("/google/calendar/conexao/autorizacao").set("Origin", ORIGEM).expect(401);
    await request(servidor()).post("/google/calendar/conexao/retorno").set("Origin", ORIGEM).send({ code: "c", state: "s" }).expect(401);
    await request(servidor()).delete("/google/calendar/conexao").set("Origin", ORIGEM).expect(401);
  });

  it("recusa identidade de IA, que não tem agenda", async () => {
    await request(servidor()).get("/google/calendar/conexao").set("x-papel", "membro").set("x-ia", "1").expect(403);
    await request(servidor()).post("/google/calendar/conexao/autorizacao").set(como("membro", { "x-ia": "1" })).expect(403);
    expect(google.chamadas).toEqual([]);
  });

  it.each(["membro", "gerente", "admin", "desenvolvedor"])("deixa %s ler o estado e conectar a PRÓPRIA agenda", async (papel) => {
    const estado = await request(servidor()).get("/google/calendar/conexao").set("x-papel", papel).expect(200);
    expect(estado.body).toEqual({ disponivel: true, conectado: false, email: null, conectadoEm: null });
    expect(estado.headers["cache-control"]).toBe("no-store");

    const state = await iniciar(papel);
    const concluido = await request(servidor()).post("/google/calendar/conexao/retorno").set(como(papel)).send({ code: "codigo", state }).expect(200);

    expect(concluido.body).toMatchObject({ conectado: true, email: "pessoa@exemplo.test" });
    expect([...conexoes.linhas.keys()]).toEqual([`usuario-${papel}`]);
  });
});

describe("o fluxo", () => {
  it("inicia com o endereço do Google, conclui, informa a conta e desconecta, sem nunca devolver token", async () => {
    const iniciou = await request(servidor()).post("/google/calendar/conexao/autorizacao").set(como("membro")).expect(200);
    const endereco = new URL(iniciou.body.url);
    expect(endereco.origin + endereco.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(endereco.searchParams.get("redirect_uri")).toBe("http://localhost:3000/api/google/calendar/callback");
    expect(iniciou.headers["cache-control"]).toBe("no-store");

    const concluiu = await request(servidor())
      .post("/google/calendar/conexao/retorno")
      .set(como("membro"))
      .send({ code: "codigo", state: endereco.searchParams.get("state") })
      .expect(200);
    expect(concluiu.body).toEqual({ disponivel: true, conectado: true, email: "pessoa@exemplo.test", conectadoEm: expect.any(String) });

    const desconectou = await request(servidor()).delete("/google/calendar/conexao").set(como("membro")).expect(200);
    expect(desconectou.body).toMatchObject({ conectado: false, email: null });
    expect(google.tokensRevogados).toEqual([TOKENS_SINTETICOS.refreshToken]);

    for (const resposta of [iniciou, concluiu, desconectou]) {
      expect(JSON.stringify(resposta.body) + JSON.stringify(resposta.headers)).not.toMatch(/sintetico|GOCSPX/);
    }
    expect(eventos.map((e) => e.eventName)).toEqual(["google.calendar.connected", "google.calendar.disconnected"]);
  });

  it("não conclui com o state de outra pessoa nem com o de outra sessão, e diz a mesma coisa nos dois casos", async () => {
    const stateDoMembro = await iniciar("membro");

    const deOutraPessoa = await request(servidor()).post("/google/calendar/conexao/retorno").set(como("gerente")).send({ code: "c", state: stateDoMembro }).expect(400);
    const deOutraSessao = await request(servidor()).post("/google/calendar/conexao/retorno").set(como("membro", { "x-sessao": "sessao-roubada" })).send({ code: "c", state: stateDoMembro }).expect(400);

    expect(deOutraPessoa.body.mensagem).toBe(deOutraSessao.body.mensagem);
    expect(google.chamadas.some((c) => c.operacao === "trocarCodigo")).toBe(false);
    expect(conexoes.linhas.size).toBe(0);
  });

  it("recusa corpo de retorno incompleto ou com campo sobrando", async () => {
    const retorno = () => request(servidor()).post("/google/calendar/conexao/retorno").set(como("membro"));
    await retorno().send({ code: "c" }).expect(400);
    await retorno().send({ state: "s" }).expect(400);
    await retorno().send({ code: "c", state: "s", extra: "x" }).expect(400);
    expect(google.chamadas).toEqual([]);
  });

  it("responde 400 quando o Google recusa o código e 503 quando está fora do ar", async () => {
    const state = await iniciar("membro");
    google.respostaDaTroca = new GoogleApiError("troca de código", 400, "invalid_grant");
    await request(servidor()).post("/google/calendar/conexao/retorno").set(como("membro")).send({ code: "c", state }).expect(400);

    google.respostaDaTroca = new GoogleApiError("troca de código", null, "rede");
    const fora = await request(servidor()).post("/google/calendar/conexao/retorno").set(como("membro")).send({ code: "c", state }).expect(503);
    expect(JSON.stringify(fora.body)).not.toMatch(/rede|HTTP|google troca/);
  });

  it("desconectar sem conexão é idempotente", async () => {
    await request(servidor()).delete("/google/calendar/conexao").set(como("membro")).expect(200);
    expect(google.chamadas).toEqual([]);
  });
});

describe("origem e isolamento", () => {
  it("exige origem permitida nas mutações e não altera nada quando ela falha", async () => {
    const state = await iniciar("membro");
    const estranha = { "x-papel": "membro", Origin: "https://outro.site" };

    await request(servidor()).post("/google/calendar/conexao/autorizacao").set(estranha).expect(403);
    await request(servidor()).post("/google/calendar/conexao/retorno").set(estranha).send({ code: "c", state }).expect(403);
    await request(servidor()).delete("/google/calendar/conexao").set(estranha).expect(403);
    expect(conexoes.linhas.size).toBe(0);
  });

  it("uma pessoa conecta e a outra continua desconectada, mesmo com papel de plataforma", async () => {
    const state = await iniciar("membro");
    await request(servidor()).post("/google/calendar/conexao/retorno").set(como("membro")).send({ code: "c", state }).expect(200);

    const doDev = await request(servidor()).get("/google/calendar/conexao").set("x-papel", "desenvolvedor").expect(200);
    const doAdmin = await request(servidor()).get("/google/calendar/conexao").set("x-papel", "admin").expect(200);

    expect(doDev.body).toMatchObject({ conectado: false, email: null });
    expect(doAdmin.body).toMatchObject({ conectado: false, email: null });
  });
});

describe("sem as credenciais da plataforma", () => {
  it("o estado diz indisponível e conectar é recusado", async () => {
    const cofre = app.get(GoogleOAuthCofreService);
    await cofre.apagar("desenvolvedor");
    try {
      const estado = await request(servidor()).get("/google/calendar/conexao").set("x-papel", "membro").expect(200);
      expect(estado.body).toMatchObject({ disponivel: false, conectado: false });

      await request(servidor()).post("/google/calendar/conexao/autorizacao").set(como("membro")).expect(409);
    } finally {
      await cofre.gravar(CLIENTE, "desenvolvedor");
    }
  });
});

describe("teto de pedidos", () => {
  it("o início e o retorno do consentimento têm limite por minuto, com o ThrottlerGuard de verdade", async () => {
    const limitada = await criarApp(true);
    try {
      const pedir = () => request(limitada.getHttpServer()).post("/google/calendar/conexao/autorizacao").set(como("membro"));
      for (let i = 0; i < 10; i++) await pedir().expect(200);

      await pedir().expect(429);
    } finally {
      await limitada.close();
    }
  });
});
