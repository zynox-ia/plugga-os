import assert from "node:assert/strict";
import { test } from "node:test";
import * as auth from "../dist/auth.js";

test("contratos MFA aceitam TOTP/recuperação e recusam bypass e campos extras", () => {
  for (const code of ["123456", "abcd-1234-5678-9012-3456"]) assert.equal(auth.mfaCodeRequestSchema.safeParse({ code }).success, true);
  for (const input of [{ code: "" }, { code: "123456", userId: "someone" }, { code: 123456 }]) assert.equal(auth.mfaCodeRequestSchema.safeParse(input).success, false);
  assert.equal(auth.loginResponseSchema.safeParse({ requiresMfa: true }).success, true);
  assert.equal(auth.loginResponseSchema.safeParse({ requiresMfa: false }).success, false);
  assert.equal(auth.mfaRemoveRequestSchema.safeParse({ reason: "Solicitação de recuperação" }).success, true);
  assert.equal(auth.mfaRemoveRequestSchema.safeParse({ reason: "" }).success, false);
});
