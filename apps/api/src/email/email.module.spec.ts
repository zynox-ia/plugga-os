import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { ThrottlerModule } from "@nestjs/throttler";
import { describe, expect, it } from "vitest";

import { BrevoEmailAdapter } from "./brevo-email.adapter";
import { EmailModule } from "./email.module";
import { EmailPort } from "./email.port";
import { EmailRoteadorAdapter } from "./email-roteador.adapter";
import { NoopEmailAdapter } from "./noop-email.adapter";

async function resolvePort(config: Record<string, unknown>): Promise<EmailRoteadorAdapter> {
  const module = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => config] }),
      // O ThrottlerModule é global na aplicação; o módulo isolado precisa dele para os guards de /email/brevo.
      ThrottlerModule.forRoot([{ ttl: 60_000, limit: 10 }]),
      EmailModule,
    ],
  }).compile();
  return module.get<EmailPort>(EmailPort) as EmailRoteadorAdapter;
}

describe("EmailModule provider selection", () => {
  it("defaults to the safe Noop adapter when no provider is set", async () => {
    const port = await resolvePort({});
    expect(port).toBeInstanceOf(EmailRoteadorAdapter);
    expect(port.padrao).toBeInstanceOf(NoopEmailAdapter);
  });

  it("selects the Brevo adapter for EMAIL_PROVIDER=brevo", async () => {
    const port = await resolvePort({ EMAIL_PROVIDER: "brevo", BREVO_API_KEY: "client-key" });
    expect(port.padrao).toBeInstanceOf(BrevoEmailAdapter);
  });

  it("fails fast for an unknown provider rather than sending accidentally", async () => {
    await expect(resolvePort({ EMAIL_PROVIDER: "sendgrid" })).rejects.toThrow(
      /not a valid email provider/,
    );
  });
});
