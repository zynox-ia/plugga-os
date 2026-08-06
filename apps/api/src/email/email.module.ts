import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { EmailPort } from "./email.port";
import { NoopEmailAdapter } from "./noop-email.adapter";

@Module({
  providers: [
    NoopEmailAdapter,
    {
      // Adapter selection by EMAIL_PROVIDER (ADR-0010). Only the safe Noop is
      // wired in this PR; mailpit/brevo arrive with the email PR.
      provide: EmailPort,
      useFactory: (config: ConfigService, noop: NoopEmailAdapter): EmailPort => {
        const provider = config.get<string>("EMAIL_PROVIDER", "noop");
        if (provider === "noop") {
          return noop;
        }
        throw new Error(
          `EMAIL_PROVIDER='${provider}' is not wired yet; only 'noop' is available in this PR`,
        );
      },
      inject: [ConfigService, NoopEmailAdapter],
    },
  ],
  exports: [EmailPort],
})
export class EmailModule {}
