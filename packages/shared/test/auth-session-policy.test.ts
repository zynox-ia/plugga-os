import assert from "node:assert/strict";
import { test } from "node:test";

import * as auth from "../dist/auth.js";

const credentials = { email: "pessoa@plugga.local", password: "senha de teste" };
const google = { credential: "id-token", g_csrf_token: "csrf-token" };

test("login aceita preferência booleana opcional sem coerção", () => {
  for (const rememberMe of [true, false]) {
    assert.equal(auth.loginRequestSchema.parse({ ...credentials, rememberMe }).rememberMe, rememberMe);
  }
  assert.equal(auth.loginRequestSchema.safeParse(credentials).success, true);
  for (const rememberMe of ["false", "true", "on", 0, 1, null, [], {}]) {
    assert.equal(auth.loginRequestSchema.safeParse({ ...credentials, rememberMe }).success, false);
  }
  assert.equal(auth.loginRequestSchema.safeParse({ ...credentials, duration: 999 }).success, false);
});

test("Google valida state opcional e preserva os campos oficiais extras", () => {
  for (const state of ["remember", "session"]) {
    assert.equal(auth.googleCallbackSchema.parse({ ...google, state, select_by: "btn" }).state, state);
  }
  assert.equal(auth.googleCallbackSchema.safeParse(google).success, true);
  for (const state of ["", "true", "false", "unknown", true, 1, null, ["remember"]]) {
    assert.equal(auth.googleCallbackSchema.safeParse({ ...google, state }).success, false);
  }
});

test("prazos compartilhados são 7 dias e 12 horas em segundos", () => {
  assert.equal(auth.REMEMBERED_SESSION_TTL_SECONDS, 7 * 24 * 60 * 60);
  assert.equal(auth.STANDARD_SESSION_TTL_SECONDS, 12 * 60 * 60);
});
