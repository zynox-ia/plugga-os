import { Test } from "@nestjs/testing";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module";
import { configureApp } from "../src/configure-app";
import { AuditRepository } from "../src/audit/audit.repository";
import { SessionLookupRepository } from "../src/core/auth/session-lookup.repository";
import { EmailPort } from "../src/email/email.port";
import { AuthRepository } from "../src/auth/auth.repository";
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
  function nextTestIp(): string {
    testIpCounter += 1;
    return `10.99.0.${testIpCounter}`;
  }

  async function loginAgent(userEmail: string, password: string, ip = nextTestIp()) {
    const agent = request.agent(app.getHttpServer());
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

  it("does not share the login rate-limit bucket across different forwarded client IPs", async () => {
    // The API only sees the web app's loopback connection; per-IP throttling
    // depends on X-Forwarded-For carrying the real client address (see
    // apps/web/app/lib/auth-proxy.ts). Without that, every caller collapses
    // into one shared bucket and one bad actor can lock everyone out.
    for (let i = 0; i < 10; i++) {
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
      .expect(429);

    await request(app.getHttpServer())
      .post("/auth/login")
      .set("X-Forwarded-For", "203.0.113.20")
      .send({ email: adminEmail, password: adminPassword })
      .expect(200);
  });

  it("caps failed login attempts per email even when X-Forwarded-For rotates every request", async () => {
    // The (email, IP) lock in LockoutService alone is bypassable: an attacker
    // who sends a fresh X-Forwarded-For on every request gets a fresh lock key
    // each time, so per-IP locking never engages. This email-only cap (stacked
    // on top of, not instead of, the (email, IP) lock) closes that gap.
    const targetEmail = "brute-force-target@plugga.local";

    for (let i = 0; i < 30; i++) {
      await request(app.getHttpServer())
        .post("/auth/login")
        .set("X-Forwarded-For", `198.51.100.${i + 1}`)
        .send({ email: targetEmail, password: "wrong-password" })
        .expect(401);
    }

    // 31st attempt, yet another fresh IP: still rejected purely on the email cap.
    await request(app.getHttpServer())
      .post("/auth/login")
      .set("X-Forwarded-For", "198.51.100.200")
      .send({ email: targetEmail, password: "wrong-password" })
      .expect(401);

    // A different account is entirely unaffected by targetEmail's cap.
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
      .set("Cookie", rawCookieHeader)
      .expect(401);
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
      .send({ email: adminEmail })
      .expect(200, { ok: true });

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

  it("answers reset requests for unknown emails generically", async () => {
    await request(app.getHttpServer())
      .post("/auth/reset/request")
      .send({ email: "nobody@plugga.local" })
      .expect(200, { ok: true });
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

    await request(app.getHttpServer())
      .post("/auth/reset/request")
      .send({ email: "nobody@plugga.local" })
      .expect(200, { ok: true });

    expect(email.sent).toHaveLength(0);
  });
});
