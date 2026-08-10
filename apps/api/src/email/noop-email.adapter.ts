import { Injectable, Logger } from "@nestjs/common";

import { EmailPort, type TransactionalEmail } from "./email.port";
import { maskEmail } from "./email.util";

/**
 * Safe default: records that an email would have been sent, but never sends and
 * never logs the token/link (ADR-0007). Since the Mailpit adapter was removed
 * on 2026-08-10 there is no local delivery at all — which is why the e2e suite
 * keeps only the invite/reset error paths, the ones that need no inbox.
 */
@Injectable()
export class NoopEmailAdapter extends EmailPort {
  private readonly logger = new Logger(NoopEmailAdapter.name);

  async sendTransactional(email: TransactionalEmail): Promise<void> {
    this.logger.log(
      `email suppressed (noop provider): template=${email.template} to=${maskEmail(
        email.to,
      )} expiresInMinutes=${email.variables.expiresInMinutes}`,
    );
  }
}
