import { Inject, Injectable, Logger } from "@nestjs/common";
import { eventNames } from "@plugga/shared";

import { AuditRepository } from "../audit/audit.repository";
import { maskEmail } from "../email/email.util";
import type { JobHandler } from "../jobs/queue/job-handler";
import { AuthTokenIssuer } from "./auth-token-issuer.service";
import { AuthRepository } from "./auth.repository";

/** Chave do job na fila BullMQ (ADR-0007/0011). */
export const RESET_EMAIL_JOB_KEY = "auth.reset-email";

export interface ResetEmailPayload {
  email: string;
}

/**
 * Trabalho de verdade da redefinição de senha (US11, T117): procurar a conta,
 * emitir o token e mandar o e-mail. Fica FORA do caminho da requisição porque é
 * ele que custa tempo só para quem existe (consulta do token, gravação, envio
 * pelo provedor) — se rodasse dentro de `POST /auth/reset/request`, o tempo de
 * resposta contaria a quem pergunta se a conta existe. A requisição só
 * enfileira, igual para qualquer e-mail.
 *
 * Roda no worker BullMQ quando `JOBS_ENABLED`; sem a fila, o
 * `ResetEmailDispatcher` o executa em segundo plano no próprio processo.
 */
@Injectable()
export class ResetEmailHandler implements JobHandler<ResetEmailPayload> {
  readonly jobKey = RESET_EMAIL_JOB_KEY;
  private readonly logger = new Logger(ResetEmailHandler.name);

  constructor(
    @Inject(AuthRepository) private readonly repository: AuthRepository,
    @Inject(AuthTokenIssuer) private readonly tokens: AuthTokenIssuer,
    @Inject(AuditRepository) private readonly audit: AuditRepository,
  ) {}

  async process(payload: ResetEmailPayload): Promise<void> {
    const user = await this.repository.findUserByEmail(payload.email);

    // Só conta ATIVA recebe token. Conta inexistente ou desativada termina aqui,
    // sem erro e sem log com o e-mail: nada que diferencie o caso para quem
    // olha de fora, e a fila não tenta de novo o que não é falha.
    if (!user || user.status !== "active") {
      return;
    }

    // Falha do provedor de e-mail PROPAGA: no BullMQ vira nova tentativa com
    // recuo; no modo em processo, o dispatcher registra e segue.
    await this.tokens.sendReset(user);
    await this.audit.appendEvent({
      eventName: eventNames.authResetRequested,
      entityType: "user",
      entityId: user.id,
      actorType: "system",
      actorId: null,
      payload: {},
      occurredAt: new Date(),
    });
    this.logger.debug(`reset email enviado: to=${maskEmail(user.email)}`);
  }
}
