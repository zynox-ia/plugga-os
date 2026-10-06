import { Test } from "@nestjs/testing";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module";
import { configureApp } from "../src/configure-app";
import { AuditRepository } from "../src/audit/audit.repository";
import { NullSessionCache } from "../src/core/auth/null-session-cache";
import { SessionCache } from "../src/core/auth/session-cache";
import { SessionLookupRepository } from "../src/core/auth/session-lookup.repository";
import { EmailPort } from "../src/email/email.port";
import { AuthRepository } from "../src/auth/auth.repository";
import { ResetEmailDispatcher } from "../src/auth/reset-email.dispatcher";
import {
  access,
  CapturingEmailPort,
  InMemoryAuthRepository,
  InMemorySessionLookup,
  InMemoryStore,
  NoopAuditRepository,
} from "./support/in-memory-auth";

const SESSION_SECRET = "test_only_session_secret_change_me_please";

describe("auth API (e2e, in-memory stores)", () => {
  let app: NestExpressApplication;
  let store: InMemoryStore;
  let email: CapturingEmailPort;

  const adminEmail = "admin@plugga.local";
  const adminPassword = "correct horse battery staple";

  beforeAll(async () => {
    process.env.AUTH_SESSION_SECRET = SESSION_SECRET;
    store = new InMemoryStore();
    email = new CapturingEmailPort();

    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthRepository)
      .useValue(new InMemoryAuthRepository(store))
      .overrideProvider(SessionLookupRepository)
      .useValue(new InMemorySessionLookup(store))
      .overrideProvider(EmailPort)
      .useValue(email)
      .overrideProvider(AuditRepository)
      .useValue(new NoopAuditRepository())
      // Testes com store em memória não têm Redis de verdade para cachear; sem
      // este override o SessionService.issue() de todo login real bateria na
      // rede à toa (e, fora deste sandbox, pode nem ter Redis alcançável).
      .overrideProvider(SessionCache)
      .useValue(new NullSessionCache())
      .compile();

    app = module.createNestApplication<NestExpressApplication>();
    // The SAME function main.ts calls — not a copy of it. The throttle-tracker
    // tests below therefore exercise the real X-Forwarded-For trust boundary,
    // so removing it from production code turns this suite red (ADR-0012).
    configureApp(app);
    await app.init();
    // Sobe o servidor uma vez e o mantém no ar. Sem isto cada `request.agent()`
    // abre e fecha uma porta efêmera própria; um agente que sobrevive ao
    // fechamento do anterior acaba batendo numa porta já reciclada por outro
    // processo da máquina, e o teste falha com a resposta de um estranho.
    await app.listen(0);
  });

  beforeEach(async () => {
    store.clear();
    email.sent.length = 0;
    email.failNext = false;

    await store.addUser({
      email: adminEmail,
      name: "Administração Local",
      password: adminPassword,
      access: access({ platformRoles: ["admin"] }),
    });
  });

  afterAll(async () => {
    await app.close();
  });

  // Every request without an explicit X-Forwarded-For shares one throttle
  // bucket (see apps/api/src/main.ts's loopback trust). Tests that don't care
  // about IP-specific behavior still each make a real /auth/login call, and
  // collectively they'd exceed the 10-req/60s login limit and start seeing
  // spurious 429s — the same failure mode the ARCHITECT found in the
  // Playwright suite. Give each an independent synthetic IP by default.
  let testIpCounter = 0;

  // O e-mail de redefinição sai fora da requisição (T117): quem confere o que foi
  // enviado espera o envio em segundo plano terminar.
  async function esperarEnvioDoReset() {
    await app.get(ResetEmailDispatcher).aguardarPendentes();
  }

  function nextTestIp(): string {
    testIpCounter += 1;
    return `10.99.0.${testIpCounter}`;
  }

  async function loginAgent(userEmail: string, password: string, ip = nextTestIp()) {
    const agent = request.agent(app.getHttpServer())
      // O navegador sempre manda Origin em mutação; o app web o repassa à API.
      // Mutação com cookie e sem Origin é recusada (T119).
      .set("Origin", "http://localhost:3000");
    const response = await agent
      .post("/auth/login")
      .set("X-Forwarded-For", ip)
      .send({ email: userEmail, password })
      .expect(200);
    return { agent, response };
  }

  it("logs in with a real credential and returns the session user", async () => {
    const { response } = await loginAgent(adminEmail, adminPassword);
    expect(response.body.user).toMatchObject({ email: adminEmail, roles: ["admin"] });
    expect(response.headers["set-cookie"]?.[0]).toContain("plugga_session=");
    expect(response.headers["set-cookie"]?.[0]).toContain("HttpOnly");
  });

  it("rejects a wrong password generically without a cookie", async () => {
    const response = await request(app.getHttpServer())
      .post("/auth/login")
      .set("X-Forwarded-For", nextTestIp())
      .send({ email: adminEmail, password: "wrong-password" })
      .expect(401);
    expect(response.body.message).toBe("invalid credentials");
    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  it("does not consume the login rate-limit bucket on a rejected cross-origin request", async () => {
    // OriginCheckGuard must run before ThrottlerGuard: a request forbidden for
    // a bad Origin should never eat into the 10-req/60s login bucket, or an
    // attacker could exhaust it with disallowed-origin noise alone.
    for (let i = 0; i < 15; i++) {
      await request(app.getHttpServer())
        .post("/auth/login")
        .set("Origin", "https://evil.example.com")
        .send({ email: adminEmail, password: "wrong-password" })
        .expect(403);
    }

    await loginAgent(adminEmail, adminPassword);
  });

  it("nunca recusa quem informa a senha certa, mesmo depois de muitas falhas do mesmo IP (SC-013)", async () => {
    // O limitador antigo respondia 429 a partir da 11ª requisição do IP, certa
    // ou errada: 10 chutes de qualquer um trancavam a vítima fora. Agora quem
    // erra é atrasado e quem acerta entra, de qualquer IP.
    for (let i = 0; i < 12; i++) {
      await request(app.getHttpServer())
        .post("/auth/login")
        .set("X-Forwarded-For", "203.0.113.10")
        .send({ email: adminEmail, password: "wrong-password" })
        .expect(401);
    }
    await request(app.getHttpServer())
      .post("/auth/login")
      .set("X-Forwarded-For", "203.0.113.10")
      .send({ email: adminEmail, password: adminPassword })
      .expect(200);

    await request(app.getHttpServer())
      .post("/auth/login")
      .set("X-Forwarded-For", "203.0.113.20")
      .send({ email: adminEmail, password: adminPassword })
      .expect(200);
  });

  it("falhas contra uma conta com X-Forwarded-For rotativo não impedem outra conta nem a própria com a senha certa", async () => {
    // O contador por conta não depende do IP: trocar de IP a cada tentativa não
    // zera o progresso contra a conta alvo (o atraso cresce), mas a recusa nunca
    // acontece (veja login-abuso.e2e.spec.ts para o atraso medido).
    for (let i = 0; i < 30; i++) {
      await request(app.getHttpServer())
        .post("/auth/login")
        .set("X-Forwarded-For", `198.51.100.${i + 1}`)
        .send({ email: adminEmail, password: "wrong-password" })
        .expect(401);
    }

    await store.addUser({ email: "outra@plugga.local", password: "outra senha longa", access: access() });
    await loginAgent("outra@plugga.local", "outra senha longa");
    await loginAgent(adminEmail, adminPassword);
  });

  it("rejects /auth/me without a session cookie", async () => {
    await request(app.getHttpServer()).get("/auth/me").expect(401);
  });

  it("resolves /auth/me from the session cookie and revokes on logout", async () => {
    const { agent, response } = await loginAgent(adminEmail, adminPassword);
    const rawSetCookie = response.headers["set-cookie"]?.[0];
    expect(rawSetCookie).toBeDefined();
    // Capture the opaque session cookie before logout clears the agent jar.
    const rawCookieHeader = String(rawSetCookie).split(";")[0];

    const me = await agent.get("/auth/me").expect(200);
    expect(me.body.email).toBe(adminEmail);
    expect(store.sessions.size).toBe(1);

    await agent.post("/auth/logout").expect(200, { ok: true });
    expect(store.sessions.size).toBe(0);

    // Client jar cleared — and replaying the captured cookie must also 401
    // (server-side revoke). Cookie-clear alone must not make this test green.
    await agent.get("/auth/me").expect(401);
    await request(app.getHttpServer())
      .get("/auth/me")
      .set("Cookie", rawCookieHeader ?? "")
      .expect(401);
  });

  it("recusa mutação autenticada por cookie sem Origin, mas deixa leitura e fluxo sem cookie passarem (T119)", async () => {
    const { response } = await loginAgent(adminEmail, adminPassword);
    const cookie = String(response.headers["set-cookie"]?.[0]).split(";")[0] ?? "";

    // Mutação + cookie + sem Origin: não é o navegador do app.
    await request(app.getHttpServer()).post("/auth/logout").set("Cookie", cookie).expect(403);
    await request(app.getHttpServer()).post("/agent-actions").set("Cookie", cookie).send({}).expect(403);
    // Origin de fora também é recusada em /agent-actions (OriginCheckGuard passou a valer lá).
    await request(app.getHttpServer())
      .post("/agent-actions")
      .set("Cookie", cookie)
      .set("Origin", "https://evil.example.com")
      .send({})
      .expect(403);

    // Leitura com cookie e sem Origin segue valendo; o servidor-a-servidor sem cookie também.
    await request(app.getHttpServer()).get("/auth/me").set("Cookie", cookie).expect(200);
    await request(app.getHttpServer())
      .post("/auth/reset/request")
      .set("X-Forwarded-For", nextTestIp())
      .send({ email: "nobody@plugga.local" })
      .expect(200);
    await esperarEnvioDoReset();
  });

  it("lets an admin invite a user who then accepts and logs in", async () => {
    const { agent } = await loginAgent(adminEmail, adminPassword);
    const invited = await agent
      .post("/auth/invite")
      .send({
        email: "opm@plugga.local",
        name: "OPM",
        access: {
          platformRoles: [],
          companies: [
            {
              companyId: "plugga",
              roles: ["opm"],
              departments: [{ departmentId: "energia-opm", isManager: false }],
            },
          ],
        },
      })
      .expect(201);
    expect(invited.body).toMatchObject({ email: "opm@plugga.local", status: "invited", roles: ["opm"] });

    // Cannot log in before accepting (no credential, not active).
    await request(app.getHttpServer())
      .post("/auth/login")
      .set("X-Forwarded-For", nextTestIp())
      .send({ email: "opm@plugga.local", password: "brand new password" })
      .expect(401);

    const inviteToken = email.lastTokenFor("invite");
    await request(app.getHttpServer())
      .post("/auth/accept-invite")
      .send({ token: inviteToken, password: "brand new password" })
      .expect(200, { ok: true });

    const { response } = await loginAgent("opm@plugga.local", "brand new password");
    expect(response.body.user).toMatchObject({ email: "opm@plugga.local", roles: ["opm"] });
  });

  it("forbids a plain member from the team endpoints", async () => {
    await store.addUser({
      email: "viewer@plugga.local",
      name: "Viewer",
      password: "viewer password here",
      access: access({
        companies: [
          {
            companyId: "plugga",
            roles: ["viewer"],
            departments: [{ departmentId: "financeiro", isManager: false }],
          },
        ],
      }),
    });

    const { agent } = await loginAgent("viewer@plugga.local", "viewer password here");
    await agent.get("/auth/users").expect(403);
    await agent
      .post("/auth/invite")
      .send({
        email: "x@plugga.local",
        name: "X",
        access: {
          platformRoles: [],
          companies: [
            {
              companyId: "plugga",
              roles: ["viewer"],
              departments: [{ departmentId: "financeiro", isManager: false }],
            },
          ],
        },
      })
      .expect(403);
  });

  it("reset confirm changes the password and revokes existing sessions", async () => {
    const { agent } = await loginAgent(adminEmail, adminPassword);
    await agent.get("/auth/me").expect(200);

    await request(app.getHttpServer())
      .post("/auth/reset/request")
      .set("x-forwarded-for", "198.51.100.19")
      .send({ email: adminEmail })
      .expect(200, { ok: true });
    await esperarEnvioDoReset();

    const resetToken = email.lastTokenFor("reset");
    await request(app.getHttpServer())
      .post("/auth/reset/confirm")
      .send({ token: resetToken, password: "a fresh admin password" })
      .expect(200, { ok: true });

    // Old session is revoked.
    await agent.get("/auth/me").expect(401);
    // New password works.
    await loginAgent(adminEmail, "a fresh admin password");
  });

  it("invalidates the previous reset link when a newer one is requested", async () => {
    await request(app.getHttpServer())
      .post("/auth/reset/request")
      .set("x-forwarded-for", "198.51.100.19")
      .send({ email: adminEmail })
      .expect(200, { ok: true });
    await esperarEnvioDoReset();
    const previousToken = email.lastTokenFor("reset");

    await request(app.getHttpServer())
      .post("/auth/reset/request")
      .set("x-forwarded-for", "198.51.100.19")
      .send({ email: adminEmail })
      .expect(200, { ok: true });
    await esperarEnvioDoReset();
    const currentToken = email.lastTokenFor("reset");

    expect(currentToken).not.toBe(previousToken);
    await request(app.getHttpServer())
      .post("/auth/reset/confirm")
      .send({ token: previousToken, password: "a fresh admin password" })
      .expect(400);
    await request(app.getHttpServer())
      .post("/auth/reset/confirm")
      .send({ token: currentToken, password: "a fresh admin password" })
      .expect(200, { ok: true });
  });

  it("answers reset requests for unknown emails generically", async () => {
    await request(app.getHttpServer())
      .post("/auth/reset/request")
      .send({ email: "nobody@plugga.local" })
      .expect(200, { ok: true });
    await esperarEnvioDoReset();
    expect(email.sent).toHaveLength(0);
  });

  it("keeps reset acknowledgement generic when email delivery fails for a known account", async () => {
    // Without the try/catch on reset, a throwing provider returns 500 for known
    // accounts and 200 for unknown ones — an account-existence oracle (F1).
    email.failNext = true;

    await request(app.getHttpServer())
      .post("/auth/reset/request")
      .send({ email: adminEmail })
      .expect(200, { ok: true });
    await esperarEnvioDoReset();

    await request(app.getHttpServer())
      .post("/auth/reset/request")
      .send({ email: "nobody@plugga.local" })
      .expect(200, { ok: true });
    await esperarEnvioDoReset();

    expect(email.sent).toHaveLength(0);
  });
});
