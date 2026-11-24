import { createHash, randomBytes } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { abrirState, novoPkce, selarState, VALIDADE_DO_STATE_MS, vinculoDaSessao } from "./google-oauth-state";

const mestraAnterior = process.env.SECRETS_ENCRYPTION_KEY;

beforeEach(() => {
  process.env.SECRETS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

afterEach(() => {
  if (mestraAnterior === undefined) delete process.env.SECRETS_ENCRYPTION_KEY;
  else process.env.SECRETS_ENCRYPTION_KEY = mestraAnterior;
});

const PESSOA = { userId: "00000000-0000-4000-8000-00000000000a", sessaoHash: "hash-da-sessao-a" };

describe("PKCE", () => {
  it("o challenge é o SHA-256 do verificador em base64url (S256)", () => {
    const { codeVerifier, codeChallenge } = novoPkce();

    expect(codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(codeChallenge).toBe(createHash("sha256").update(codeVerifier).digest("base64url"));
  });

  it("cada pedido ganha um par novo", () => {
    expect(novoPkce().codeVerifier).not.toBe(novoPkce().codeVerifier);
  });
});

describe("state selado", () => {
  it("devolve o verificador do PKCE para a mesma pessoa e a mesma sessão", () => {
    const state = selarState({ ...PESSOA, codeVerifier: "verificador-secreto" });

    expect(abrirState(state, PESSOA)).toEqual({ codeVerifier: "verificador-secreto" });
  });

  it("não deixa o verificador, a pessoa nem a sessão legíveis por quem vê a URL", () => {
    const state = selarState({ ...PESSOA, codeVerifier: "verificador-secreto" });
    const decodificado = Buffer.from(state, "base64url").toString("latin1");

    for (const texto of [state, decodificado]) {
      expect(texto).not.toContain("verificador-secreto");
      expect(texto).not.toContain(PESSOA.userId);
      expect(texto).not.toContain(PESSOA.sessaoHash);
    }
    // Vai numa URL sem precisar de escape.
    expect(state).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("recusa outra sessão, mesmo da mesma pessoa", () => {
    const state = selarState({ ...PESSOA, codeVerifier: "v" });

    expect(abrirState(state, { ...PESSOA, sessaoHash: "hash-de-outra-sessao" })).toBeNull();
  });

  it("recusa outra pessoa, mesmo com a mesma sessão", () => {
    const state = selarState({ ...PESSOA, codeVerifier: "v" });

    expect(abrirState(state, { ...PESSOA, userId: "00000000-0000-4000-8000-00000000000b" })).toBeNull();
  });

  it("recusa depois da validade e aceita até o último instante", () => {
    const agora = 1_800_000_000_000;
    const state = selarState({ ...PESSOA, codeVerifier: "v" }, agora);

    expect(abrirState(state, PESSOA, agora + VALIDADE_DO_STATE_MS - 1)).toEqual({ codeVerifier: "v" });
    expect(abrirState(state, PESSOA, agora + VALIDADE_DO_STATE_MS)).toBeNull();
  });

  it("recusa state adulterado, truncado, vazio ou fabricado", () => {
    const state = selarState({ ...PESSOA, codeVerifier: "v" });
    const bytes = Buffer.from(state, "base64url");
    bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 0x01;

    expect(abrirState(bytes.toString("base64url"), PESSOA)).toBeNull();
    expect(abrirState(state.slice(0, -6), PESSOA)).toBeNull();
    expect(abrirState("", PESSOA)).toBeNull();
    expect(abrirState("não-é-um-state", PESSOA)).toBeNull();
    expect(abrirState(randomBytes(80).toString("base64url"), PESSOA)).toBeNull();
  });

  it("não abre state selado com outra chave-mestra", () => {
    const state = selarState({ ...PESSOA, codeVerifier: "v" });
    process.env.SECRETS_ENCRYPTION_KEY = randomBytes(32).toString("base64");

    expect(abrirState(state, PESSOA)).toBeNull();
  });

  it("o vínculo da sessão não é o hash da sessão", () => {
    expect(vinculoDaSessao("hash-da-sessao-a")).not.toBe("hash-da-sessao-a");
    expect(vinculoDaSessao("hash-da-sessao-a")).toMatch(/^[0-9a-f]{64}$/);
  });
});
