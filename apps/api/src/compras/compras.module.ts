import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { CoreModule } from "../core/core.module";
import { MovimentosDeEstoque } from "../estoque/movimentos-de-estoque";
import { ArmazenamentoDeDocumentos } from "../lead-documentos/armazenamento-de-documentos";
import { PrismaModule } from "../prisma/prisma.module";
import { ComprasController } from "./compras.controller";
import { ComprasService, RELOGIO_DE_COMPRAS } from "./compras.service";
import { PrismaComprasRepository } from "./prisma-compras.repository";

/** Anexos no mesmo armazenamento dos documentos do lead, sob o prefixo `suprimentos/compras/`. */
@Module({
  imports: [AuditModule, CoreModule, PrismaModule],
  controllers: [ComprasController],
  providers: [
    ComprasService,
    PrismaComprasRepository,
    ArmazenamentoDeDocumentos,
    MovimentosDeEstoque,
    { provide: RELOGIO_DE_COMPRAS, useValue: () => new Date() },
  ],
  // O Estoque abre pedido de reposição pelo mesmo repositório e usa o mesmo relógio;
  // a Engenharia pede material pelo serviço (PLU-345).
  exports: [PrismaComprasRepository, RELOGIO_DE_COMPRAS, ComprasService],
})
export class ComprasModule {}
