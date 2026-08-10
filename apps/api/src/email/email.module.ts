import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { CoreModule } from "../core/core.module";
import { BrevoEmailAdapter } from "./brevo-email.adapter";
import { EmailPort } from "./email.port";
import { EmailStatusController } from "./email-status.controller";
import { NoopEmailAdapter } from "./noop-email.adapter";

@Module({
  imports: [CoreModule],
  controllers: [EmailStatusController],
  providers: [
    NoopEmailAdapter,
    BrevoEmailAdapter,
    {
      // Adapter selection by EMAIL_PROVIDER (ADR-0010). The safe default never
      // sends; brevo sends via the client's account. The Mailpit adapter was
      // removed 2026-08-10: Brevo has been the only provider in production
      // since 2026-08-09, and this repo's local dev no longer runs a local
      // Mailpit container (backend points at the VPS over an SSH tunnel).
      provide: EmailPort,
      useFactory: (config: ConfigService, noop: NoopEmailAdapter, brevo: BrevoEmailAdapter): EmailPort => {
        const provider = config.get<string>("EMAIL_PROVIDER", "noop");
        switch (provider) {
          case "noop":
            return noop;
          case "brevo":
            return brevo;
          default:
            // Fail safe: an unknown provider must never send accidentally.
            throw new Error(`EMAIL_PROVIDER='${provider}' is not a valid email provider (noop|brevo)`);
        }
      },
      inject: [ConfigService, NoopEmailAdapter, BrevoEmailAdapter],
    },
  ],
  exports: [EmailPort],
})
export class EmailModule {}
