import { Injectable, Logger, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { BrevoCofreService } from "./brevo-cofre.service";
import { EmailPort, type TransactionalEmail } from "./email.port";
import { renderTemplate } from "./email.templates";
import { maskEmail } from "../common/mascara-email";

const DEFAULT_BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

/**
 * Staging / client-VPS adapter (ADR-0010): sends through the Brevo transactional
 * API using the *client's* account key, read only from the environment — never
 * committed. Templates are rendered server-side, so the OS never depends on the
 * Brevo template editor. No real send happens in CI/dev (EMAIL_PROVIDER stays
 * noop there); this path is exercised only against a real client key.
 */
@Injectable()
export class BrevoEmailAdapter extends EmailPort {
  private readonly logger = new Logger(BrevoEmailAdapter.name);

  /**
   * `cofre` é opcional: com ele, a chave e o remetente conectados pela tela vencem
   * o ambiente. Sem ele (testes isolados), vale só o ambiente.
   */
  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly cofre?: BrevoCofreService,
  ) {
    super();
  }

  private async remetenteEChave(): Promise<{ apiKey: string | undefined; nome: string; email: string }> {
    const doCofre = await this.cofre?.credenciais();
    if (doCofre) return { apiKey: doCofre.chave, nome: doCofre.remetenteNome, email: doCofre.remetenteEmail };
    return {
      apiKey: this.config.get<string>("BREVO_API_KEY"),
      nome: this.config.get<string>("EMAIL_FROM_NAME", "plugga-os"),
      email: this.config.get<string>("EMAIL_FROM_ADDRESS", "no-reply@plugga.local"),
    };
  }

  /** Envia uma mensagem de teste com a configuração em uso. Só o status HTTP volta no erro. */
  async enviarTeste(destinatario: string): Promise<void> {
    const { apiKey, nome, email } = await this.remetenteEChave();
    if (!apiKey) throw new Error("Brevo não está conectado");
    let response: Response;
    try {
      response = await fetch(this.config.get<string>("BREVO_API_URL", DEFAULT_BREVO_API_URL), {
        method: "POST",
        headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          sender: { name: nome, email },
          to: [{ email: destinatario }],
          subject: "Teste de conexão do Plugga OS",
          textContent: "Se você recebeu esta mensagem, o Brevo está conectado ao Plugga OS.",
          htmlContent: "<p>Se você recebeu esta mensagem, o Brevo está conectado ao Plugga OS.</p>",
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (cause) {
      throw new Error("brevo request failed for the connection test", { cause });
    }
    if (!response.ok) throw new Error(`brevo returned HTTP ${response.status} for the connection test`);
    this.logger.log(`email de teste enviado via brevo: to=${maskEmail(destinatario)}`);
  }

  async sendTransactional(email: TransactionalEmail): Promise<void> {
    const { apiKey, nome, email: remetente } = await this.remetenteEChave();
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
          sender: { name: nome, email: remetente },
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
