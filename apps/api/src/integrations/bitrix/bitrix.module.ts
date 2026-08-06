import { Inject, Module, type OnModuleInit } from "@nestjs/common";

import { CoreModule } from "../../core/core.module";
import { JobHandlerRegistry } from "../../jobs/queue/job-handler-registry";
import { JobsQueueModule } from "../../jobs/queue/jobs-queue.module";
import { PrismaModule } from "../../prisma/prisma.module";
import { BitrixController } from "./bitrix.controller";
import { BitrixImportService } from "./bitrix-import.service";
import { BitrixOpmImportHandler } from "./bitrix-opm-import.handler";
import { BitrixReadClient } from "./bitrix-read.client";
import { BitrixRepository } from "./bitrix.repository";
import { HttpBitrixReadClient } from "./http-bitrix-read.client";
import { PrismaBitrixRepository } from "./prisma-bitrix.repository";

/**
 * Bitrix Migrator (read_only, temporary — ADR-0009). Reads one prioritized
 * domain (OPM/C7) from Bitrix and mirrors it into the OS Postgres via an
 * idempotent BullMQ job. Read-only by construction; no write path to Bitrix.
 */
@Module({
  imports: [CoreModule, PrismaModule, JobsQueueModule],
  controllers: [BitrixController],
  providers: [
    { provide: BitrixReadClient, useClass: HttpBitrixReadClient },
    { provide: BitrixRepository, useClass: PrismaBitrixRepository },
    BitrixImportService,
    BitrixOpmImportHandler,
  ],
})
export class BitrixModule implements OnModuleInit {
  constructor(
    @Inject(JobHandlerRegistry) private readonly registry: JobHandlerRegistry,
    @Inject(BitrixOpmImportHandler)
    private readonly opmImportHandler: BitrixOpmImportHandler,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.opmImportHandler);
  }
}
