import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { BrevoCofreService } from "./brevo-cofre.service";
import { BrevoEmailAdapter } from "./brevo-email.adapter";
import type { TransactionalEmail } from "./email.port";

const API_URL = "https://api.brevo.com/v3/smtp/email";
const TOKEN = "super-secret-opaque-token";
const FULL_EMAIL = "person@example.com";

function build(config: Record<string, unknown>): BrevoEmailAdapter {
  return new BrevoEmailAdapter(new ConfigService(config));
}

function email(): TransactionalEmail {
  return {
    to: FULL_EMAIL,
    template: "reset",
    variables: {
      name: "Ana",
      link: `http://app.example.com/auth/reset?token=${TOKEN}`,
      expiresInMinutes: 60,
    },
  };
}

const baseConfig = {
  BREVO_API_KEY: "client-key",
  EMAIL_FROM_ADDRESS: "no-reply@client.com",
  EMAIL_FROM_NAME: "Cliente",
};

describe("BrevoEmailAdapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("posts rendered content to the Brevo API with the client key", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    await build(baseConfig).sendTransactional(email());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const [url, init] = call as unknown as [string, RequestInit];
    expect(url).toBe(API_URL);
    expect((init.headers as Record<string, string>)["api-key"]).toBe("client-key");
    expect(init.signal).toBeInstanceOf(AbortSignal);

    const body = JSON.parse(init.body as string);
    expect(body.sender).toEqual({ name: "Cliente", email: "no-reply@client.com" });
    expect(body.to).toEqual([{ email: FULL_EMAIL, name: "Ana" }]);
    expect(body.subject).toContain("Redefinição");
    expect(body.htmlContent).toContain(TOKEN);
    expect(body.textContent).toContain(TOKEN);
  });

  it("throws without leaking the token when the API rejects the request", async () => {
    const fetchMock = vi.fn(async () => new Response("Bad Request", { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(build(baseConfig).sendTransactional(email())).rejects.toThrow(
      /brevo returned HTTP 400/,
    );
    await expect(build(baseConfig).sendTransactional(email())).rejects.not.toThrow(
      new RegExp(TOKEN),
    );
  });

  it("never logs the token/link or full recipient address on success or rejection", async () => {
    const logSpy = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 201 }))
        .mockResolvedValueOnce(new Response("Bad Request", { status: 400 })),
    );

    await build(baseConfig).sendTransactional(email());
    await expect(build(baseConfig).sendTransactional(email())).rejects.toThrow(/HTTP 400/);

    const messages = [...logSpy.mock.calls, ...errorSpy.mock.calls].map((call) =>
      String(call[0] ?? ""),
    );
    expect(messages.length).toBeGreaterThan(0);
    for (const message of messages) {
      expect(message).toContain("p***@example.com");
      expect(message).not.toContain(TOKEN);
      expect(message).not.toContain("auth/reset");
      expect(message).not.toContain(FULL_EMAIL);
    }
  });

  it("refuses to send when no API key is configured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      build({ ...baseConfig, BREVO_API_KEY: undefined }).sendTransactional(email()),
    ).rejects.toThrow(/BREVO_API_KEY is required/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("BrevoEmailAdapter com o cofre da tela", () => {
  const cofre = {
    credenciais: async () => ({ chave: "chave-do-cofre", remetenteNome: "Waze Energia", remetenteEmail: "oi@waze.test" }),
  } as unknown as BrevoCofreService;

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("usa chave e remetente do cofre no lugar dos do ambiente", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    await new BrevoEmailAdapter(new ConfigService(baseConfig), cofre).sendTransactional(email());

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)["api-key"]).toBe("chave-do-cofre");
    expect(JSON.parse(init.body as string).sender).toEqual({ name: "Waze Energia", email: "oi@waze.test" });
  });

  it("cai para o ambiente quando o cofre está vazio", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const vazio = { credenciais: async () => null } as unknown as BrevoCofreService;

    await new BrevoEmailAdapter(new ConfigService(baseConfig), vazio).sendTransactional(email());

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)["api-key"]).toBe("client-key");
  });

  it("envia o e-mail de teste ao destinatário informado, sem template de convite", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    await new BrevoEmailAdapter(new ConfigService(baseConfig), cofre).enviarTeste("andre@plugga.test");

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const corpo = JSON.parse(init.body as string);
    expect(corpo.to).toEqual([{ email: "andre@plugga.test" }]);
    expect(corpo.subject).toBe("Teste de conexão do Plugga OS");
  });

  it("no teste, devolve só o status quando o Brevo recusa", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("segredo-na-resposta", { status: 401 })));

    const falha = new BrevoEmailAdapter(new ConfigService(baseConfig), cofre).enviarTeste("andre@plugga.test");

    await expect(falha).rejects.toThrow("brevo returned HTTP 401 for the connection test");
    await expect(falha).rejects.not.toThrow(/segredo-na-resposta/);
  });

  it("no teste, recusa sem chave nenhuma e não sai para a rede", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      new BrevoEmailAdapter(new ConfigService({ ...baseConfig, BREVO_API_KEY: undefined })).enviarTeste("a@b.test"),
    ).rejects.toThrow(/não está conectado/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
