import { Module } from "@nestjs/common";

import { CoreModule } from "../core/core.module";
import { PrismaModule } from "../prisma/prisma.module";
import { CommercialController } from "./commercial.controller";
import { CommercialRepository } from "./commercial.repository";
import { CommercialService } from "./commercial.service";
import { PrismaCommercialRepository } from "./prisma-commercial.repository";

@Module({
  imports: [CoreModule, PrismaModule],
  controllers: [CommercialController],
  providers: [
    CommercialService,
    { provide: CommercialRepository, useClass: PrismaCommercialRepository },
  ],
})
export class CommercialModule {}
