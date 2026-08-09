import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { CoreModule } from "../core/core.module";
import { PrismaModule } from "../prisma/prisma.module";
import { ChaveController } from "./chave.controller.js";
import { ChaveDeLlmService } from "./chave.service.js";
import { ConsumoController } from "./consumo.controller.js";
import { ConsumoRepository } from "./consumo.repository.js";
import { ConsumoService } from "./consumo.service.js";
import { OpenRouterGateway } from "./openrouter.gateway.js";
import { PrismaConsumoRepository } from "./prisma-consumo.repository.js";
import { PrismaSegredoRepository } from "./prisma-segredo.repository.js";
import { SegredoRepository } from "./segredo.repository.js";

/**
 * A chave de LLM e a contabilidade dela.
 *
 * O gateway é exportado para os outros módulos usarem — e é a única forma
 * suportada de falar com modelo neste sistema. Quem instanciar cliente próprio
 * gasta dinheiro que não aparece no relatório.
 */
@Module({
  imports: [AuditModule, CoreModule, PrismaModule],
  controllers: [ChaveController, ConsumoController],
  providers: [
    ChaveDeLlmService,
    ConsumoService,
    OpenRouterGateway,
    { provide: ConsumoRepository, useClass: PrismaConsumoRepository },
    { provide: SegredoRepository, useClass: PrismaSegredoRepository },
  ],
  exports: [OpenRouterGateway],
})
export class LlmModule {}
