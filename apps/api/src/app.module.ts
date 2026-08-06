import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { AuditModule } from "./audit/audit.module";
import { WhatsappModule } from "./channels/whatsapp/whatsapp.module";
import { validateEnvironment } from "./config/environment";
import { CoreModule } from "./core/core.module";
import { HealthModule } from "./health/health.module";
import { LoggingModule } from "./logging/logging.module";
import { PrismaModule } from "./prisma/prisma.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    LoggingModule,
    PrismaModule,
    CoreModule,
    HealthModule,
    AuditModule,
    WhatsappModule,
  ],
})
export class AppModule {}
