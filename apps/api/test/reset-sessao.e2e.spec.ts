import { flattenRoles } from "@plugga/shared";
import { Test } from "@nestjs/testing";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module";
import { AuditPort } from "../src/audit/audit.port";
import { AuthRepository } from "../src/auth/auth.repository";
import type { AuthPrincipal } from "../src/core/auth/auth.types";
import { SessionCache, type SessionCacheEntry } from "../src/core/auth/session-cache";
import {
  SessionLookupRepository,
  type SessionLookupContext,
} from "../src/core/auth/session-lookup.repository";
import { generateOpaqueToken, hashToken } from "../src/core/auth/token.util";
import { configureApp } from "../src/configure-app";
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
 * SC-014 / FR-048: uma sessão antiga deixa de valer em menos de 5 segundos
 * depois da redefinição de senha — INCLUSIVE a que está no cache de sessão.
 *
 * Os dublês anteriores usavam `NullSessionCache`, que esconde exatamente o
 * defeito: o Postgres perdia as sessões, mas a entrada do cache seguia valendo
 * até o TTL. Aqui o cache é de verdade (em memória, sem expirar sozinho: se a
 * invalidação não acontecer, a sessão antiga entra para sempre e o teste cai).
 */

class CacheDeSessaoEmMemoria extends SessionCache {
  readonly entradas = new Map<string, { userId: string; entry: SessionCacheEntry }>();

  async get(tokenHash: string): Promise<SessionCacheEntry | null> {
    return this.entradas.get(tokenHash)?.entry ?? null;
  }

  async set(tokenHash: string, userId: string, entry: SessionCacheEntry): Promise<void> {
    this.entradas.set(tokenHash, { userId, entry });
  }

  async invalidate(tokenHash: string): Promise<void> {
    this.entradas.delete(tokenHash);
  }

  async invalidateAllForUser(userId: string): Promise<void> {
    for (const [hash, valor] of this.entradas) {
      if (valor.userId === userId) this.entradas.delete(hash);
    }
  }
}

/** Mesma ordem do `PrismaSessionLookupRepository`: cache primeiro, depois o armazenamento. */
class LookupComCache extends SessionLookupRepository {
  constructor(
    private readonly store: InMemoryStore,
    private readonly cache: SessionCache,
    private readonly inner = new InMemorySessionLookup(store),
  ) {
    super();
  }

  async resolvePrincipal(tokenHash: string, context: SessionLookupContext): Promise<AuthPrincipal | null> {
    const cached = await this.cache.get(tokenHash);
    if (cached) {
      return { id: cached.user.id, kind: "user", roles: flattenRoles(cached.user.access) };
    }
    const principal = await this.inner.resolvePrincipal(tokenHash, context);
    const user = principal ? this.store.users.get(principal.id) : undefined;
    if (principal && user) {
      await this.cache.set(tokenHash, user.id, {
        user: { id: user.id, email: user.email, name: user.name, status: user.status, access: user.access },
      }, 60);
    }
    return principal;
  }
}

describe("redefinição de senha derruba as sessões, inclusive as do cache (e2e)", () => {
  let app: NestExpressApplication;
  let store: InMemoryStore;
  let cache: CacheDeSessaoEmMemoria;
  let repository: InMemoryAuthRepository;

  const emailAdmin = "admin@plugga.local";
  const senhaAdmin = "senha atual do administrador";
  const novaSenha = "uma senha nova e longa";

  beforeAll(async () => {
    store = new InMemoryStore();
    cache = new CacheDeSessaoEmMemoria();
    repository = new InMemoryAuthRepository(store);

    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthRepository)
      .useValue(repository)
      .overrideProvider(SessionCache)
      .useValue(cache)
      .overrideProvider(SessionLookupRepository)
      .useValue(new LookupComCache(store, cache))
      .overrideProvider(EmailPort)
      .useValue(new CapturingEmailPort())
      .overrideProvider(AuditPort)
      .useValue(new NoopAuditRepository())
      .compile();

    app = module.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    await app.listen(0);
  });

  afterAll(async () => {
    await app.close();
  });

  let ipCounter = 0;
  beforeEach(async () => {
    store.clear();
    cache.entradas.clear();
    await store.addUser({
      email: emailAdmin,
      name: "Administração",
      password: senhaAdmin,
      access: access({ platformRoles: ["admin"] }),
    });
  });

  async function entrar(): Promise<{ cookie: string }> {
    ipCounter += 1;
    const resposta = await request(app.getHttpServer())
      .post("/auth/login")
      .set("X-Forwarded-For", `10.77.0.${ipCounter}`)
      .send({ email: emailAdmin, password: senhaAdmin })
      .expect(200);
    return { cookie: String(resposta.headers["set-cookie"]?.[0]).split(";")[0] ?? "" };
  }

  async function emitirTokenDeReset(): Promise<string> {
    const usuario = store.userByEmail(emailAdmin);
    const bruto = generateOpaqueToken();
    await repository.replaceAuthToken({
      userId: usuario!.id,
      type: "reset",
      tokenHash: hashToken(bruto),
      expiresAt: new Date(Date.now() + 60_000),
    });
    return bruto;
  }

  it("a sessão antiga, mesmo cacheada, é recusada em menos de 5 segundos (SC-014)", async () => {
    const dispositivo1 = await entrar();
    const dispositivo2 = await entrar();

    // Pré-condição que importa: as duas sessões estão NO CACHE e valem.
    await request(app.getHttpServer()).get("/auth/me").set("Cookie", dispositivo1.cookie).expect(200);
    await request(app.getHttpServer()).get("/auth/me").set("Cookie", dispositivo2.cookie).expect(200);
    expect(cache.entradas.size).toBeGreaterThanOrEqual(2);

    const token = await emitirTokenDeReset();
    await request(app.getHttpServer())
      .post("/auth/reset/confirm")
      .send({ token, password: novaSenha })
      .expect(200, { ok: true });
    const inicio = Date.now();

    // Recusada já na primeira leitura depois da resposta; o teto de 5 s é o
    // critério de aceite, não o que se espera.
    for (const { cookie } of [dispositivo1, dispositivo2]) {
      let recusada = false;
      while (!recusada && Date.now() - inicio < 5_000) {
        const resposta = await request(app.getHttpServer()).get("/auth/me").set("Cookie", cookie);
        recusada = resposta.status === 401;
        if (!recusada) await new Promise((r) => setTimeout(r, 100));
      }
      expect(recusada, "a sessão antiga deveria ter sido recusada").toBe(true);
    }
    expect(Date.now() - inicio).toBeLessThan(5_000);

    // O cache do usuário foi limpo, e as sessões do armazenamento também.
    expect(cache.entradas.size).toBe(0);
    expect(store.sessions.size).toBe(0);

    // A senha nova funciona; a antiga não.
    ipCounter += 1;
    await request(app.getHttpServer())
      .post("/auth/login")
      .set("X-Forwarded-For", `10.77.1.${ipCounter}`)
      .send({ email: emailAdmin, password: novaSenha })
      .expect(200);
    await request(app.getHttpServer())
      .post("/auth/login")
      .set("X-Forwarded-For", `10.77.2.${ipCounter}`)
      .send({ email: emailAdmin, password: senhaAdmin })
      .expect(401);
  }, 15_000);

  it("um token de redefinição inválido não derruba nenhuma sessão", async () => {
    const { cookie } = await entrar();
    await request(app.getHttpServer())
      .post("/auth/reset/confirm")
      .send({ token: generateOpaqueToken(), password: novaSenha })
      .expect(400);
    await request(app.getHttpServer()).get("/auth/me").set("Cookie", cookie).expect(200);
  });
});
