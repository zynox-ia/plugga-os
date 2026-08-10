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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  assinarAprRequestSchema,
  avancarEtapaDeObraRequestSchema,
  companyKeySchema,
  conferirEpiRequestSchema,
  reabrirProjetoRequestSchema,
  registrarAprRequestSchema,
  registrarEpiRequestSchema,
  registrarEvidenciaRequestSchema,
  registrarIncidenteRequestSchema,
  registrarLiberacaoRequestSchema,
  revogarLiberacaoRequestSchema,
  type AssinarAprRequest,
  type AvancarEtapaDeObraRequest,
  type CompanyKey,
  type ConferirEpiRequest,
  type Incidente,
  type LiberacaoSeguranca,
  type ObraExecucaoDetalhe,
  type ReabrirProjetoRequest,
  type RegistrarAprRequest,
  type RegistrarEpiRequest,
  type RegistrarIncidenteRequest,
  type RegistrarLiberacaoRequest,
  type RegistroApr,
  type RegistroEpi,
  type RevogarLiberacaoRequest,
} from "@plugga/shared";

import { ZodValidationPipe } from "../common/zod-validation.pipe";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { CurrentPrincipal } from "../core/auth/current-principal.decorator";
import { DevAuthGuard } from "../core/auth/dev-auth.guard";
import { OriginCheckGuard } from "../core/auth/origin-check.guard";
import { Roles } from "../core/auth/roles.decorator";
import { RolesGuard } from "../core/auth/roles.guard";
import { TIPOS_ACEITOS } from "./armazenamento-de-evidencias";
import {
  ASSINAR_APR,
  AVANCAR_ETAPA,
  CONFERIR_EPI,
  LER_OBRA,
  REABRIR_PROJETO,
  REGISTRAR_APR,
  REGISTRAR_EPI,
  REGISTRAR_EVIDENCIA,
  REGISTRAR_INCIDENTE,
  REGISTRAR_LIBERACAO,
  REVOGAR_LIBERACAO,
} from "./obras.permissions";
import { ObrasService, type ArquivoDeEvidencia } from "./obras.service";

const TAMANHO_MAXIMO = 20 * 1024 * 1024;

/**
 * Execução e Gestão de Obras — POP-OBR-001 v1. Opera sobre uma `Obra` já
 * cadastrada por `POST /compras/obras` (POP-COMP-001): este módulo não
 * recria o cadastro, só a etapa/evidência/segurança da execução.
 */
@Controller("obras")
@UseGuards(DevAuthGuard, RolesGuard)
@Roles(...LER_OBRA)
export class ObrasController {
  constructor(@Inject(ObrasService) private readonly service: ObrasService) {}

  @Post(":id/etapas/avancar")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard)
  @Roles(...AVANCAR_ETAPA)
  avancarEtapa(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(avancarEtapaDeObraRequestSchema)) input: AvancarEtapaDeObraRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<ObraExecucaoDetalhe> {
    return this.service.avancarEtapa(id, input, principal);
  }

  @Post(":id/projeto/reabrir")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard)
  @Roles(...REABRIR_PROJETO)
  reabrirProjeto(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reabrirProjetoRequestSchema)) input: ReabrirProjetoRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<ObraExecucaoDetalhe> {
    return this.service.reabrirProjeto(id, input, principal);
  }

  /**
   * `multipart`: o corpo traz o JSON em `payload` e o arquivo em `arquivo`,
   * mesmo desenho de `POST /compras/pedidos` — a evidência é o próprio
   * requisito do POP §5.1, não um segundo passo.
   */
  @Post(":id/evidencias")
  @HttpCode(201)
  @UseGuards(OriginCheckGuard)
  @Roles(...REGISTRAR_EVIDENCIA)
  @UseInterceptors(FileInterceptor("arquivo", { limits: { fileSize: TAMANHO_MAXIMO } }))
  registrarEvidencia(
    @Param("id", ParseUUIDPipe) id: string,
    @Body("payload") payload: string,
    @UploadedFile() arquivo: ArquivoDeEvidencia | undefined,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<ObraExecucaoDetalhe> {
    if (!arquivo) {
      throw new BadRequestException("a evidência exige o arquivo anexado (POP-OBR-001 §5.1)");
    }
    if (!TIPOS_ACEITOS.includes(arquivo.mimetype)) {
      throw new BadRequestException(`tipo de arquivo não aceito: ${arquivo.mimetype}`);
    }
    const input = new ZodValidationPipe(registrarEvidenciaRequestSchema).transform(this.lerPayload(payload));
    return this.service.registrarEvidencia(id, input, arquivo, principal);
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

  @Post(":id/epi")
  @HttpCode(201)
  @UseGuards(OriginCheckGuard)
  @Roles(...REGISTRAR_EPI)
  registrarEpi(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(registrarEpiRequestSchema)) input: RegistrarEpiRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<RegistroEpi> {
    return this.service.registrarEpi(id, input, principal);
  }

  @Post(":id/epi/:epiId/conferir")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard)
  @Roles(...CONFERIR_EPI)
  conferirEpi(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("epiId", ParseUUIDPipe) epiId: string,
    @Body(new ZodValidationPipe(conferirEpiRequestSchema)) input: ConferirEpiRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<RegistroEpi> {
    return this.service.conferirEpi(id, epiId, input, principal);
  }

  @Post(":id/apr")
  @HttpCode(201)
  @UseGuards(OriginCheckGuard)
  @Roles(...REGISTRAR_APR)
  registrarApr(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(registrarAprRequestSchema)) input: RegistrarAprRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<RegistroApr> {
    return this.service.registrarApr(id, input, principal);
  }

  @Post(":id/apr/:aprId/assinar")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard)
  @Roles(...ASSINAR_APR)
  assinarApr(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("aprId", ParseUUIDPipe) aprId: string,
    @Body(new ZodValidationPipe(assinarAprRequestSchema)) input: AssinarAprRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<RegistroApr> {
    return this.service.assinarApr(id, aprId, input, principal);
  }

  @Post(":id/incidentes")
  @HttpCode(201)
  @UseGuards(OriginCheckGuard)
  @Roles(...REGISTRAR_INCIDENTE)
  registrarIncidente(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(registrarIncidenteRequestSchema)) input: RegistrarIncidenteRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<Incidente> {
    return this.service.registrarIncidente(id, input, principal);
  }

  @Post(":id/liberacoes")
  @HttpCode(201)
  @UseGuards(OriginCheckGuard)
  @Roles(...REGISTRAR_LIBERACAO)
  registrarLiberacao(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(registrarLiberacaoRequestSchema)) input: RegistrarLiberacaoRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<LiberacaoSeguranca> {
    return this.service.registrarLiberacao(id, input, principal);
  }

  @Post(":id/liberacoes/:liberacaoId/revogar")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard)
  @Roles(...REVOGAR_LIBERACAO)
  revogarLiberacao(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("liberacaoId", ParseUUIDPipe) liberacaoId: string,
    @Body(new ZodValidationPipe(revogarLiberacaoRequestSchema)) input: RevogarLiberacaoRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<LiberacaoSeguranca> {
    return this.service.revogarLiberacao(id, liberacaoId, input, principal);
  }

  @Get(":id")
  obra(
    @Param("id", ParseUUIDPipe) id: string,
    @Query("companyId", new ZodValidationPipe(companyKeySchema)) companyId: CompanyKey,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<ObraExecucaoDetalhe> {
    return this.service.obra(id, companyId, principal);
  }
}
