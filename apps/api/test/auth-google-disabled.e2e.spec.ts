// Precisa ser o PRIMEIRO import: apaga a flag antes de `app.module` ser
// avaliado, inclusive quando outro spec do mesmo worker já a tinha ligado.
import "./support/google-env-off";

import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  bootGoogleHarness,
  nextTestIp,
  postGoogle,
  type GoogleHarness,
} from "./support/google-auth-harness";
import { access } from "./support/in-memory-auth";

/**
 * Arquivo separado de propósito: o ambiente validado do ConfigModule é
 * congelado quando `app.module` é importado, e cada spec do vitest tem o seu
 * próprio registro de módulos. "Flag ligada" e "flag desligada" não cabem no
 * mesmo processo, e este cenário é justamente o do rollback — republicar com
 * `GOOGLE_AUTH_ENABLED=false`. Aqui a variável simplesmente não existe, que é o
 * estado default de qualquer ambiente que nunca a configurou.
 */
describe("google login API with the feature flag off", () => {
  let harness: GoogleHarness;

  beforeAll(async () => {
    harness = await bootGoogleHarness();
  });

  afterAll(async () => {
    await harness.app.close();
  });

  it("refuses every attempt, issues no session and never calls the verifier", async () => {
    await harness.store.addUser({
      email: "pessoa@gmail.com",
      name: "Pessoa",
      access: access({ platformRoles: ["admin"] }),
    });

    const response = await postGoogle(harness.app).expect(403);

    // Esconder o botão não é rollback: a rota tem de recusar sozinha.
    expect(response.body.code).toBe("disabled");
    expect(harness.store.sessions.size).toBe(0);
    expect(harness.verifier.calls).toBe(0);
  });

  it("leaves password login working while Google is off", async () => {
    await harness.store.addUser({
      email: "senha@plugga.local",
      name: "Senha",
      password: "correct horse battery staple",
      access: access({ platformRoles: ["admin"] }),
    });

    await request(harness.app.getHttpServer())
      .post("/auth/login")
      .set("X-Forwarded-For", nextTestIp())
      .send({ email: "senha@plugga.local", password: "correct horse battery staple" })
      .expect(200);
  });
});
