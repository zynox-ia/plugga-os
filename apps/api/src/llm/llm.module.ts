import { Module } from "@nestjs/common";

import { CoreModule } from "../core/core.module";
import { PrismaModule } from "../prisma/prisma.module";
import { ConsumoController } from "./consumo.controller.js";
import { ConsumoRepository } from "./consumo.repository.js";
import { ConsumoService } from "./consumo.service.js";
import { OpenRouterGateway } from "./openrouter.gateway.js";
import { PrismaConsumoRepository } from "./prisma-consumo.repository.js";

/**
 * A chave de LLM e a contabilidade dela.
 *
 * O gateway é exportado para os outros módulos usarem — e é a única forma
 * suportada de falar com modelo neste sistema. Quem instanciar cliente próprio
 * gasta dinheiro que não aparece no relatório.
 */
@Module({
  imports: [CoreModule, PrismaModule],
  controllers: [ConsumoController],
  providers: [
    ConsumoService,
    OpenRouterGateway,
    { provide: ConsumoRepository, useClass: PrismaConsumoRepository },
  ],
  exports: [OpenRouterGateway],
})
export class LlmModule {}
