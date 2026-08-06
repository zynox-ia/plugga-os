import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { MailpitEmailAdapter } from "../src/email/mailpit-email.adapter";

/**
 * Opt-in smoke test (mirrors test:db): sends a real message over SMTP to a live
 * Mailpit container and reads it back through Mailpit's HTTP API. Skipped unless
 * RUN_MAILPIT_INTEGRATION_TESTS=true and a Mailpit service is reachable. No email
 * ever leaves the machine — this proves the Mailpit delivery path end-to-end.
 */
const enabled = process.env.RUN_MAILPIT_INTEGRATION_TESTS === "true";
const describeMailpit = enabled ? describe : describe.skip;

const SMTP_HOST = process.env.MAILPIT_SMTP_HOST ?? "localhost";
const SMTP_PORT = Number(process.env.MAILPIT_SMTP_PORT ?? "1025");
const UI_PORT = Number(process.env.MAILPIT_UI_PORT ?? "8025");
const API_BASE = `http://${SMTP_HOST}:${UI_PORT}/api/v1`;

interface MailpitMessage {
  ID: string;
  Subject: string;
  To: { Address: string }[];
}

async function waitForMailpit(timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const response = await fetch(`${API_BASE}/messages?limit=1`);
      if (response.ok) {
        return;
      }
    } catch {
      // Mailpit not up yet; keep polling.
    }
    if (Date.now() > deadline) {
      throw new Error(`Mailpit HTTP API not reachable at ${API_BASE}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
}

async function clearInbox(): Promise<void> {
  await fetch(`${API_BASE}/messages`, { method: "DELETE" });
}

describeMailpit("Mailpit delivery (integration)", () => {
  const adapter = new MailpitEmailAdapter(
    new ConfigService({
      MAILPIT_SMTP_HOST: SMTP_HOST,
      MAILPIT_SMTP_PORT: SMTP_PORT,
      EMAIL_FROM_ADDRESS: "no-reply@plugga.local",
      EMAIL_FROM_NAME: "Plugga OS",
    }),
  );

  beforeAll(async () => {
    await waitForMailpit();
    await clearInbox();
  });

  afterAll(async () => {
    await clearInbox();
  });

  it("delivers an invite email that lands in the Mailpit inbox", async () => {
    const recipient = `invitee-${Date.now()}@example.com`;

    await adapter.sendTransactional({
      to: recipient,
      template: "invite",
      variables: {
        name: "Ana",
        link: "http://localhost:3000/auth/accept-invite?token=smoke-token",
        expiresInMinutes: 4_320,
      },
    });

    const response = await fetch(`${API_BASE}/messages?limit=20`);
    expect(response.ok).toBe(true);
    const body = (await response.json()) as { messages: MailpitMessage[] };
    const delivered = body.messages.find((message) =>
      message.To.some((to) => to.Address === recipient),
    );

    expect(delivered).toBeDefined();
    expect(delivered?.Subject).toContain("Convite");
  });
});
