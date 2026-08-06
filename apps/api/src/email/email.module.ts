import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { BrevoEmailAdapter } from "./brevo-email.adapter";
import { EmailPort } from "./email.port";
import { MailpitEmailAdapter } from "./mailpit-email.adapter";
import { NoopEmailAdapter } from "./noop-email.adapter";

@Module({
  providers: [
    NoopEmailAdapter,
    MailpitEmailAdapter,
    BrevoEmailAdapter,
    {
      // Adapter selection by EMAIL_PROVIDER (ADR-0010). The safe default never
      // sends; mailpit captures locally; brevo sends via the client's account.
      provide: EmailPort,
      useFactory: (
        config: ConfigService,
        noop: NoopEmailAdapter,
        mailpit: MailpitEmailAdapter,
        brevo: BrevoEmailAdapter,
      ): EmailPort => {
        const provider = config.get<string>("EMAIL_PROVIDER", "noop");
        switch (provider) {
          case "noop":
            return noop;
          case "mailpit":
            return mailpit;
          case "brevo":
            return brevo;
          default:
            // Fail safe: an unknown provider must never send accidentally.
            throw new Error(
              `EMAIL_PROVIDER='${provider}' is not a valid email provider (noop|mailpit|brevo)`,
            );
        }
      },
      inject: [ConfigService, NoopEmailAdapter, MailpitEmailAdapter, BrevoEmailAdapter],
    },
  ],
  exports: [EmailPort],
})
export class EmailModule {}
