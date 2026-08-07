import { Module } from "@nestjs/common";

import { CoreModule } from "../core/core.module";
import { PrismaModule } from "../prisma/prisma.module";
import { PluggamobController } from "./pluggamob.controller";
import { PrismaPluggamobRepository } from "./prisma-pluggamob.repository";
import { PluggamobRepository } from "./pluggamob.repository";
import { PluggamobService } from "./pluggamob.service";

@Module({
  imports: [CoreModule, PrismaModule],
  controllers: [PluggamobController],
  providers: [
    PluggamobService,
    { provide: PluggamobRepository, useClass: PrismaPluggamobRepository },
  ],
})
export class PluggamobModule {}
