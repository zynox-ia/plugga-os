import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { ComprasModule } from "../compras/compras.module";
import { CoreModule } from "../core/core.module";
import { PrismaModule } from "../prisma/prisma.module";
import { EstoqueController } from "./estoque.controller";
import { EstoqueService } from "./estoque.service";
import { MovimentosDeEstoque } from "./movimentos-de-estoque";
import { PrismaEstoqueRepository } from "./prisma-estoque.repository";

/** Importa Compras para o "Abrir pedido de compra"; Compras usa `MovimentosDeEstoque` por conta própria, sem importar este módulo. */
@Module({
  imports: [AuditModule, CoreModule, PrismaModule, ComprasModule],
  controllers: [EstoqueController],
  providers: [EstoqueService, PrismaEstoqueRepository, MovimentosDeEstoque],
})
export class EstoqueModule {}
