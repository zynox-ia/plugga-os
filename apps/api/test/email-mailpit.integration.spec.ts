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

// Portas da faixa 5xxxx do stack local; as baixas 1025/8025 desta máquina são
// os túneis para o Mailpit de PRODUÇÃO (mesma razão do guard em test/setup.ts).
const SMTP_HOST = process.env.MAILPIT_SMTP_HOST ?? "localhost";
const SMTP_PORT = Number(process.env.MAILPIT_SMTP_PORT ?? "51025");
const UI_PORT = Number(process.env.MAILPIT_UI_PORT ?? "58025");
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

// Apaga só as mensagens do destinatário informado, nunca a inbox inteira: um
// DELETE de tudo apontado para a porta errada limparia o Mailpit de PRODUÇÃO.
// A asserção do teste já filtra pelo destinatário, então a inbox não precisa
// estar vazia para o resultado ser previsível.
async function deleteMessagesTo(recipient: string): Promise<void> {
  const response = await fetch(`${API_BASE}/messages?limit=200`);
  if (!response.ok) {
    return;
  }
  const body = (await response.json()) as { messages: MailpitMessage[] };
  const ids = body.messages
    .filter((message) => message.To.some((to) => to.Address === recipient))
    .map((message) => message.ID);
  if (ids.length === 0) {
    return;
  }
  await fetch(`${API_BASE}/messages`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ IDs: ids }),
  });
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

  // Único por execução: é por ele que a asserção filtra e a limpeza apaga.
  const recipient = `invitee-${Date.now()}@example.com`;

  beforeAll(async () => {
    await waitForMailpit();
  });

  afterAll(async () => {
    await deleteMessagesTo(recipient);
  });

  it("delivers an invite email that lands in the Mailpit inbox", async () => {
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
