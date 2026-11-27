import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import {
  consultaDeConsumoSchema,
  type ConsultaDeConsumo,
  type ResumoDeConsumo,
} from "@plugga/shared";

import { ZodValidationPipe } from "../common/zod-validation.pipe";

import { SessionAuthGuard } from "../core/auth/session-auth.guard";
import { Departamento, Tela } from "../core/auth/acesso.decorator";
import { AcessoGuard } from "../core/auth/acesso.guard";
import { ConsumoService } from "./consumo.service.js";

/**
 * Quem pode ver quanto a chave gastou.
 *
 * Custo é assunto de quem decide orçamento e de quem opera a integração. Não é
 * dado sensível de cliente, mas também não é informação de todo mundo: um número
 * de gasto fora de contexto circula mal.
 */
/**
 * As telas do Financeiro que abrem o consumo: as quatro de antes da tela de
 * Relatórios (PLU-360). Lista fechada, para uma tela nova do departamento não
 * abrir o custo da IA sem decisão.
 */
const TELAS_DO_CONSUMO = ["financeiro.pagar", "financeiro.receber", "financeiro.conciliacao", "financeiro.fiscal"] as const;

@Controller("llm/consumo")
@UseGuards(SessionAuthGuard, AcessoGuard)
export class ConsumoController {
  constructor(private readonly consumo: ConsumoService) {}

  /**
   * O relatório inteiro numa chamada: total, ranking por processo, por modelo e
   * a série diária. É uma tela só, e economiza três idas ao servidor.
   */
  @Get()
  @Departamento("financeiro", "gerente")
  @Tela(...TELAS_DO_CONSUMO)
  async resumo(
    @Query(new ZodValidationPipe(consultaDeConsumoSchema)) { desde, ate }: ConsultaDeConsumo,
  ): Promise<ResumoDeConsumo> {
    return this.consumo.resumo({
      desde: desde ? new Date(desde) : undefined,
      ate: ate ? new Date(ate) : undefined,
    });
  }
}
