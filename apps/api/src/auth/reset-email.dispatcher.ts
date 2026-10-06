import { createHash } from "node:crypto";

import { Inject, Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { maskEmail } from "../email/email.util";
import { JobsQueue } from "../jobs/queue/jobs-queue.port";
import { RESET_EMAIL_JOB_KEY, ResetEmailHandler } from "./reset-email.handler";

/**
 * Entrega o pedido de redefinição ao trabalho que faz o envio (US11, T117).
 *
 * O contrato é: `solicitar()` faz EXATAMENTE a mesma coisa para qualquer
 * e-mail — existente, inexistente, desativado. Não consulta o banco, não emite
 * token, não fala com o provedor de e-mail; só enfileira e devolve. Assim a
 * resposta e o tempo da requisição não dizem se a conta existe.
 *
 * - `JOBS_ENABLED`: enfileira no BullMQ (`apps/api/src/jobs/queue`), com chave
 *   de deduplicação por e-mail: pedidos repetidos enquanto o primeiro espera ou
 *   roda não geram e-mails em rajada para a mesma caixa.
 * - Fila desligada (padrão local e dos testes) ou fora do ar: executa o mesmo
 *   handler em segundo plano, no processo, SEM esperar. O envio perde a
 *   garantia de retentativa, mas o comportamento observável é o mesmo.
 */
@Injectable()
export class ResetEmailDispatcher implements OnModuleDestroy {
  private readonly logger = new Logger(ResetEmailDispatcher.name);
  private readonly emAndamento = new Set<Promise<void>>();

  constructor(
    @Inject(JobsQueue) private readonly queue: JobsQueue,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(ResetEmailHandler) private readonly handler: ResetEmailHandler,
  ) {}

  async solicitar(email: string): Promise<void> {
    const payload = { email };

    if (this.config.get<boolean>("JOBS_ENABLED", false)) {
      try {
        await this.queue.enqueue(RESET_EMAIL_JOB_KEY, payload, {
          dedupeKey: `${RESET_EMAIL_JOB_KEY}:${createHash("sha256").update(email.toLowerCase()).digest("hex")}`,
          triggeredBy: "auth.reset",
        });
        return;
      } catch (erro) {
        // Redis fora do ar não pode virar 500 só para quem existe: cai para o
        // segundo plano, e a resposta continua igual para todos.
        this.logger.warn(
          `fila indisponível para o reset, enviando em segundo plano: ${erro instanceof Error ? erro.message : String(erro)}`,
        );
      }
    }

    this.executarEmSegundoPlano(payload);
  }

  /** Espera os envios em segundo plano pendentes. Para testes e para o desligamento. */
  async aguardarPendentes(): Promise<void> {
    while (this.emAndamento.size > 0) {
      await Promise.allSettled([...this.emAndamento]);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.aguardarPendentes();
  }

  private executarEmSegundoPlano(payload: { email: string }): void {
    const tarefa = Promise.resolve()
      // Cede o turno: a requisição responde antes de o trabalho começar.
      .then(() => new Promise<void>((resolve) => setImmediate(resolve)))
      .then(() => this.handler.process(payload))
      .catch((erro: unknown) => {
        // O e-mail nunca vai para o log em claro (mesmo critério do restante do módulo).
        this.logger.warn(
          `reset email delivery failed: to=${maskEmail(payload.email)}: ${erro instanceof Error ? erro.message : String(erro)}`,
        );
      })
      .finally(() => {
        this.emAndamento.delete(tarefa);
      });
    this.emAndamento.add(tarefa);
  }
}
