import { ConfigService } from "@nestjs/config";
import type { Transporter } from "nodemailer";
import { describe, expect, it } from "vitest";

import type { TransactionalEmail } from "./email.port";
import { MailpitEmailAdapter } from "./mailpit-email.adapter";

interface SentMessage {
  from: unknown;
  to: string;
  subject: string;
  text: string;
  html: string;
}

class TestMailpitAdapter extends MailpitEmailAdapter {
  readonly sent: SentMessage[] = [];
  createCalls = 0;

  protected override createTransporter(): Transporter {
    this.createCalls += 1;
    return {
      sendMail: async (message: SentMessage) => {
        this.sent.push(message);
        return {};
      },
    } as unknown as Transporter;
  }
}

function build(): TestMailpitAdapter {
  return new TestMailpitAdapter(
    new ConfigService({
      MAILPIT_SMTP_HOST: "localhost",
      MAILPIT_SMTP_PORT: 1_025,
      EMAIL_FROM_ADDRESS: "no-reply@plugga.local",
      EMAIL_FROM_NAME: "Plugga OS",
    }),
  );
}

const invite: TransactionalEmail = {
  to: "person@example.com",
  template: "invite",
  variables: {
    name: "Ana",
    link: "http://localhost:3000/auth/accept-invite?token=abc",
    expiresInMinutes: 4_320,
  },
};

describe("MailpitEmailAdapter", () => {
  it("delivers rendered content over SMTP with the configured sender", async () => {
    const adapter = build();

    await adapter.sendTransactional(invite);

    expect(adapter.sent).toHaveLength(1);
    const message = adapter.sent[0];
    expect(message).toBeDefined();
    expect(message!.to).toBe("person@example.com");
    expect(message!.from).toEqual({ name: "Plugga OS", address: "no-reply@plugga.local" });
    expect(message!.subject).toContain("Convite");
    expect(message!.html).toContain("token=abc");
    expect(message!.text).toContain("token=abc");
  });

  it("reuses a single transport across sends", async () => {
    const adapter = build();

    await adapter.sendTransactional(invite);
    await adapter.sendTransactional(invite);

    expect(adapter.createCalls).toBe(1);
    expect(adapter.sent).toHaveLength(2);
  });
});
