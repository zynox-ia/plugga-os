import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import {
  abrirPedidoDeReposicaoSchema,
  buscarClientesDeCompraQuerySchema,
  criarItemDeEstoqueSchema,
  editarItemDeEstoqueSchema,
  listarItensDeEstoqueQuerySchema,
  listarMovimentacoesQuerySchema,
  registrarMovimentacaoSchema,
  type AbrirPedidoDeReposicao,
  type BuscarClientesDeCompraQuery,
  type BuscarClientesDeCompraResposta,
  type CriarItemDeEstoque,
  type EditarItemDeEstoque,
  type ItemDeEstoque,
  type ListarItensDeEstoqueQuery,
  type ListarItensDeEstoqueResposta,
  type ListarMovimentacoesQuery,
  type ListarMovimentacoesResposta,
  type Movimentacao,
  type OpcoesDeEstoqueResposta,
  type PedidoDeReposicaoAberto,
  type PedidosParaEntradaResposta,
  type RegistrarMovimentacao,
} from "@plugga/shared";

import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { Departamento, Tela } from "../core/auth/acesso.decorator";
import { AcessoGuard } from "../core/auth/acesso.guard";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { CurrentPrincipal } from "../core/auth/current-principal.decorator";
import { OriginCheckGuard } from "../core/auth/origin-check.guard";
import { SessionAuthGuard } from "../core/auth/session-auth.guard";
import { EstoqueService } from "./estoque.service";

/** Estoque de Suprimentos (PLU-332): um cadastro global, com a empresa como campo e filtro. */
@Controller("suprimentos/estoque")
@UseGuards(SessionAuthGuard, AcessoGuard)
@Departamento("suprimentos")
@Tela("suprimentos.estoque")
export class EstoqueController {
  constructor(@Inject(EstoqueService) private readonly estoque: EstoqueService) {}

  @Get("itens")
  listar(@Query(new ZodValidationPipe(listarItensDeEstoqueQuerySchema)) query: ListarItensDeEstoqueQuery): Promise<ListarItensDeEstoqueResposta> {
    return this.estoque.listar(query);
  }

  @Get("itens/:id")
  obter(@Param("id", ParseUUIDPipe) id: string): Promise<ItemDeEstoque> {
    return this.estoque.obter(id);
  }

  @Post("itens")
  @HttpCode(201)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  criar(@Body(new ZodValidationPipe(criarItemDeEstoqueSchema)) input: CriarItemDeEstoque, @CurrentPrincipal() principal: AuthPrincipal): Promise<ItemDeEstoque> {
    return this.estoque.criar(input, principal);
  }

  @Patch("itens/:id")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  editar(@Param("id", ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(editarItemDeEstoqueSchema)) input: EditarItemDeEstoque, @CurrentPrincipal() principal: AuthPrincipal): Promise<ItemDeEstoque> {
    return this.estoque.editar(id, input, principal);
  }

  /** Pedidos que ainda aceitam entrada do item (origem "Compra"): só o mínimo do pedido, com a tela de Estoque. */
  @Get("itens/:id/pedidos-para-entrada")
  pedidosParaEntrada(@Param("id", ParseUUIDPipe) id: string): Promise<PedidosParaEntradaResposta> {
    return this.estoque.pedidosParaEntrada(id);
  }

  @Post("itens/:id/inativar")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  inativar(@Param("id", ParseUUIDPipe) id: string, @CurrentPrincipal() principal: AuthPrincipal): Promise<ItemDeEstoque> {
    return this.estoque.mudarSituacao(id, false, principal);
  }

  @Post("itens/:id/reativar")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  reativar(@Param("id", ParseUUIDPipe) id: string, @CurrentPrincipal() principal: AuthPrincipal): Promise<ItemDeEstoque> {
    return this.estoque.mudarSituacao(id, true, principal);
  }

  @Post("itens/:id/abrir-pedido")
  @HttpCode(201)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  abrirPedido(@Param("id", ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(abrirPedidoDeReposicaoSchema)) input: AbrirPedidoDeReposicao, @CurrentPrincipal() principal: AuthPrincipal): Promise<PedidoDeReposicaoAberto> {
    return this.estoque.abrirPedido(id, input, principal);
  }

  @Get("movimentacoes")
  movimentacoes(@Query(new ZodValidationPipe(listarMovimentacoesQuerySchema)) query: ListarMovimentacoesQuery): Promise<ListarMovimentacoesResposta> {
    return this.estoque.listarMovimentacoes(query);
  }

  @Post("movimentacoes")
  @HttpCode(201)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  registrar(@Body(new ZodValidationPipe(registrarMovimentacaoSchema)) input: RegistrarMovimentacao, @CurrentPrincipal() principal: AuthPrincipal): Promise<Movimentacao> {
    return this.estoque.registrarMovimentacao(input, principal);
  }

  @Get("opcoes")
  opcoes(): Promise<OpcoesDeEstoqueResposta> {
    return this.estoque.opcoes();
  }

  @Get("clientes")
  clientes(@Query(new ZodValidationPipe(buscarClientesDeCompraQuerySchema)) query: BuscarClientesDeCompraQuery): Promise<BuscarClientesDeCompraResposta> {
    return this.estoque.buscarClientes(query);
  }
}
