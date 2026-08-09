import { BadRequestException, Controller, Get, Query, UseGuards } from "@nestjs/common";
import type { RoleKey } from "@plugga/shared";

import { DevAuthGuard } from "../core/auth/dev-auth.guard";
import { Roles } from "../core/auth/roles.decorator";
import { RolesGuard } from "../core/auth/roles.guard";
import { ConsumoService, type ResumoDeConsumo } from "./consumo.service.js";

/**
 * Quem pode ver quanto a chave gastou.
 *
 * Custo é assunto de quem decide orçamento e de quem opera a integração. Não é
 * dado sensível de cliente, mas também não é informação de todo mundo: um número
 * de gasto fora de contexto circula mal.
 */
const VER_CONSUMO: readonly RoleKey[] = ["admin", "diretoria", "financeiro", "tech"];

/** Data em ISO ou nada; data inválida é erro, não silêncio. */
function data(valor: string | undefined, campo: string): Date | undefined {
  if (!valor) return undefined;
  const convertida = new Date(valor);
  if (Number.isNaN(convertida.getTime())) {
    throw new BadRequestException(`${campo} não é uma data válida`);
  }
  return convertida;
}

@Controller("llm/consumo")
@UseGuards(DevAuthGuard, RolesGuard)
export class ConsumoController {
  constructor(private readonly consumo: ConsumoService) {}

  /**
   * O relatório inteiro numa chamada: total, ranking por processo, por modelo e
   * a série diária. É uma tela só, e economiza três idas ao servidor.
   */
  @Get()
  @Roles(...VER_CONSUMO)
  async resumo(
    @Query("desde") desde?: string,
    @Query("ate") ate?: string,
  ): Promise<ResumoDeConsumo> {
    return this.consumo.resumo({
      desde: data(desde, "desde"),
      ate: data(ate, "ate"),
    });
  }
}
