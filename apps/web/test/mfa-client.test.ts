import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { MfaError, mfaRequest } from "../app/lib/mfa-client.ts";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test("MFA envia somente o código e preserva cookies HttpOnly pelo proxy de mesma origem", async () => {
  globalThis.fetch = (async (url, init) => {
    assert.equal(url, "/api/auth/mfa/verify");
    assert.equal(init?.method, "POST");
    assert.equal(init?.body, JSON.stringify({ code: "123456" }));
    assert.equal(init?.cache, "no-store");
    return Response.json({ user: { id: "synthetic" } });
  }) as typeof fetch;
  assert.deepEqual(await mfaRequest("verify", { code: "123456" }), { user: { id: "synthetic" } });
});

test("MFA diferencia confirmação expirada, código inválido, limite e desconexão", async () => {
  for (const status of [401, 403, 429, 503]) {
    globalThis.fetch = (async () => Response.json({}, { status })) as typeof fetch;
    await assert.rejects(mfaRequest("confirm", { code: "invalid" }), (error) => error instanceof MfaError && error.status === status && error.message.length > 20);
  }
  globalThis.fetch = (async () => { throw new Error("offline"); }) as typeof fetch;
  await assert.rejects(mfaRequest("status"), (error) => error instanceof MfaError && error.status === 0);
});

test("MFA distingue novo login exigido para a primeira ativação sem exibir mensagens arbitrárias da API", async () => {
  const message = "Entre novamente para configurar a autenticação em duas etapas.";
  globalThis.fetch = (async () => Response.json({ message }, { status: 403 })) as typeof fetch;
  await assert.rejects(mfaRequest("setup", {}), (error) => error instanceof MfaError && error.message === message);
  globalThis.fetch = (async () => Response.json({ message: "internal secret" }, { status: 403 })) as typeof fetch;
  await assert.rejects(mfaRequest("setup", {}), (error) => error instanceof MfaError && error.message === "Confirme o segundo fator para continuar.");
});
