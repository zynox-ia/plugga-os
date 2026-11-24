import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import {
  DOCUMENTO_DE_OBRA_MAX_BYTES,
  buscarClientesDaEngenhariaQuerySchema,
  cadastrarObraSchema,
  editarObraSchema,
  enviarDocumentoDeObraSchema,
  listarObrasQuerySchema,
  reprogramarMarcoSchema,
  type BuscarClientesDaEngenhariaQuery,
  type BuscarClientesDaEngenhariaResposta,
  type CadastrarObra,
  type EditarObra,
  type EnviarDocumentoDeObra,
  type ListarObrasQuery,
  type ListarObrasResposta,
  type Obra,
  type OpcoesDasObrasResposta,
  type ReprogramarMarco,
} from "@plugga/shared";
import type { Response } from "express";

import { UmArquivo } from "../common/upload";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { Departamento, Tela } from "../core/auth/acesso.decorator";
import { AcessoGuard } from "../core/auth/acesso.guard";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { CurrentPrincipal } from "../core/auth/current-principal.decorator";
import { OriginCheckGuard } from "../core/auth/origin-check.guard";
import { SessionAuthGuard } from "../core/auth/session-auth.guard";
import { cabecalhoDisposicao } from "../lead-documentos/lead-documentos.rules";
import { EngenhariaHabilitadaGuard } from "./engenharia-habilitada.guard";
import { ObrasService } from "./obras.service";

const COM_ARQUIVO = UmArquivo("arquivo", DOCUMENTO_DE_OBRA_MAX_BYTES * 2);

/**
 * Obras da Engenharia (PLU-350): a tela de Obras. O portão vem antes da sessão.
 * As rotas fixas vêm antes de `:id`.
 */
@Controller("engenharia/obras")
@UseGuards(EngenhariaHabilitadaGuard, SessionAuthGuard, AcessoGuard)
@Departamento(["engenharia-obras"])
@Tela("engenharia-obras.obras")
export class ObrasController {
  constructor(@Inject(ObrasService) private readonly obras: ObrasService) {}

  @Get()
  listar(@Query(new ZodValidationPipe(listarObrasQuerySchema)) query: ListarObrasQuery, @CurrentPrincipal() principal: AuthPrincipal): Promise<ListarObrasResposta> {
    return this.obras.listar(query, principal);
  }

  @Post()
  @HttpCode(201)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  cadastrar(@Body(new ZodValidationPipe(cadastrarObraSchema)) input: CadastrarObra, @CurrentPrincipal() principal: AuthPrincipal): Promise<Obra> {
    return this.obras.cadastrar(input, principal);
  }

  @Get("opcoes")
  opcoes(@CurrentPrincipal() principal: AuthPrincipal): Promise<OpcoesDasObrasResposta> {
    return this.obras.opcoes(principal);
  }

  @Get("clientes")
  clientes(@Query(new ZodValidationPipe(buscarClientesDaEngenhariaQuerySchema)) query: BuscarClientesDaEngenhariaQuery, @CurrentPrincipal() principal: AuthPrincipal): Promise<BuscarClientesDaEngenhariaResposta> {
    return this.obras.clientes(query.busca, principal);
  }

  @Get(":id")
  obter(@Param("id", ParseUUIDPipe) id: string, @CurrentPrincipal() principal: AuthPrincipal): Promise<Obra> {
    return this.obras.obra(id, principal);
  }

  @Patch(":id")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  editar(@Param("id", ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(editarObraSchema)) input: EditarObra, @CurrentPrincipal() principal: AuthPrincipal): Promise<Obra> {
    return this.obras.editar(id, input, principal);
  }

  @Post(":id/marcos/:marcoId/feito")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  marcarFeito(@Param("id", ParseUUIDPipe) id: string, @Param("marcoId", ParseUUIDPipe) marcoId: string, @CurrentPrincipal() principal: AuthPrincipal): Promise<Obra> {
    return this.obras.marcarFeito(id, marcoId, principal);
  }

  @Patch(":id/marcos/:marcoId")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  reprogramar(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("marcoId", ParseUUIDPipe) marcoId: string,
    @Body(new ZodValidationPipe(reprogramarMarcoSchema)) input: ReprogramarMarco,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<Obra> {
    return this.obras.reprogramar(id, marcoId, input.previstoEm, principal);
  }

  @Post(":id/documentos")
  @HttpCode(201)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @UseInterceptors(COM_ARQUIVO)
  anexar(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(enviarDocumentoDeObraSchema)) dados: EnviarDocumentoDeObra,
    @UploadedFile() arquivo: Express.Multer.File | undefined,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<Obra> {
    return this.obras.anexar(id, dados, arquivo && { buffer: arquivo.buffer, nomeOriginal: arquivo.originalname }, principal);
  }

  /** O documento abre ou baixa com o tipo detectado no envio; `nosniff` impede reinterpretação. */
  @Get(":id/documentos/:documentoId")
  async baixar(@Param("id", ParseUUIDPipe) id: string, @Param("documentoId", ParseUUIDPipe) documentoId: string, @CurrentPrincipal() principal: AuthPrincipal, @Res() res: Response): Promise<void> {
    const { arquivo, stream, encerrar } = await this.obras.baixar(id, documentoId, principal);
    stream.once("close", encerrar);
    stream.once("error", encerrar);
    res.status(200);
    res.setHeader("Content-Type", arquivo.tipo);
    res.setHeader("Content-Disposition", cabecalhoDisposicao(arquivo.tipo === "application/vnd.ms-project" ? "attachment" : "inline", arquivo.nome));
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
    stream.pipe(res);
  }
}
