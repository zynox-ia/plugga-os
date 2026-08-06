import { Module } from "@nestjs/common";

import { CoreModule } from "../core/core.module";
import { PrismaModule } from "../prisma/prisma.module";
import { JobsController } from "./jobs.controller";
import { JobsRepository } from "./jobs.repository";
import { JobsService } from "./jobs.service";
import { PrismaJobsRepository } from "./prisma-jobs.repository";

@Module({
  imports: [CoreModule, PrismaModule],
  controllers: [JobsController],
  providers: [
    JobsService,
    { provide: JobsRepository, useClass: PrismaJobsRepository },
  ],
})
export class JobsModule {}
