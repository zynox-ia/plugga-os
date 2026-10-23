import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import {
  consultaDeConsumoSchema,
  type ConsultaDeConsumo,
  type ResumoDeConsumo,
  type RoleKey,
} from "@plugga/shared";

import { ZodValidationPipe } from "../common/zod-validation.pipe";

import { SessionAuthGuard } from "../core/auth/session-auth.guard";
import { Roles } from "../core/auth/roles.decorator";
import { RolesGuard } from "../core/auth/roles.guard";
import { ConsumoService } from "./consumo.service.js";

/**
 * Quem pode ver quanto a chave gastou.
 *
 * Custo é assunto de quem decide orçamento e de quem opera a integração. Não é
 * dado sensível de cliente, mas também não é informação de todo mundo: um número
 * de gasto fora de contexto circula mal.
 */
const VER_CONSUMO: readonly RoleKey[] = ["admin", "diretoria", "financeiro", "tech"];

@Controller("llm/consumo")
@UseGuards(SessionAuthGuard, RolesGuard)
export class ConsumoController {
  constructor(private readonly consumo: ConsumoService) {}

  /**
   * O relatório inteiro numa chamada: total, ranking por processo, por modelo e
   * a série diária. É uma tela só, e economiza três idas ao servidor.
   */
  @Get()
  @Roles(...VER_CONSUMO)
  async resumo(
    @Query(new ZodValidationPipe(consultaDeConsumoSchema)) { desde, ate }: ConsultaDeConsumo,
  ): Promise<ResumoDeConsumo> {
    return this.consumo.resumo({
      desde: desde ? new Date(desde) : undefined,
      ate: ate ? new Date(ate) : undefined,
    });
  }
}
