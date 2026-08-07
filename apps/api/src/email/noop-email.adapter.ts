import { Injectable, Logger } from "@nestjs/common";

import { EmailPort, type TransactionalEmail } from "./email.port";
import { maskEmail } from "./email.util";

/**
 * Safe default: records that an email would have been sent, but never sends and
 * never logs the token/link (ADR-0007). Local delivery with a visible link is
 * provided by the Mailpit adapter.
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
