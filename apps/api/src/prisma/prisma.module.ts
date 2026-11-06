import { Module } from "@nestjs/common";

import { PrismaService } from "./prisma.service";
import { PrismaAuthService } from "./prisma-auth.service";
import { PrismaJobsService } from "./prisma-jobs.service";

@Module({
  providers: [PrismaService, PrismaAuthService, PrismaJobsService],
  exports: [PrismaService, PrismaAuthService, PrismaJobsService],
})
export class PrismaModule {}
