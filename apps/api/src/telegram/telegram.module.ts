import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { CoreModule } from "../core/core.module";
import { PrismaSegredoRepository } from "../llm/prisma-segredo.repository.js";
import { SegredoRepository } from "../llm/segredo.repository.js";
import { PrismaModule } from "../prisma/prisma.module";
import { PrismaTelegramLeitura } from "./prisma-telegram-leitura.repository";
import { TelegramCofreService, TelegramLeitura } from "./telegram-cofre.service";
import { TelegramController } from "./telegram.controller";
import { TelegramHttpAdapter } from "./telegram-http.adapter";
import { TelegramNotificadorService } from "./telegram-notificador.service";
import { TelegramPort } from "./telegram.port";

/** Telegram da plataforma. O notificador é exportado para os módulos que geram os avisos (lead novo, atividade atrasada). */
@Module({
  imports: [AuditModule, CoreModule, PrismaModule],
  controllers: [TelegramController],
  providers: [
    TelegramCofreService,
    TelegramNotificadorService,
    { provide: TelegramPort, useClass: TelegramHttpAdapter },
    { provide: TelegramLeitura, useClass: PrismaTelegramLeitura },
    { provide: SegredoRepository, useClass: PrismaSegredoRepository },
  ],
  exports: [TelegramNotificadorService],
})
export class TelegramModule {}
