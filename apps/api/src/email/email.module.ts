import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { AuditModule } from "../audit/audit.module";
import { CoreModule } from "../core/core.module";
import { PrismaSegredoRepository } from "../llm/prisma-segredo.repository.js";
import { SegredoRepository } from "../llm/segredo.repository.js";
import { PrismaModule } from "../prisma/prisma.module";
import { BrevoCofreService, BrevoLeitura } from "./brevo-cofre.service";
import { BrevoController } from "./brevo.controller";
import { BrevoEmailAdapter } from "./brevo-email.adapter";
import { EmailPort } from "./email.port";
import { EmailRoteadorAdapter } from "./email-roteador.adapter";
import { EmailStatusController } from "./email-status.controller";
import { NoopEmailAdapter } from "./noop-email.adapter";
import { PrismaBrevoLeitura } from "./prisma-brevo.leitura";

@Module({
  imports: [AuditModule, CoreModule, PrismaModule],
  controllers: [EmailStatusController, BrevoController],
  providers: [
    NoopEmailAdapter,
    BrevoEmailAdapter,
    BrevoCofreService,
    { provide: SegredoRepository, useClass: PrismaSegredoRepository },
    { provide: BrevoLeitura, useClass: PrismaBrevoLeitura },
    {
      // Seleção por envio (ADR-0010): Brevo conectado pela tela vence; sem ele vale o
      // EMAIL_PROVIDER do ambiente. O padrão seguro nunca envia (noop); brevo envia
      // pela conta do cliente. O adapter Mailpit foi removido em 2026-08-10: o Brevo
      // é o único provedor em produção desde 2026-08-09.
      provide: EmailPort,
      useFactory: (
        config: ConfigService,
        noop: NoopEmailAdapter,
        brevo: BrevoEmailAdapter,
        cofre: BrevoCofreService,
      ): EmailPort => {
        const provider = config.get<string>("EMAIL_PROVIDER", "noop");
        switch (provider) {
          case "noop":
            return new EmailRoteadorAdapter(cofre, brevo, noop);
          case "brevo":
            return new EmailRoteadorAdapter(cofre, brevo, brevo);
          default:
            // Fail safe: um provedor desconhecido nunca pode enviar por acidente.
            throw new Error(`EMAIL_PROVIDER='${provider}' is not a valid email provider (noop|brevo)`);
        }
      },
      inject: [ConfigService, NoopEmailAdapter, BrevoEmailAdapter, BrevoCofreService],
    },
  ],
  exports: [EmailPort],
})
export class EmailModule {}
