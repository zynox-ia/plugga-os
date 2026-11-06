import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

import { opcoesDoPool } from "./opcoes-pool";
import { validarPapelBanco } from "./validar-papel-banco";

/** Pool pré-auth e de gestão de equipe, sem privilégios em tabelas de negócio. */
@Injectable()
export class PrismaAuthService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super(opcoesDoPool("AUTH_DATABASE_URL"));
  }

  async onModuleInit(): Promise<void> {
    await validarPapelBanco(this, "plugga_auth_runtime");
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
