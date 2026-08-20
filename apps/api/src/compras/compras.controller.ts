import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { FilesInterceptor } from "@nestjs/platform-express";
import {
  companyKeySchema,
  confirmarRecebimentoRequestSchema,
  criarFornecedorRequestSchema,
  criarObraRequestSchema,
  criarPedidoRequestSchema,
  decisaoAprovacaoRequestSchema,
  decisaoEstoqueRequestSchema,
  pedidoListaQuerySchema,
  periodoQuerySchema,
  registrarPagamentoRequestSchema,
  renegociarPrazoRequestSchema,
  selecionarCotacaoRequestSchema,
  triagemRequestSchema,
  validarNecessidadeRequestSchema,
  type CompanyKey,
  type ConfirmarRecebimentoRequest,
  type CriarFornecedorRequest,
  type CriarObraRequest,
  type DecisaoAprovacaoRequest,
  type DecisaoEstoqueRequest,
  type DiagnosticoCompras,
  type Fornecedor,
  type FornecedorLista,
  type Obra,
  type ObraLista,
  type PedidoDetalhe,
  type PedidoLista,
  type PedidoListaQuery,
  type PeriodoQuery,
  type RegistrarPagamentoRequest,
  type RenegociarPrazoRequest,
  type ScorecardCompras,
  type SelecionarCotacaoRequest,
  type TriagemRequest,
  type ValidarNecessidadeRequest,
} from "@plugga/shared";

import { ZodValidationPipe } from "../common/zod-validation.pipe";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { CurrentPrincipal } from "../core/auth/current-principal.decorator";
import { DevAuthGuard } from "../core/auth/dev-auth.guard";
import { OriginCheckGuard } from "../core/auth/origin-check.guard";
import { Roles } from "../core/auth/roles.decorator";
import { RolesGuard } from "../core/auth/roles.guard";
import { TIPOS_ACEITOS } from "./armazenamento-de-cotacoes";
import {
  ABRIR_PEDIDO,
  CADASTRAR_APOIO,
  CONFIRMAR_RECEBIMENTO,
  DECIDIR_FINANCEIRO,
  LER_COMPRAS,
  OPERAR_COMPRAS,
  RENEGOCIAR_PRAZO,
} from "./compras.permissions";
import { ComprasService, type ArquivoDeCotacao } from "./compras.service";

/** Orçamento anexado; acima disso é engano ou abuso. */
const TAMANHO_MAXIMO = 20 * 1024 * 1024;
const MAXIMO_DE_ANEXOS = 20;

/**
 * Compras e Suprimentos — POP-COMP-001 v2.3.
 *
 * A empresa vem em toda requisição e é provada pelo `ComprasService` antes de
 * qualquer acesso a dado: o `RolesGuard` da plataforma ainda responde "tem o
 * papel?", não "tem o papel *nesta empresa*".
 */
@Controller("compras")
@UseGuards(DevAuthGuard, RolesGuard)
@Roles(...LER_COMPRAS)
export class ComprasController {
  constructor(@Inject(ComprasService) private readonly service: ComprasService) {}

  @Get("pedidos")
  listarPedidos(
    @Query(new ZodValidationPipe(pedidoListaQuerySchema)) query: PedidoListaQuery,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<PedidoLista> {
    return this.service.listarPedidos(query, principal);
  }

  @Get("pedidos/:id")
  pedido(
    @Param("id", ParseUUIDPipe) id: string,
    @Query("companyId", new ZodValidationPipe(companyKeySchema)) companyId: CompanyKey,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<PedidoDetalhe> {
    return this.service.pedido(id, companyId, principal);
  }

  /**
   * Geração do pedido — POP §2.1.
   *
   * `multipart` porque o orçamento anexado é campo obrigatório da criação, e
   * não um segundo passo: o corpo traz o JSON em `payload` e os arquivos em
   * `cotacoes`, na mesma ordem do array `cotacoes` do JSON.
   */
  @Post("pedidos")
  @HttpCode(201)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @Roles(...ABRIR_PEDIDO)
  @UseInterceptors(
    FilesInterceptor("cotacoes", MAXIMO_DE_ANEXOS, { limits: { fileSize: TAMANHO_MAXIMO } }),
  )
  criarPedido(
    @Body("payload") payload: string,
    @UploadedFiles() arquivos: ArquivoDeCotacao[] | undefined,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<PedidoDetalhe> {
    const enviados = arquivos ?? [];
    if (enviados.length === 0) {
      throw new BadRequestException(
        "o pedido exige ao menos um orçamento anexado (POP-COMP-001 §2.1)",
      );
    }
    for (const arquivo of enviados) {
      if (!TIPOS_ACEITOS.includes(arquivo.mimetype)) {
        throw new BadRequestException(`tipo de arquivo não aceito: ${arquivo.mimetype}`);
      }
    }

    const input = new ZodValidationPipe(criarPedidoRequestSchema).transform(
      this.lerPayload(payload),
    );
    return this.service.criarPedido(input, enviados, principal);
  }

  private lerPayload(payload: string): unknown {
    if (!payload) {
      throw new BadRequestException("o campo payload é obrigatório");
    }
    try {
      return JSON.parse(payload);
    } catch {
      throw new BadRequestException("payload precisa ser JSON válido");
    }
  }

  @Post("pedidos/:id/triagem")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @Roles(...OPERAR_COMPRAS)
  triagem(
    @Param("id", ParseUUIDPipe) id: string,
    @Query("companyId", new ZodValidationPipe(companyKeySchema)) companyId: CompanyKey,
    @Body(new ZodValidationPipe(triagemRequestSchema)) input: TriagemRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<PedidoDetalhe> {
    return this.service.triagem(id, companyId, input, principal);
  }

  @Post("pedidos/:id/estoque")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @Roles(...OPERAR_COMPRAS)
  decidirEstoque(
    @Param("id", ParseUUIDPipe) id: string,
    @Query("companyId", new ZodValidationPipe(companyKeySchema)) companyId: CompanyKey,
    @Body(new ZodValidationPipe(decisaoEstoqueRequestSchema)) input: DecisaoEstoqueRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<PedidoDetalhe> {
    return this.service.decidirEstoque(id, companyId, input, principal);
  }

  @Post("pedidos/:id/necessidade")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @Roles(...OPERAR_COMPRAS)
  validarNecessidade(
    @Param("id", ParseUUIDPipe) id: string,
    @Query("companyId", new ZodValidationPipe(companyKeySchema)) companyId: CompanyKey,
    @Body(new ZodValidationPipe(validarNecessidadeRequestSchema)) input: ValidarNecessidadeRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<PedidoDetalhe> {
    return this.service.validarNecessidade(id, companyId, input, principal);
  }

  @Post("pedidos/:id/cotacao-selecionada")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @Roles(...OPERAR_COMPRAS)
  selecionarCotacao(
    @Param("id", ParseUUIDPipe) id: string,
    @Query("companyId", new ZodValidationPipe(companyKeySchema)) companyId: CompanyKey,
    @Body(new ZodValidationPipe(selecionarCotacaoRequestSchema)) input: SelecionarCotacaoRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<PedidoDetalhe> {
    return this.service.selecionarCotacao(id, companyId, input, principal);
  }

  @Post("pedidos/:id/aprovacao")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @Roles(...DECIDIR_FINANCEIRO)
  decidirAprovacao(
    @Param("id", ParseUUIDPipe) id: string,
    @Query("companyId", new ZodValidationPipe(companyKeySchema)) companyId: CompanyKey,
    @Body(new ZodValidationPipe(decisaoAprovacaoRequestSchema)) input: DecisaoAprovacaoRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<PedidoDetalhe> {
    return this.service.decidirAprovacao(id, companyId, input, principal);
  }

  @Post("pedidos/:id/pagamento")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @Roles(...DECIDIR_FINANCEIRO)
  registrarPagamento(
    @Param("id", ParseUUIDPipe) id: string,
    @Query("companyId", new ZodValidationPipe(companyKeySchema)) companyId: CompanyKey,
    @Body(new ZodValidationPipe(registrarPagamentoRequestSchema)) input: RegistrarPagamentoRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<PedidoDetalhe> {
    return this.service.registrarPagamento(id, companyId, input, principal);
  }

  @Post("pedidos/:id/recebimento")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @Roles(...CONFIRMAR_RECEBIMENTO)
  confirmarRecebimento(
    @Param("id", ParseUUIDPipe) id: string,
    @Query("companyId", new ZodValidationPipe(companyKeySchema)) companyId: CompanyKey,
    @Body(new ZodValidationPipe(confirmarRecebimentoRequestSchema)) input: ConfirmarRecebimentoRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<PedidoDetalhe> {
    return this.service.confirmarRecebimento(id, companyId, input, principal);
  }

  @Post("pedidos/:id/prazo")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @Roles(...RENEGOCIAR_PRAZO)
  renegociarPrazo(
    @Param("id", ParseUUIDPipe) id: string,
    @Query("companyId", new ZodValidationPipe(companyKeySchema)) companyId: CompanyKey,
    @Body(new ZodValidationPipe(renegociarPrazoRequestSchema)) input: RenegociarPrazoRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<PedidoDetalhe> {
    return this.service.renegociarPrazo(id, companyId, input, principal);
  }

  @Get("scorecard")
  scorecard(
    @Query(new ZodValidationPipe(periodoQuerySchema)) query: PeriodoQuery,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<ScorecardCompras> {
    return this.service.scorecard(query, principal);
  }

  @Get("diagnostico")
  diagnostico(
    @Query(new ZodValidationPipe(periodoQuerySchema)) query: PeriodoQuery,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<DiagnosticoCompras> {
    return this.service.diagnostico(query, principal);
  }

  @Get("fornecedores")
  listarFornecedores(
    @Query("companyId", new ZodValidationPipe(companyKeySchema)) companyId: CompanyKey,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<FornecedorLista> {
    return this.service.listarFornecedores(companyId, principal);
  }

  @Post("fornecedores")
  @HttpCode(201)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @Roles(...CADASTRAR_APOIO)
  criarFornecedor(
    @Body(new ZodValidationPipe(criarFornecedorRequestSchema)) input: CriarFornecedorRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<Fornecedor> {
    return this.service.criarFornecedor(input, principal);
  }

  @Get("obras")
  listarObras(
    @Query("companyId", new ZodValidationPipe(companyKeySchema)) companyId: CompanyKey,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<ObraLista> {
    return this.service.listarObras(companyId, principal);
  }

  @Post("obras")
  @HttpCode(201)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @Roles(...CADASTRAR_APOIO)
  criarObra(
    @Body(new ZodValidationPipe(criarObraRequestSchema)) input: CriarObraRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<Obra> {
    return this.service.criarObra(input, principal);
  }
}
