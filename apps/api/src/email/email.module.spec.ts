import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";

import { BrevoEmailAdapter } from "./brevo-email.adapter";
import { EmailModule } from "./email.module";
import { EmailPort } from "./email.port";
import { MailpitEmailAdapter } from "./mailpit-email.adapter";
import { NoopEmailAdapter } from "./noop-email.adapter";

async function resolvePort(config: Record<string, unknown>): Promise<EmailPort> {
  const module = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => config] }),
      EmailModule,
    ],
  }).compile();
  return module.get(EmailPort);
}

describe("EmailModule provider selection", () => {
  it("defaults to the safe Noop adapter when no provider is set", async () => {
    expect(await resolvePort({})).toBeInstanceOf(NoopEmailAdapter);
  });

  it("selects the Mailpit adapter for EMAIL_PROVIDER=mailpit", async () => {
    expect(await resolvePort({ EMAIL_PROVIDER: "mailpit" })).toBeInstanceOf(MailpitEmailAdapter);
  });

  it("selects the Brevo adapter for EMAIL_PROVIDER=brevo", async () => {
    const port = await resolvePort({ EMAIL_PROVIDER: "brevo", BREVO_API_KEY: "client-key" });
    expect(port).toBeInstanceOf(BrevoEmailAdapter);
  });

  it("fails fast for an unknown provider rather than sending accidentally", async () => {
    await expect(resolvePort({ EMAIL_PROVIDER: "sendgrid" })).rejects.toThrow(
      /not a valid email provider/,
    );
  });
});
