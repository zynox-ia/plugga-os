import { Module } from "@nestjs/common";

import { CoreModule } from "../core/core.module";
import { PrismaModule } from "../prisma/prisma.module";
import { ArmazenamentoDeCotacoes } from "./armazenamento-de-cotacoes";
import {
  ComprasEscopoRepository,
  PrismaComprasEscopoRepository,
} from "./compras-escopo.repository";
import { ComprasController } from "./compras.controller";
import { ComprasRepository } from "./compras.repository";
import { ComprasService } from "./compras.service";
import { PrismaComprasRepository } from "./prisma-compras.repository";

@Module({
  imports: [CoreModule, PrismaModule],
  controllers: [ComprasController],
  providers: [
    ComprasService,
    ArmazenamentoDeCotacoes,
    { provide: ComprasRepository, useClass: PrismaComprasRepository },
    { provide: ComprasEscopoRepository, useClass: PrismaComprasEscopoRepository },
  ],
})
export class ComprasModule {}
