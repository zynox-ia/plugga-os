import { Module } from "@nestjs/common";

import { CoreModule } from "../core/core.module";
import { PrismaModule } from "../prisma/prisma.module";
import { ClientesController } from "./clientes.controller";
import { ClientesRepository } from "./clientes.repository";
import { ClientesService } from "./clientes.service";
import { PrismaClientesRepository } from "./prisma-clientes.repository";

@Module({
  imports: [CoreModule, PrismaModule],
  controllers: [ClientesController],
  providers: [
    ClientesService,
    { provide: ClientesRepository, useClass: PrismaClientesRepository },
  ],
})
export class ClientesModule {}
