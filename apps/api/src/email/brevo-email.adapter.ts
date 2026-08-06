import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { EmailPort, type TransactionalEmail } from "./email.port";
import { renderTemplate } from "./email.templates";
import { maskEmail } from "./email.util";

const DEFAULT_BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

/**
 * Staging / client-VPS adapter (ADR-0010): sends through the Brevo transactional
 * API using the *client's* account key, read only from the environment — never
 * committed. Templates are rendered server-side, so the OS never depends on the
 * Brevo template editor. No real send happens in CI/dev (EMAIL_PROVIDER stays
 * noop/mailpit there); this path is exercised only against a real client key.
 */
@Injectable()
export class BrevoEmailAdapter extends EmailPort {
  private readonly logger = new Logger(BrevoEmailAdapter.name);

  constructor(private readonly config: ConfigService) {
    super();
  }

  async sendTransactional(email: TransactionalEmail): Promise<void> {
    const apiKey = this.config.get<string>("BREVO_API_KEY");
    if (!apiKey) {
      // Defensive: env validation already requires the key when provider=brevo.
      throw new Error("BREVO_API_KEY is required to send via the brevo provider");
    }

    const rendered = renderTemplate(email);
    const url = this.config.get<string>("BREVO_API_URL", DEFAULT_BREVO_API_URL);

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "api-key": apiKey,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          sender: {
            name: this.config.get<string>("EMAIL_FROM_NAME", "Plugga OS"),
            email: this.config.get<string>("EMAIL_FROM_ADDRESS", "no-reply@plugga.local"),
          },
          to: [{ email: email.to, ...(email.variables.name ? { name: email.variables.name } : {}) }],
          subject: rendered.subject,
          htmlContent: rendered.html,
          textContent: rendered.text,
        }),
        // Bound the outbound call so a hung Brevo API cannot hold invite/reset
        // open indefinitely (interacts with the reset generic-ack path).
        signal: AbortSignal.timeout(10_000),
      });
    } catch (cause) {
      // Never surface the token/link; report only that delivery failed.
      throw new Error(`brevo request failed for template=${email.template}`, { cause });
    }

    if (!response.ok) {
      // Log/raise only the status — never the request body (token) or response.
      this.logger.error(
        `brevo rejected email: template=${email.template} to=${maskEmail(email.to)} status=${response.status}`,
      );
      throw new Error(`brevo returned HTTP ${response.status} for template=${email.template}`);
    }

    this.logger.log(
      `email sent via brevo: template=${email.template} to=${maskEmail(email.to)}`,
    );
  }
}
