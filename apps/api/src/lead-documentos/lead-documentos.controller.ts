import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ThrottlerGuard } from "@nestjs/throttler";
import {
  updateLeadDocumentRequestSchema,
  uploadLeadDocumentRequestSchema,
  LEAD_DOCUMENT_MAX_BYTES,
  type LeadDocument,
  type ListLeadDocumentsResponse,
  type UpdateLeadDocumentRequest,
  type UploadLeadDocumentRequest,
} from "@plugga/shared";
import type { Response } from "express";

import { RequisicaoInvalida } from "../common/errors/dominio";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { Departamento, Tela } from "../core/auth/acesso.decorator";
import { AcessoGuard } from "../core/auth/acesso.guard";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { CurrentPrincipal } from "../core/auth/current-principal.decorator";
import { OriginCheckGuard } from "../core/auth/origin-check.guard";
import { SessionAuthGuard } from "../core/auth/session-auth.guard";
import { cabecalhoDisposicao } from "./lead-documentos.rules";
import { LeadDocumentosService } from "./lead-documentos.service";

/** Backstop de memória do multer: generoso o bastante para nunca ser a causa comum de um 413 — essa é sempre a verificação precisa do serviço. */
const LIMITE_MULTER_BYTES = LEAD_DOCUMENT_MAX_BYTES * 2;

/**
 * Documentos do lead (PLU-271): um arquivo por requisição, tipo verificado
 * pelo conteúdo, duplicata pelo hash. Mesmo alcance de quem vê o negócio.
 */
@Controller("leads/:dealId/documentos")
@UseGuards(SessionAuthGuard, AcessoGuard)
@Departamento("crm")
@Tela("crm.pipelines")
export class LeadDocumentosController {
  constructor(@Inject(LeadDocumentosService) private readonly service: LeadDocumentosService) {}

  @Get()
  list(@Param("dealId", ParseUUIDPipe) dealId: string, @CurrentPrincipal() principal: AuthPrincipal): Promise<ListLeadDocumentsResponse> {
    return this.service.list(dealId, principal);
  }

  @Post()
  @HttpCode(201)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @UseInterceptors(FileInterceptor("arquivo", { limits: { fileSize: LIMITE_MULTER_BYTES } }))
  upload(
    @Param("dealId", ParseUUIDPipe) dealId: string,
    @Body(new ZodValidationPipe(uploadLeadDocumentRequestSchema)) body: UploadLeadDocumentRequest,
    @UploadedFile() arquivo: Express.Multer.File | undefined,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<LeadDocument> {
    if (!arquivo) throw new RequisicaoInvalida("Envie um arquivo.");
    return this.service.upload(dealId, body.category, { buffer: arquivo.buffer, originalName: arquivo.originalname }, principal);
  }

  @Patch(":id")
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  update(
    @Param("dealId", ParseUUIDPipe) dealId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateLeadDocumentRequestSchema)) input: UpdateLeadDocumentRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<LeadDocument> {
    return this.service.update(dealId, id, input, principal);
  }

  @Post(":id/arquivar")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  archive(
    @Param("dealId", ParseUUIDPipe) dealId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<LeadDocument> {
    return this.service.archive(dealId, id, principal);
  }

  @Get(":id/download")
  async download(
    @Param("dealId", ParseUUIDPipe) dealId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentPrincipal() principal: AuthPrincipal,
    @Res() res: Response,
  ): Promise<void> {
    const { documento, stream, encerrar } = await this.service.download(dealId, id, principal);
    stream.once("close", encerrar);
    stream.once("error", encerrar);
    res.status(200);
    res.setHeader("Content-Type", documento.detectedMime);
    res.setHeader("Content-Disposition", cabecalhoDisposicao("attachment", documento.originalName));
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
    stream.pipe(res);
  }

  @Get(":id/preview")
  async preview(
    @Param("dealId", ParseUUIDPipe) dealId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentPrincipal() principal: AuthPrincipal,
    @Res() res: Response,
  ): Promise<void> {
    const { documento, stream, encerrar } = await this.service.preview(dealId, id, principal);
    stream.once("close", encerrar);
    stream.once("error", encerrar);
    res.status(200);
    res.setHeader("Content-Type", documento.detectedMime);
    res.setHeader("Content-Disposition", cabecalhoDisposicao("inline", documento.originalName));
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "sandbox");
    res.setHeader("Cache-Control", "no-store");
    stream.pipe(res);
  }
}
