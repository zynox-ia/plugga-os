import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ThrottlerGuard } from "@nestjs/throttler";
import {
  ARQUIVO_DE_COMPRA_MAX_BYTES,
  acaoDoPedidoSchema,
  buscarClientesDeCompraQuerySchema,
  criarObraSchema,
  criarPedidoDeCompraSchema,
  editarPedidoDeCompraSchema,
  listarPedidosDeCompraQuerySchema,
  quadroDeComprasQuerySchema,
  registrarCotacaoSchema,
  type AcaoDoPedido,
  type BuscarClientesDeCompraQuery,
  type BuscarClientesDeCompraResposta,
  type CriarObra,
  type CriarPedidoDeCompra,
  type EditarPedidoDeCompra,
  type ListarPedidosDeCompraQuery,
  type ListarPedidosDeCompraResposta,
  type ObraDeCompra,
  type OpcoesDeCompraResposta,
  type PedidoDeCompra,
  type QuadroDeComprasQuery,
  type QuadroDeComprasResposta,
  type RegistrarCotacao,
} from "@plugga/shared";
import type { Response } from "express";

import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { Departamento, Tela } from "../core/auth/acesso.decorator";
import { AcessoGuard } from "../core/auth/acesso.guard";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { CurrentPrincipal } from "../core/auth/current-principal.decorator";
import { OriginCheckGuard } from "../core/auth/origin-check.guard";
import { SessionAuthGuard } from "../core/auth/session-auth.guard";
import { cabecalhoDisposicao } from "../lead-documentos/lead-documentos.rules";
import { ComprasService, type ArquivoParaBaixar } from "./compras.service";

/** Backstop de memória do multer; o limite preciso (25 MiB) é conferido no serviço. */
const LIMITE_MULTER_BYTES = ARQUIVO_DE_COMPRA_MAX_BYTES * 2;
const COM_ARQUIVO = FileInterceptor("arquivo", { limits: { fileSize: LIMITE_MULTER_BYTES } });

/**
 * Compras de Suprimentos (PLU-327), um quadro global para Plugga e Waze. Entra
 * quem opera Compras ou é do Financeiro (que aprova e paga); o serviço decide o
 * que cada papel faz em cada etapa.
 */
@Controller("suprimentos/compras")
@UseGuards(SessionAuthGuard, AcessoGuard)
@Departamento(["suprimentos", "financeiro"])
@Tela("suprimentos.compras", "financeiro.pagar", "financeiro.receber", "financeiro.conciliacao", "financeiro.fiscal")
export class ComprasController {
  constructor(@Inject(ComprasService) private readonly compras: ComprasService) {}

  @Get("quadro")
  quadro(@Query(new ZodValidationPipe(quadroDeComprasQuerySchema)) query: QuadroDeComprasQuery, @CurrentPrincipal() principal: AuthPrincipal): Promise<QuadroDeComprasResposta> {
    return this.compras.quadro(query, principal);
  }

  @Get("opcoes")
  opcoes(@CurrentPrincipal() principal: AuthPrincipal): Promise<OpcoesDeCompraResposta> {
    return this.compras.opcoes(principal);
  }

  @Get("clientes")
  clientes(@Query(new ZodValidationPipe(buscarClientesDeCompraQuerySchema)) query: BuscarClientesDeCompraQuery, @CurrentPrincipal() principal: AuthPrincipal): Promise<BuscarClientesDeCompraResposta> {
    return this.compras.buscarClientes(query, principal);
  }

  @Post("obras")
  @HttpCode(201)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  criarObra(@Body(new ZodValidationPipe(criarObraSchema)) input: CriarObra, @CurrentPrincipal() principal: AuthPrincipal): Promise<ObraDeCompra> {
    return this.compras.criarObra(input, principal);
  }

  @Get("pedidos")
  listar(@Query(new ZodValidationPipe(listarPedidosDeCompraQuerySchema)) query: ListarPedidosDeCompraQuery, @CurrentPrincipal() principal: AuthPrincipal): Promise<ListarPedidosDeCompraResposta> {
    return this.compras.listar(query, principal);
  }

  @Post("pedidos")
  @HttpCode(201)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  criar(@Body(new ZodValidationPipe(criarPedidoDeCompraSchema)) input: CriarPedidoDeCompra, @CurrentPrincipal() principal: AuthPrincipal): Promise<PedidoDeCompra> {
    return this.compras.criar(input, principal);
  }

  @Get("pedidos/:id")
  obter(@Param("id", ParseUUIDPipe) id: string, @CurrentPrincipal() principal: AuthPrincipal): Promise<PedidoDeCompra> {
    return this.compras.obter(id, principal);
  }

  @Patch("pedidos/:id")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  editar(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(editarPedidoDeCompraSchema)) input: EditarPedidoDeCompra,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<PedidoDeCompra> {
    return this.compras.editar(id, input, principal);
  }

  @Post("pedidos/:id/acoes")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  acao(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(acaoDoPedidoSchema)) acao: AcaoDoPedido,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<PedidoDeCompra> {
    return this.compras.executarAcao(id, acao, principal);
  }

  @Post("pedidos/:id/cotacoes")
  @HttpCode(201)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @UseInterceptors(COM_ARQUIVO)
  registrarCotacao(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(registrarCotacaoSchema)) dados: RegistrarCotacao,
    @UploadedFile() arquivo: Express.Multer.File | undefined,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<PedidoDeCompra> {
    return this.compras.registrarCotacao(id, dados, arquivo && { buffer: arquivo.buffer, nomeOriginal: arquivo.originalname }, principal);
  }

  @Get("pedidos/:id/cotacoes/:cotacaoId/arquivo")
  async anexoDaCotacao(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("cotacaoId", ParseUUIDPipe) cotacaoId: string,
    @CurrentPrincipal() principal: AuthPrincipal,
    @Res() res: Response,
  ): Promise<void> {
    this.enviar(res, await this.compras.baixarAnexoDaCotacao(id, cotacaoId, principal));
  }

  @Post("pedidos/:id/comprovante")
  @HttpCode(201)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @UseInterceptors(COM_ARQUIVO)
  registrarComprovante(
    @Param("id", ParseUUIDPipe) id: string,
    @UploadedFile() arquivo: Express.Multer.File | undefined,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<PedidoDeCompra> {
    return this.compras.registrarComprovante(id, arquivo && { buffer: arquivo.buffer, nomeOriginal: arquivo.originalname }, principal);
  }

  @Get("pedidos/:id/comprovante")
  async comprovante(@Param("id", ParseUUIDPipe) id: string, @CurrentPrincipal() principal: AuthPrincipal, @Res() res: Response): Promise<void> {
    this.enviar(res, await this.compras.baixarComprovante(id, principal));
  }

  /** PDF e imagem abrem no navegador; o tipo é o detectado no envio, e `nosniff` impede reinterpretação. */
  private enviar(res: Response, { arquivo, stream, encerrar }: ArquivoParaBaixar): void {
    stream.once("close", encerrar);
    stream.once("error", encerrar);
    res.status(200);
    res.setHeader("Content-Type", arquivo.tipo);
    res.setHeader("Content-Disposition", cabecalhoDisposicao("inline", arquivo.nome));
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
    stream.pipe(res);
  }
}
