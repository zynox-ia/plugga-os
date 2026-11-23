import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import {
  criarFornecedorSchema,
  editarFornecedorSchema,
  listarFornecedoresQuerySchema,
  revelarDadosDePagamentoSchema,
  type DadosDePagamentoRevelados,
  type RevelarDadosDePagamento,
  type CriarFornecedor,
  type DesempenhoDoFornecedor,
  type HistoricoDeCotacoesResposta,
  type EditarFornecedor,
  type Fornecedor,
  type ListarFornecedoresQuery,
  type ListarFornecedoresResposta,
} from "@plugga/shared";

import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { Departamento, Tela } from "../core/auth/acesso.decorator";
import { AcessoGuard } from "../core/auth/acesso.guard";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { CurrentPrincipal } from "../core/auth/current-principal.decorator";
import { OriginCheckGuard } from "../core/auth/origin-check.guard";
import { SessionAuthGuard } from "../core/auth/session-auth.guard";
import { FornecedoresRepository } from "./fornecedores.repository";

/**
 * Cadastro de fornecedores de Suprimentos (PLU-326), único para Plugga e Waze.
 * Tudo exige a tela Fornecedores; não há exclusão, só inativação.
 */
@Controller("suprimentos/fornecedores")
@UseGuards(SessionAuthGuard, AcessoGuard)
@Departamento("suprimentos")
@Tela("suprimentos.fornecedores")
export class FornecedoresController {
  constructor(@Inject(FornecedoresRepository) private readonly fornecedores: FornecedoresRepository) {}

  @Get()
  listar(@Query(new ZodValidationPipe(listarFornecedoresQuerySchema)) query: ListarFornecedoresQuery): Promise<ListarFornecedoresResposta> {
    return this.fornecedores.listar(query);
  }

  @Get(":id")
  obter(@Param("id", ParseUUIDPipe) id: string): Promise<Fornecedor> {
    return this.fornecedores.obter(id);
  }

  @Get(":id/desempenho")
  desempenho(@Param("id", ParseUUIDPipe) id: string): Promise<DesempenhoDoFornecedor> {
    return this.fornecedores.desempenho(id);
  }

  @Get(":id/cotacoes")
  cotacoes(@Param("id", ParseUUIDPipe) id: string): Promise<HistoricoDeCotacoesResposta> {
    return this.fornecedores.historicoDeCotacoes(id);
  }

  @Post()
  @HttpCode(201)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  criar(@Body(new ZodValidationPipe(criarFornecedorSchema)) input: CriarFornecedor, @CurrentPrincipal() principal: AuthPrincipal): Promise<Fornecedor> {
    return this.fornecedores.criar(input, principal);
  }

  /** POST porque grava auditoria: quem viu os dados de pagamento completos, quando e por quê. */
  @Post(":id/dados-de-pagamento/revelar")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  revelar(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(revelarDadosDePagamentoSchema)) input: RevelarDadosDePagamento,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<DadosDePagamentoRevelados> {
    return this.fornecedores.revelarDadosDePagamento(id, input, principal);
  }

  @Patch(":id")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  editar(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(editarFornecedorSchema)) input: EditarFornecedor,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<Fornecedor> {
    return this.fornecedores.editar(id, input, principal);
  }

  @Post(":id/inativar")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  inativar(@Param("id", ParseUUIDPipe) id: string, @CurrentPrincipal() principal: AuthPrincipal): Promise<Fornecedor> {
    return this.fornecedores.mudarSituacao(id, false, principal);
  }

  @Post(":id/reativar")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  reativar(@Param("id", ParseUUIDPipe) id: string, @CurrentPrincipal() principal: AuthPrincipal): Promise<Fornecedor> {
    return this.fornecedores.mudarSituacao(id, true, principal);
  }
}
