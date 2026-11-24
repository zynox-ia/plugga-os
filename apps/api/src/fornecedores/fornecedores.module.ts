import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { CoreModule } from "../core/core.module";
import { PrismaModule } from "../prisma/prisma.module";
import { FornecedoresController } from "./fornecedores.controller";
import { FornecedoresRepository } from "./fornecedores.repository";
import { PrismaFornecedoresRepository } from "./prisma-fornecedores.repository";

@Module({
  imports: [AuditModule, CoreModule, PrismaModule],
  controllers: [FornecedoresController],
  providers: [{ provide: FornecedoresRepository, useClass: PrismaFornecedoresRepository }],
  exports: [FornecedoresRepository],
})
export class FornecedoresModule {}
