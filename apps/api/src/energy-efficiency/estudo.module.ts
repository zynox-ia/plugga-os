import { Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";

import { CoreModule } from "../core/core.module";
import { LlmModule } from "../llm/llm.module";
import { PrismaModule } from "../prisma/prisma.module";
import { EstudoController } from "./estudo.controller.js";
import { EstudoRepository } from "./estudo.repository.js";
import { EstudoService } from "./estudo.service.js";
import { ArmazenamentoDeFaturas } from "./fatura/armazenamento.js";
import { FaturaController } from "./fatura/fatura.controller.js";
import { FaturaService } from "./fatura/fatura.service.js";
import { PrismaEstudoRepository } from "./prisma-estudo.repository.js";

@Module({
  imports: [
    CoreModule,
    PrismaModule,
    // O gateway vem daqui: a leitura por visão gasta a chave, e gasto sem dono
    // não aparece no relatório de consumo.
    LlmModule,
    // `ThrottlerModule.forRoot` do AuthModule não é global, então o
    // `ThrottlerGuard` da rota de PDF não resolveria aqui — e a API nem subiria.
    // Registro próprio, com o mesmo padrão do módulo de auth; o limite estreito
    // da rota de PDF vem do `@Throttle` no controller.
    ThrottlerModule.forRoot([{ name: "default", ttl: 60_000, limit: 60 }]),
  ],
  controllers: [EstudoController, FaturaController],
  providers: [
    EstudoService,
    FaturaService,
    ArmazenamentoDeFaturas,
    { provide: EstudoRepository, useClass: PrismaEstudoRepository },
  ],
})
export class EnergyEfficiencyModule {}
