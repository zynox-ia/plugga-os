import { randomBytes } from "node:crypto";

import type { INestApplication } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { ThrottlerModule } from "@nestjs/throttler";
import type { Acesso } from "@plugga/shared";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AuditPort } from "../audit/audit.port";
import { FiltroGlobalDeExcecoes } from "../common/errors/filtro-global";
import { AcessoGuard } from "../core/auth/acesso.guard";
import { AuthContext, type AuthenticatedRequest } from "../core/auth/auth.types";
import { OriginCheckGuard } from "../core/auth/origin-check.guard";
import { SessionAuthGuard } from "../core/auth/session-auth.guard";
import { SegredoRepository, type GravarSegredo, type SegredoGuardado } from "../llm/segredo.repository.js";
import { GoogleOAuthCofreService, GoogleOAuthLeitura, type MaterialCifrado } from "./google-oauth-cofre.service";
import { GoogleOAuthController } from "./google-oauth.controller";

/**
 * As credenciais do Google pela API, com os guards de verdade (sessão, acesso e
 * origem). O que se prova: só o desenvolvedor chega; todo o resto recebe 403
 * (e sem sessão, 401); a resposta nunca carrega o client secret.
 */

class RepositorioEmMemoria extends SegredoRepository {
  linha: SegredoGuardado | null = null;
  async buscar(): Promise<SegredoGuardado | null> {
    return this.linha;
  }
  async gravar(dados: GravarSegredo): Promise<void> {
    this.linha = { ...dados, atualizadoEm: new Date("2026-11-13T10:00:00Z") };
  }
  async apagar(): Promise<void> {
    this.linha = null;
  }
}

class LeituraEmMemoria extends GoogleOAuthLeitura {
  constructor(private readonly repositorio: RepositorioEmMemoria) {
    super();
  }
  async lerCifrado(): Promise<MaterialCifrado | null> {
    const l = this.repositorio.linha;
    return l ? { valorCifrado: l.valorCifrado, iv: l.iv, tag: l.tag } : null;
  }
}

const ACESSOS: Record<string, Acesso> = {
  desenvolvedor: { plataforma: "desenvolvedor", departamentos: [] },
  admin: { plataforma: "admin", departamentos: [] },
  gerente: { plataforma: null, departamentos: [{ departamento: "crm", nivel: "gerente" }] },
  membro: { plataforma: null, departamentos: [{ departamento: "crm", nivel: "membro" }] },
};

const ORIGEM = "http://localhost:3000";
const CORPO = { clientId: "1234567890-abcdefg.apps.googleusercontent.com", clientSecret: "GOCSPX-segredo-sintetico-9z8y" };
const SEGREDO = "GOCSPX-segredo-sintetico-9z8y";
const mestraAnterior = process.env.SECRETS_ENCRYPTION_KEY;

let app: INestApplication;
let repositorio: RepositorioEmMemoria;
const auditoria = { appendEvent: vi.fn(async () => undefined), appendTrail: vi.fn() };

beforeAll(async () => {
  repositorio = new RepositorioEmMemoria();
  const modulo = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => ({ AUTH_ALLOWED_ORIGINS: ORIGEM })] }),
      ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1_000 }]),
    ],
    controllers: [GoogleOAuthController],
    providers: [
      GoogleOAuthCofreService,
      SessionAuthGuard,
      AcessoGuard,
      OriginCheckGuard,
      { provide: SegredoRepository, useValue: repositorio },
      { provide: GoogleOAuthLeitura, useValue: new LeituraEmMemoria(repositorio) },
      { provide: AuditPort, useValue: auditoria },
      {
        provide: AuthContext,
        useValue: {
          // O papel vem do cabeçalho; sem ele, não há sessão.
          resolve: async (req: AuthenticatedRequest) => {
            const papel = req.headers["x-papel"];
            const acesso = typeof papel === "string" ? ACESSOS[papel] : undefined;
            return acesso ? { id: `usuario-${papel}`, kind: "user" as const, acesso } : null;
          },
        },
      },
    ],
  }).compile();
  app = modulo.createNestApplication();
  app.useGlobalFilters(new FiltroGlobalDeExcecoes());
  await app.init();
});

beforeEach(() => {
  process.env.SECRETS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  repositorio.linha = null;
  auditoria.appendEvent.mockClear();
});

afterEach(() => {
  if (mestraAnterior === undefined) delete process.env.SECRETS_ENCRYPTION_KEY;
  else process.env.SECRETS_ENCRYPTION_KEY = mestraAnterior;
});

afterAll(async () => app?.close());

const servidor = () => app.getHttpServer();

describe("/google/oauth: quem alcança", () => {
  it("recusa sem sessão", async () => {
    await request(servidor()).get("/google/oauth").expect(401);
    await request(servidor()).put("/google/oauth").set("Origin", ORIGEM).send(CORPO).expect(401);
  });

  it.each(["admin", "gerente", "membro"])("devolve 403 a %s em toda operação, sem tocar no cofre", async (papel) => {
    await request(servidor()).get("/google/oauth").set("x-papel", papel).expect(403);
    await request(servidor()).put("/google/oauth").set("x-papel", papel).set("Origin", ORIGEM).send(CORPO).expect(403);
    await request(servidor()).delete("/google/oauth").set("x-papel", papel).set("Origin", ORIGEM).expect(403);
    expect(repositorio.linha).toBeNull();
    expect(auditoria.appendEvent).not.toHaveBeenCalled();
  });

  it("deixa o desenvolvedor ler o estado, com a URI de retorno e os escopos", async () => {
    const resposta = await request(servidor()).get("/google/oauth").set("x-papel", "desenvolvedor").expect(200);

    expect(resposta.body).toMatchObject({
      conectado: false,
      origem: "nenhuma",
      cofreConfigurado: true,
      urlDeRetorno: "http://localhost:3000/api/google/calendar/callback",
    });
    expect(resposta.body.escopos).toContain("https://www.googleapis.com/auth/calendar.events");
    expect(resposta.headers["cache-control"]).toBe("no-store");
  });
});

describe("/google/oauth: gravar e apagar", () => {
  it("grava cifrado, audita e nunca devolve o secret", async () => {
    const resposta = await request(servidor())
      .put("/google/oauth")
      .set("x-papel", "desenvolvedor")
      .set("Origin", ORIGEM)
      .send(CORPO)
      .expect(200);

    expect(resposta.body).toMatchObject({ conectado: true, clientId: CORPO.clientId, mascara: "••••9z8y" });
    expect(JSON.stringify(resposta.body)).not.toContain("segredo-sintetico");
    expect(repositorio.linha?.valorCifrado).not.toContain("GOCSPX");

    const lido = await request(servidor()).get("/google/oauth").set("x-papel", "desenvolvedor").expect(200);
    expect(JSON.stringify(lido.body)).not.toContain(SEGREDO);
    expect(auditoria.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "google.oauth.connected", actorId: "usuario-desenvolvedor" }),
    );
  });

  it("exige origem permitida nas mutações", async () => {
    await request(servidor()).put("/google/oauth").set("x-papel", "desenvolvedor").set("Origin", "https://outro.site").send(CORPO).expect(403);
    expect(repositorio.linha).toBeNull();
  });

  it("recusa corpo inválido e campo sobrando", async () => {
    const dev = () => request(servidor()).put("/google/oauth").set("x-papel", "desenvolvedor").set("Origin", ORIGEM);
    await dev().send({ clientId: "abc", clientSecret: "curto" }).expect(400);
    await dev().send({ ...CORPO, extra: "x" }).expect(400);
    await dev().send({ clientId: "1234-x.apps.googleusercontent.com" }).expect(400);
    expect(repositorio.linha).toBeNull();
  });

  it("responde 503 quando o cofre não tem chave-mestra, sem gravar", async () => {
    delete process.env.SECRETS_ENCRYPTION_KEY;

    await request(servidor()).put("/google/oauth").set("x-papel", "desenvolvedor").set("Origin", ORIGEM).send(CORPO).expect(503);
    expect(repositorio.linha).toBeNull();
  });

  it("desconecta: apaga e audita", async () => {
    await request(servidor()).put("/google/oauth").set("x-papel", "desenvolvedor").set("Origin", ORIGEM).send(CORPO).expect(200);

    const resposta = await request(servidor()).delete("/google/oauth").set("x-papel", "desenvolvedor").set("Origin", ORIGEM).expect(200);

    expect(resposta.body).toMatchObject({ conectado: false, origem: "nenhuma" });
    expect(repositorio.linha).toBeNull();
    expect(auditoria.appendEvent).toHaveBeenLastCalledWith(expect.objectContaining({ eventName: "google.oauth.disconnected" }));
  });
});
