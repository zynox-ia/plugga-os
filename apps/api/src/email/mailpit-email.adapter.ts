import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createTransport, type Transporter } from "nodemailer";

import { EmailPort, type TransactionalEmail } from "./email.port";
import { renderTemplate } from "./email.templates";
import { maskEmail } from "./email.util";

/**
 * Local/test adapter (ADR-0010): delivers over SMTP to the Mailpit container in
 * Compose, which captures every message in a local inbox. Nothing leaves the
 * machine. Templates are rendered server-side so local delivery matches the
 * content sent by Brevo in staging/prod.
 */
@Injectable()
export class MailpitEmailAdapter extends EmailPort {
  private readonly logger = new Logger(MailpitEmailAdapter.name);
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService) {
    super();
  }

  async sendTransactional(email: TransactionalEmail): Promise<void> {
    const rendered = renderTemplate(email);
    await this.getTransporter().sendMail({
      from: this.sender(),
      to: email.to,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
    });
    this.logger.log(
      `email sent via mailpit: template=${email.template} to=${maskEmail(email.to)}`,
    );
  }

  private getTransporter(): Transporter {
    if (!this.transporter) {
      this.transporter = this.createTransporter();
    }
    return this.transporter;
  }

  /** Overridable seam so unit tests can inject a fake transport. */
  protected createTransporter(): Transporter {
    return createTransport({
      host: this.config.get<string>("MAILPIT_SMTP_HOST", "localhost"),
      port: this.config.get<number>("MAILPIT_SMTP_PORT", 1_025),
      // Mailpit's SMTP listener is plaintext and local-only; no STARTTLS/auth.
      secure: false,
    });
  }

  private sender(): { name: string; address: string } {
    return {
      name: this.config.get<string>("EMAIL_FROM_NAME", "Plugga OS"),
      address: this.config.get<string>("EMAIL_FROM_ADDRESS", "no-reply@plugga.local"),
    };
  }
}
