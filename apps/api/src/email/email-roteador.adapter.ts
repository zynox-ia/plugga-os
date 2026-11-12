import { Injectable } from "@nestjs/common";

import { BrevoCofreService } from "./brevo-cofre.service";
import { EmailPort, type TransactionalEmail } from "./email.port";

/**
 * Escolhe o provedor a cada envio: Brevo conectado pela tela vence; sem ele,
 * vale o `EMAIL_PROVIDER` do ambiente (padrão `noop`, que nunca envia). Desconectar
 * pela tela volta, portanto, ao comportamento seguro de antes.
 */
@Injectable()
export class EmailRoteadorAdapter extends EmailPort {
  constructor(
    private readonly cofre: BrevoCofreService,
    private readonly brevo: EmailPort,
    readonly padrao: EmailPort,
  ) {
    super();
  }

  async sendTransactional(email: TransactionalEmail): Promise<void> {
    const alvo = (await this.cofre.credenciais()) ? this.brevo : this.padrao;
    return alvo.sendTransactional(email);
  }
}
