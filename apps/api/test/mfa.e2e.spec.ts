import "./support/google-env";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { totp } from "../src/auth/mfa-crypto";
import { hashToken } from "../src/core/auth/token.util";
import { bootGoogleHarness, GOOGLE_CREDENTIAL, GOOGLE_CSRF, type GoogleHarness } from "./support/google-auth-harness";

const ORIGIN = "http://localhost:3000", PASSWORD = "senha sintética longa segura";
function cookies(response: { headers: Record<string, unknown> }): string[] {
  const values = response.headers["set-cookie"];
  return Array.isArray(values) ? values.map(String) : typeof values === "string" ? [values] : [];
}
function cookie(response: { headers: Record<string, unknown> }, name: string): string {
  return cookies(response).find((value) => value.startsWith(`${name}=`))!.split(";")[0]!;
}
describe("MFA API: senha, Google, cookie pendente e gerenciamento", () => {
  let h: GoogleHarness, app: NestExpressApplication;
  const originalKey = process.env.MFA_ENCRYPTION_KEY;
  beforeAll(async () => { process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 42).toString("base64"); process.env.GOOGLE_AUTH_ENABLED = "true"; h = await bootGoogleHarness(); app = h.app; });
  afterAll(async () => { await app.close(); if (originalKey === undefined) delete process.env.MFA_ENCRYPTION_KEY; else process.env.MFA_ENCRYPTION_KEY = originalKey; });
  beforeEach(() => h.store.clear());
  const login = (rememberMe = false) => request(app.getHttpServer()).post("/auth/login").set("Origin", ORIGIN).send({ email: "pessoa@gmail.com", password: PASSWORD, rememberMe });
  const post = (path: string, full: string, body = {}) => request(app.getHttpServer()).post(`/auth/mfa/${path}`).set("Origin", ORIGIN).set("Cookie", full).send(body);
  async function enroll() {
    const user = await h.store.addUser({ email: "pessoa@gmail.com", password: PASSWORD });
    const first = await login().expect(200), full = cookie(first, "plugga_session");
    const setup = await post("setup", full).expect(200);
    const enabled = await post("enable", full, { code: totp(setup.body.secret, Date.now()) }).expect(200);
    expect(setup.headers["cache-control"]).toBe("no-store");
    expect(enabled.headers["cache-control"]).toBe("no-store");
    return { user, full, setup: setup.body, codes: enabled.body.recoveryCodes as string[] };
  }
  it("senha entrega apenas pending até backup; cookie full respeita7d e replay falha", async () => {
    const { codes } = await enroll();
    const primary = await login(true).expect(200);
    expect(primary.body).toEqual({ requiresMfa: true });
    const pending = cookie(primary, "plugga_mfa_pending");
    expect(cookies(primary)[0]).toMatch(/Max-Age=300;.*HttpOnly; SameSite=Lax/);
    await request(app.getHttpServer()).get("/auth/me").set("Cookie", pending).expect(401);
    await request(app.getHttpServer()).get("/auth/mfa/challenge").set("Cookie", pending).expect(200).expect((res) => expect(res.body.pending).toBe(true));
    const verified = await post("verify", pending, { code: codes[0]! }).expect(200);
    expect(verified.body.user.email).toBe("pessoa@gmail.com");
    expect(cookies(verified).find((c) => c.startsWith("plugga_session="))).toContain("Max-Age=604800");
    await post("verify", pending, { code: codes[0]! }).expect(401);
    await request(app.getHttpServer()).get("/auth/me").set("Cookie", cookie(verified, "plugga_session")).expect(200);
  });
  it("Google não contorna MFA e mantém preferência12h", async () => {
    const { codes } = await enroll();
    const primary = await request(app.getHttpServer()).post("/auth/google").set("Cookie", `g_csrf_token=${GOOGLE_CSRF}`).type("form").send({ credential: GOOGLE_CREDENTIAL, g_csrf_token: GOOGLE_CSRF, state: "session" }).expect(200);
    expect(primary.body).toEqual({ requiresMfa: true });
    const verified = await post("verify", cookie(primary, "plugga_mfa_pending"), { code: codes[0]! }).expect(200);
    const full = cookies(verified).find((c) => c.startsWith("plugga_session="))!;
    expect(full).not.toMatch(/Max-Age|Expires=/);
    const latest = [...h.store.sessions.values()].at(-1)!;
    expect(latest.expiresAt.getTime() - latest.createdAt.getTime()).toBe(12 * 3600_000);
  });
  it("verify e cancel exigem Origin com pending signed e recusam cookie adulterado", async () => {
    const { codes } = await enroll(); const primary = await login().expect(200), pending = cookie(primary, "plugga_mfa_pending");
    for (const action of ["verify", "cancel"]) await request(app.getHttpServer()).post(`/auth/mfa/${action}`).set("Cookie", pending).send({ code: codes[0] }).expect(403);
    await post("verify", `${pending}tampered`, { code: codes[0]! }).expect(401);
    await post("cancel", pending).expect(200);
    await post("verify", pending, { code: codes[0]! }).expect(401);
  });
  it("reset senha preserva fator e invalida challenges anteriores", async () => {
    const { user, codes } = await enroll(); const primary = await login().expect(200);
    const raw = "reset-sintetico-token-comprido";
    h.store.tokens.set("reset-1", { id: "reset-1", userId: user.id, type: "reset", tokenHash: hashToken(raw), expiresAt: new Date(Date.now() + 300_000), consumedAt: null });
    await request(app.getHttpServer()).post("/auth/reset/confirm").send({ token: raw, password: "outra senha sintética longa" }).expect(200);
    await post("verify", cookie(primary, "plugga_mfa_pending"), { code: codes[0]! }).expect(401);
    const next = await request(app.getHttpServer()).post("/auth/login").send({ email: user.email, password: "outra senha sintética longa" }).expect(200);
    expect(next.body).toEqual({ requiresMfa: true });
  });
  it("enrollment exige login primário recente; sessão antiga ainda permite trabalho habitual", async () => {
    const user = await h.store.addUser({ email: "pessoa@gmail.com", password: PASSWORD });
    const first = await login().expect(200), full = cookie(first, "plugga_session");
    const session = [...h.store.sessions.values()].find((s) => s.userId === user.id)!;
    session.createdAt = new Date(Date.now() - 301_000);
    await post("setup", full).expect(403).expect((res) => expect(res.body.message).toContain("Entre novamente"));
    await request(app.getHttpServer()).get("/auth/me").set("Cookie", full).expect(200);
  });
});
