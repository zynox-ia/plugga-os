import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

import { opcoesDoPool } from "./opcoes-pool";
import { validarPapelBanco } from "./validar-papel-banco";

/** Pool do recorder/espelho; sem acesso a credenciais ou dados comerciais. */
@Injectable()
export class PrismaJobsService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super(opcoesDoPool("JOBS_DATABASE_URL", process.env.JOBS_ENABLED === "true"));
  }

  async onModuleInit(): Promise<void> {
    if (process.env.JOBS_ENABLED === "true") await validarPapelBanco(this, "plugga_jobs_runtime");
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
