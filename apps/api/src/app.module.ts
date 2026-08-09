import path from "node:path";

import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { AuditModule } from "./audit/audit.module";
import { AuthModule } from "./auth/auth.module";
import { WhatsappModule } from "./channels/whatsapp/whatsapp.module";
import { ClientesModule } from "./clientes/clientes.module";
import { CommercialModule } from "./commercial/commercial.module";
import { validateEnvironment } from "./config/environment";
import { CoreModule } from "./core/core.module";
import { EnergyEfficiencyModule } from "./energy-efficiency/estudo.module";
import { LlmModule } from "./llm/llm.module";
import { EnergyModule } from "./energy/energy.module";
import { HealthModule } from "./health/health.module";
import { BitrixModule } from "./integrations/bitrix/bitrix.module";
import { IntegrationsModule } from "./integrations/integrations.module";
import { JobsModule } from "./jobs/jobs.module";
import { JobsQueueModule } from "./jobs/queue/jobs-queue.module";
import { LoggingModule } from "./logging/logging.module";
import { PluggamobModule } from "./pluggamob/pluggamob.module";

const monorepoRootEnvPath = path.resolve(__dirname, "../../../.env");

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: monorepoRootEnvPath,
      validate: validateEnvironment,
    }),
    LoggingModule,
    CoreModule,
    HealthModule,
    AuthModule,
    AuditModule,
    WhatsappModule,
    IntegrationsModule,
    JobsModule,
    PluggamobModule,
    ClientesModule,
    CommercialModule,
    EnergyModule,
    EnergyEfficiencyModule,
    LlmModule,
    JobsQueueModule,
    BitrixModule,
  ],
})
export class AppModule {}
