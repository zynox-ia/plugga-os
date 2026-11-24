import { Body, Controller, Inject, Param, ParseUUIDPipe, Patch, Post, UseGuards } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import {
  criarCategoriaFinanceiraSchema,
  criarContaCorrenteSchema,
  editarCategoriaFinanceiraSchema,
  editarContaCorrenteSchema,
  type CategoriaFinanceira,
  type ContaCorrente,
  type CriarCategoriaFinanceira,
  type CriarContaCorrente,
  type EditarCategoriaFinanceira,
  type EditarContaCorrente,
} from "@plugga/shared";

import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { Departamento, Tela } from "../core/auth/acesso.decorator";
import { AcessoGuard } from "../core/auth/acesso.guard";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { CurrentPrincipal } from "../core/auth/current-principal.decorator";
import { OriginCheckGuard } from "../core/auth/origin-check.guard";
import { SessionAuthGuard } from "../core/auth/session-auth.guard";
import { FinanceiroHabilitadoGuard } from "./financeiro-habilitado.guard";
import { PrismaCadastrosDoFinanceiroRepository } from "./prisma-cadastros-do-financeiro.repository";

/**
 * O plano de contas e as contas correntes do Plugga OS (PLU-342, S3b). Só a gerência do
 * Financeiro (e a plataforma) grava; a leitura é pelas opções (`GET financeiro/opcoes`).
 * Sem exclusão: `ativa: false` tira dos menus e o lançamento que já usa continua.
 */
@Controller("financeiro")
@UseGuards(FinanceiroHabilitadoGuard, SessionAuthGuard, AcessoGuard, OriginCheckGuard, ThrottlerGuard)
@Departamento("financeiro", "gerente")
@Tela("financeiro.pagar", "financeiro.receber", "financeiro.conciliacao", "financeiro.fiscal")
export class CadastrosDoFinanceiroController {
  constructor(@Inject(PrismaCadastrosDoFinanceiroRepository) private readonly cadastros: PrismaCadastrosDoFinanceiroRepository) {}

  @Post("categorias")
  criarCategoria(
    @Body(new ZodValidationPipe(criarCategoriaFinanceiraSchema)) input: CriarCategoriaFinanceira,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<CategoriaFinanceira> {
    return this.cadastros.criarCategoria(input, principal);
  }

  @Patch("categorias/:id")
  editarCategoria(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(editarCategoriaFinanceiraSchema)) input: EditarCategoriaFinanceira,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<CategoriaFinanceira> {
    return this.cadastros.editarCategoria(id, input, principal);
  }

  @Post("contas-correntes")
  criarConta(
    @Body(new ZodValidationPipe(criarContaCorrenteSchema)) input: CriarContaCorrente,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<ContaCorrente> {
    return this.cadastros.criarConta(input, principal);
  }

  @Patch("contas-correntes/:id")
  editarConta(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(editarContaCorrenteSchema)) input: EditarContaCorrente,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<ContaCorrente> {
    return this.cadastros.editarConta(id, input, principal);
  }
}
