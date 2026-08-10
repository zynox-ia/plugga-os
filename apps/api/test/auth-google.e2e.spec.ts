// Precisa ser o PRIMEIRO import: liga a flag antes de `app.module` ser
// avaliado, que é quando o ConfigModule congela o ambiente validado.
import "./support/google-env";

import { eventNames } from "@plugga/shared";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { GoogleVerificationError } from "../src/auth/google-identity.verifier";
import { hashToken } from "../src/core/auth/token.util";
import {
  bootGoogleHarness,
  defaultClaims,
  GOOGLE_CREDENTIAL,
  GOOGLE_CSRF,
  nextTestIp,
  postGoogle,
  type GoogleHarness,
} from "./support/google-auth-harness";
import { access, InMemoryAuthRepository } from "./support/in-memory-auth";

describe("google login API (e2e, in-memory stores)", () => {
  let harness: GoogleHarness;

  beforeAll(async () => {
    harness = await bootGoogleHarness();
  });

  beforeEach(() => {
    harness.store.clear();
    harness.audit.events.length = 0;
    harness.verifier.calls = 0;
    harness.verifier.failure = null;
    harness.verifier.claims = { ...defaultClaims };
  });

  afterAll(async () => {
    await harness.app.close();
  });

  const post = (options?: Parameters<typeof postGoogle>[1]) => postGoogle(harness.app, options);

  async function addActive(email: string, subject?: string) {
    const user = await harness.store.addUser({
      email,
      name: "Pessoa",
      access: access({ platformRoles: ["admin"] }),
    });
    if (subject) {
      harness.store.identities.set(subject, {
        id: subject,
        userId: user.id,
        provider: "google",
        subject,
        emailAtLink: email,
        lastObservedEmail: email,
        hostedDomain: null,
      });
    }
    return user;
  }

  it("logs an active user in and returns the same session cookie as password login", async () => {
    const user = await addActive("pessoa@gmail.com");

    const response = await post().expect(200);

    expect(response.body.user).toMatchObject({ id: user.id, email: "pessoa@gmail.com" });
    expect(response.headers["set-cookie"]?.[0]).toContain("plugga_session=");
    expect(response.headers["set-cookie"]?.[0]).toContain("HttpOnly");
    expect(harness.store.identityFor(user.id)?.subject).toBe("google-sub-1");
  });

  it("accepts the session it issued on /auth/me and revokes it on logout", async () => {
    await addActive("pessoa@gmail.com");

    const agent = request.agent(harness.app.getHttpServer());
    await agent
      .post("/auth/google")
      .set("X-Forwarded-For", nextTestIp())
      .set("Cookie", `g_csrf_token=${GOOGLE_CSRF}`)
      .type("form")
      .send({ credential: GOOGLE_CREDENTIAL, g_csrf_token: GOOGLE_CSRF })
      .expect(200);

    const me = await agent.get("/auth/me").expect(200);
    expect(me.body.email).toBe("pessoa@gmail.com");

    await agent.post("/auth/logout").expect(200, { ok: true });
    expect(harness.store.sessions.size).toBe(0);
    await agent.get("/auth/me").expect(401);
  });

  it("activates an invited user and burns the pending invite token", async () => {
    const user = await harness.store.addUser({
      email: "convidada@plugga.com.br",
      name: "Convidada",
      status: "invited",
      access: access({ platformRoles: ["admin"] }),
    });
    // Convite emitido antes; depois do login Google ele não pode mais valer.
    await new InMemoryAuthRepository(harness.store).createAuthToken({
      userId: user.id,
      type: "invite",
      tokenHash: hashToken("raw-invite-token"),
      expiresAt: new Date(Date.now() + 3_600_000),
    });
    harness.verifier.claims = {
      subject: "google-sub-workspace",
      email: "convidada@plugga.com.br",
      emailVerified: true,
      hostedDomain: "plugga.com.br",
    };

    const response = await post().expect(200);

    expect(response.body.user.status).toBe("active");
    expect(harness.store.users.get(user.id)?.status).toBe("active");
    expect([...harness.store.tokens.values()].every((token) => token.consumedAt !== null)).toBe(
      true,
    );
    expect(harness.audit.events.map((event) => event.eventName)).toContain(
      eventNames.authGoogleIdentityLinked,
    );
  });

  it("refuses a Google account whose e-mail Google does not own", async () => {
    // Conta Google criada sobre e-mail de terceiro: `email_verified` fica true
    // para sempre, mas a prova pode ser de anos atrás. Entra por senha, não aqui.
    await addActive("pessoa@outracoisa.com.br");
    harness.verifier.claims = {
      subject: "google-sub-externo",
      email: "pessoa@outracoisa.com.br",
      emailVerified: true,
      hostedDomain: null,
    };

    const response = await post().expect(401);

    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(response.body.code).toBe("unauthorized");
    expect(harness.store.identities.size).toBe(0);
  });

  it("never creates an account for an unknown e-mail", async () => {
    const response = await post().expect(401);

    expect(response.body.code).toBe("unauthorized");
    expect(harness.store.users.size).toBe(0);
    expect(harness.store.sessions.size).toBe(0);
  });

  it("refuses a disabled user even with a perfectly valid Google token", async () => {
    const user = await addActive("pessoa@gmail.com", "google-sub-1");
    harness.store.users.get(user.id)!.status = "disabled";

    await post().expect(401);
    expect(harness.store.sessions.size).toBe(0);
  });

  it("does not hand one person's account to another person's Google account", async () => {
    await addActive("primeira@gmail.com", "google-sub-1");
    await addActive("segunda@gmail.com");
    harness.verifier.claims = {
      subject: "google-sub-2",
      email: "primeira@gmail.com",
      emailVerified: true,
      hostedDomain: null,
    };

    // A primeira pessoa já tem OUTRO `sub`; um segundo vínculo é recusado.
    const response = await post().expect(401);
    expect(response.body.code).toBe("unauthorized");
    expect(harness.store.identities.size).toBe(1);
  });

  it("keeps following the sub when the Google e-mail changes", async () => {
    const user = await addActive("antigo@gmail.com", "google-sub-1");
    harness.verifier.claims = {
      subject: "google-sub-1",
      email: "novo@gmail.com",
      emailVerified: true,
      hostedDomain: null,
    };

    const response = await post().expect(200);

    expect(response.body.user.id).toBe(user.id);
    // O e-mail local NÃO é reescrito pelas claims; só o observado muda.
    expect(harness.store.users.get(user.id)?.email).toBe("antigo@gmail.com");
    expect(harness.store.identityFor(user.id)?.lastObservedEmail).toBe("novo@gmail.com");
  });

  it("refuses when the new Google e-mail now belongs to a different local user", async () => {
    const dono = await addActive("dono@gmail.com", "google-sub-1");
    await addActive("outra@gmail.com");
    harness.verifier.claims = {
      subject: "google-sub-1",
      email: "outra@gmail.com",
      emailVerified: true,
      hostedDomain: null,
    };

    await post().expect(401);
    expect(harness.store.identityFor(dono.id)?.lastObservedEmail).toBe("dono@gmail.com");
  });

  it("refuses an unverified e-mail", async () => {
    await addActive("pessoa@gmail.com");
    harness.verifier.claims = { ...harness.verifier.claims, emailVerified: false };

    await post().expect(401);
    expect(harness.store.identities.size).toBe(0);
  });

  it("rejects a mismatched or missing CSRF token before verifying anything", async () => {
    await addActive("pessoa@gmail.com");

    await post({ cookieCsrf: "outro-valor" }).expect(401);
    await post({ cookieCsrf: null }).expect(401);
    // O ponto do teste: a verificação criptográfica nem chegou a ser tentada.
    expect(harness.verifier.calls).toBe(0);
    expect(harness.store.sessions.size).toBe(0);
  });

  it("answers 503 without a cookie when Google verification is unavailable", async () => {
    await addActive("pessoa@gmail.com");
    harness.verifier.failure = new GoogleVerificationError("unavailable", "jwks unreachable");

    const response = await post().expect(503);

    expect(response.body.code).toBe("unavailable");
    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  it("rejects an invalid credential", async () => {
    await addActive("pessoa@gmail.com");
    const response = await post({ credential: "forjado" }).expect(401);
    expect(response.body.code).toBe("unauthorized");
  });

  it("caps attempts per IP like the password login does", async () => {
    const ip = "203.0.114.9";
    for (let i = 0; i < 10; i += 1) {
      await post({ credential: "forjado", ip }).expect(401);
    }
    await post({ ip }).expect(429);

    // Outro IP não paga pelo primeiro.
    await addActive("pessoa@gmail.com");
    await post().expect(200);
  });

  it("audits method and reason and never the token or the Google subject", async () => {
    await addActive("pessoa@gmail.com");
    await post().expect(200);
    await post({ credential: "forjado" }).expect(401);

    const sucesso = harness.audit.events.find(
      (event) => event.eventName === eventNames.authLoginSucceeded,
    );
    const falha = harness.audit.events.find(
      (event) => event.eventName === eventNames.authLoginFailed,
    );
    expect(sucesso?.payload).toMatchObject({ method: "google" });
    expect(falha?.payload).toMatchObject({ method: "google", reason: "invalid_token" });

    const serializado = JSON.stringify(harness.audit.events);
    expect(serializado).not.toContain(GOOGLE_CREDENTIAL);
    expect(serializado).not.toContain("google-sub-1");
  });
});
