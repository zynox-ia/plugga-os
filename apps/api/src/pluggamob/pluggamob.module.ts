import { Module } from "@nestjs/common";

import { CoreModule } from "../core/core.module";
import { PrismaModule } from "../prisma/prisma.module";
import { PluggamobController } from "./pluggamob.controller";
import { PrismaPluggamobRepository } from "./prisma-pluggamob.repository";
import { PluggamobRepository } from "./pluggamob.repository";
import { PluggamobService } from "./pluggamob.service";
import { PrismaSettlementsRepository } from "./settlements/prisma-settlements.repository";
import { SettlementsRepository } from "./settlements/settlements.repository";
import { SettlementsService } from "./settlements/settlements.service";

@Module({
  imports: [CoreModule, PrismaModule],
  controllers: [PluggamobController],
  providers: [
    PluggamobService,
    SettlementsService,
    { provide: PluggamobRepository, useClass: PrismaPluggamobRepository },
    { provide: SettlementsRepository, useClass: PrismaSettlementsRepository },
  ],
})
export class PluggamobModule {}
