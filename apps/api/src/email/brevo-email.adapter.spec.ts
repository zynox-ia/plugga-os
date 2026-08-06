import { ConfigService } from "@nestjs/config";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BrevoEmailAdapter } from "./brevo-email.adapter";
import type { TransactionalEmail } from "./email.port";

const API_URL = "https://api.brevo.com/v3/smtp/email";
const TOKEN = "super-secret-opaque-token";

function build(config: Record<string, unknown>): BrevoEmailAdapter {
  return new BrevoEmailAdapter(new ConfigService(config));
}

function email(): TransactionalEmail {
  return {
    to: "person@example.com",
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

    const body = JSON.parse(init.body as string);
    expect(body.sender).toEqual({ name: "Cliente", email: "no-reply@client.com" });
    expect(body.to).toEqual([{ email: "person@example.com", name: "Ana" }]);
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

  it("refuses to send when no API key is configured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      build({ ...baseConfig, BREVO_API_KEY: undefined }).sendTransactional(email()),
    ).rejects.toThrow(/BREVO_API_KEY is required/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
