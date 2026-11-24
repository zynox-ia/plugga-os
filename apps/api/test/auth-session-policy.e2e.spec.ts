import "./support/google-env";

import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  bootGoogleHarness,
  GOOGLE_CREDENTIAL,
  GOOGLE_CSRF,
  nextTestIp,
  type GoogleHarness,
} from "./support/google-auth-harness";

const LOGIN_AT = new Date("2026-11-09T12:00:00Z");
const EMAIL = "pessoa@gmail.com";
const PASSWORD = "senha sintética de teste";
const HOUR = 3_600_000;

describe("PLU-311: preferência de duração no login", () => {
  let harness: GoogleHarness;

  beforeAll(async () => { harness = await bootGoogleHarness(); });
  beforeEach(async () => {
    harness.store.clear();
    harness.verifier.calls = 0;
    await harness.store.addUser({ email: EMAIL, password: PASSWORD });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(LOGIN_AT);
  });
  afterEach(() => vi.useRealTimers());
  afterAll(async () => { await harness.app.close(); });

  function login(method: "password" | "google", rememberMe?: boolean) {
    const call = request(harness.app.getHttpServer())
      .post(method === "password" ? "/auth/login" : "/auth/google")
      .set("Origin", "http://localhost:3000")
      .set("X-Forwarded-For", nextTestIp());
    if (method === "password") {
      return call.send({ email: EMAIL, password: PASSWORD, ...(rememberMe === undefined ? {} : { rememberMe }) });
    }
    return call.type("form").set("Cookie", `g_csrf_token=${GOOGLE_CSRF}`).send({
      credential: GOOGLE_CREDENTIAL,
      g_csrf_token: GOOGLE_CSRF,
      ...(rememberMe === undefined ? {} : { state: rememberMe ? "remember" : "session" }),
    });
  }

  describe.each(["password", "google"] as const)("%s", (method) => {
    it.each([true, false, undefined])("emite cookie e prazo fixo coerentes para rememberMe=%s", async (rememberMe) => {
      const response = await login(method, rememberMe).expect(200);
      const cookie = String(response.headers["set-cookie"]?.[0]);
      const session = [...harness.store.sessions.values()][0]!;
      const ttl = rememberMe ? 7 * 24 * HOUR : 12 * HOUR;
      expect(session.expiresAt.getTime()).toBe(LOGIN_AT.getTime() + ttl);
      expect(session.absoluteExpiresAt).toEqual(session.expiresAt);
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("SameSite=Lax");
      if (rememberMe) {
        expect(cookie).toContain("Max-Age=604800");
        expect(cookie).toContain(`Expires=${session.absoluteExpiresAt.toUTCString()}`);
      } else {
        expect(cookie).not.toMatch(/Max-Age|Expires=/i);
      }
    });

    it.each([true, false])("aceita até o limite e recusa exatamente no prazo (rememberMe=%s)", async (rememberMe) => {
      const response = await login(method, rememberMe).expect(200);
      const cookie = String(response.headers["set-cookie"]?.[0]).split(";")[0]!;
      const deadline = LOGIN_AT.getTime() + (rememberMe ? 7 * 24 * HOUR : 12 * HOUR);
      vi.setSystemTime(deadline - 1);
      await request(harness.app.getHttpServer()).get("/auth/me").set("Cookie", cookie).expect(200);
      vi.setSystemTime(deadline);
      await request(harness.app.getHttpServer()).get("/auth/me").set("Cookie", cookie).expect(401);
    });

    it.each([true, false])("logout revoga só a sessão atual (rememberMe=%s)", async (rememberMe) => {
      const response = await login(method, rememberMe).expect(200);
      const cookie = String(response.headers["set-cookie"]?.[0]).split(";")[0]!;
      const other = await login(method, !rememberMe).expect(200);
      const otherCookie = String(other.headers["set-cookie"]?.[0]).split(";")[0]!;
      const logout = await request(harness.app.getHttpServer()).post("/auth/logout")
        .set("Origin", "http://localhost:3000").set("Cookie", cookie).expect(200);
      expect(logout.headers["set-cookie"]?.[0]).toContain("Expires=Thu, 01 Jan 1970");
      expect(harness.store.sessions.size).toBe(1);
      await request(harness.app.getHttpServer()).get("/auth/me").set("Cookie", cookie).expect(401);
      await request(harness.app.getHttpServer()).get("/auth/me").set("Cookie", otherCookie).expect(200);
    });
  });

  it("recusa preferência inválida no JSON antes de emitir sessão", async () => {
    await request(harness.app.getHttpServer()).post("/auth/login")
      .send({ email: EMAIL, password: PASSWORD, rememberMe: "false" }).expect(400);
    expect(harness.store.sessions.size).toBe(0);
  });

  it("recusa state inválido antes da verificação Google", async () => {
    await request(harness.app.getHttpServer()).post("/auth/google")
      .set("Cookie", `g_csrf_token=${GOOGLE_CSRF}`).type("form")
      .send({ credential: GOOGLE_CREDENTIAL, g_csrf_token: GOOGLE_CSRF, state: "true" }).expect(400);
    expect(harness.verifier.calls).toBe(0);
    expect(harness.store.sessions.size).toBe(0);
  });

  it("state remember não dispensa o double-submit CSRF", async () => {
    await request(harness.app.getHttpServer()).post("/auth/google").type("form")
      .send({ credential: GOOGLE_CREDENTIAL, g_csrf_token: GOOGLE_CSRF, state: "remember" }).expect(401);
    expect(harness.verifier.calls).toBe(0);
    expect(harness.store.sessions.size).toBe(0);
  });
});
