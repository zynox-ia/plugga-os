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
import { ThrottlerGuard } from "@nestjs/throttler";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  aprovarMedicaoRequestSchema,
  aprovarProjetoRequestSchema,
  assinarAprRequestSchema,
  avancarEtapaDeObraRequestSchema,
  classificarPrioridadeRequestSchema,
  companyKeySchema,
  conferirEpiRequestSchema,
  criarVersaoDeProjetoRequestSchema,
  encerrarPendenciaRequestSchema,
  enviarProjetoParaAprovacaoRequestSchema,
  lancarMedicaoRequestSchema,
  reabrirProjetoRequestSchema,
  registrarAprRequestSchema,
  registrarEpiRequestSchema,
  registrarEvidenciaRequestSchema,
  registrarIncidenteRequestSchema,
  registrarLiberacaoRequestSchema,
  registrarPendenciaRequestSchema,
  revogarLiberacaoRequestSchema,
  solicitarCorrecaoMedicaoRequestSchema,
  solicitarRevisaoDeProjetoRequestSchema,
  type AprovarMedicaoRequest,
  type AprovarProjetoRequest,
  type AssinarAprRequest,
  type AvancarEtapaDeObraRequest,
  type ClassificarPrioridadeRequest,
  type CompanyKey,
  type ConferirEpiRequest,
  type EncerrarPendenciaRequest,
  type EnviarProjetoParaAprovacaoRequest,
  type Incidente,
  type LancarMedicaoRequest,
  type LiberacaoSeguranca,
  type MedicaoTecnica,
  type ObraExecucaoDetalhe,
  type PendenciaDeCampo,
  type ProjetoVersao,
  type ReabrirProjetoRequest,
  type RegistrarAprRequest,
  type RegistrarEpiRequest,
  type RegistrarIncidenteRequest,
  type RegistrarLiberacaoRequest,
  type RegistrarPendenciaRequest,
  type RegistroApr,
  type RegistroEpi,
  type RevogarLiberacaoRequest,
  type SolicitarCorrecaoMedicaoRequest,
  type SolicitarRevisaoDeProjetoRequest,
} from "@plugga/shared";

import { armazenamentoEmDisco, TAMANHO_MAXIMO_POR_ARQUIVO } from "../common/upload/armazenamento-em-disco";
import { UploadEmDisco } from "../common/upload/upload-em-disco";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { CurrentPrincipal } from "../core/auth/current-principal.decorator";
import { SessionAuthGuard } from "../core/auth/session-auth.guard";
import { OriginCheckGuard } from "../core/auth/origin-check.guard";
import { Departamento } from "../core/auth/acesso.decorator";
import { AcessoGuard } from "../core/auth/acesso.guard";
import { DECIDIR_OBRA_GERENTE, LER_OBRA, OPERAR_OBRA, OPERAR_OBRA_COM_SUPRIMENTOS } from "./obras.permissions";
import { ObrasService, type ArquivoDeEvidencia } from "./obras.service";


/**
 * Execução e Gestão de Obras — POP-OBR-001 v1. Opera sobre uma `Obra` já
 * cadastrada por `POST /compras/obras` (POP-COMP-001): este módulo não
 * recria o cadastro, só a etapa/evidência/segurança da execução.
 */
@Controller("obras")
@UseGuards(SessionAuthGuard, AcessoGuard)
@Departamento(LER_OBRA)
export class ObrasController {
  constructor(@Inject(ObrasService) private readonly service: ObrasService) {}

  @Post(":id/etapas/avancar")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @Departamento(DECIDIR_OBRA_GERENTE, "gerente")
  avancarEtapa(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(avancarEtapaDeObraRequestSchema)) input: AvancarEtapaDeObraRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<ObraExecucaoDetalhe> {
    return this.service.avancarEtapa(id, input, principal);
  }

  @Post(":id/projeto/reabrir")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @Departamento(OPERAR_OBRA)
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
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @Departamento(OPERAR_OBRA_COM_SUPRIMENTOS)
  @UseInterceptors(
    UploadEmDisco(),
    FileInterceptor("arquivo", { storage: armazenamentoEmDisco, limits: { fileSize: TAMANHO_MAXIMO_POR_ARQUIVO } }),
  )
  registrarEvidencia(
    @Param("id", ParseUUIDPipe) id: string,
    @Body("payload") payload: string,
    @UploadedFile() arquivo: ArquivoDeEvidencia | undefined,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<ObraExecucaoDetalhe> {
    if (!arquivo) {
      throw new BadRequestException("a evidência exige o arquivo anexado (POP-OBR-001 §5.1)");
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
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @Departamento(OPERAR_OBRA)
  registrarEpi(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(registrarEpiRequestSchema)) input: RegistrarEpiRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<RegistroEpi> {
    return this.service.registrarEpi(id, input, principal);
  }

  @Post(":id/epi/:epiId/conferir")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @Departamento(DECIDIR_OBRA_GERENTE, "gerente")
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
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @Departamento(OPERAR_OBRA)
  registrarApr(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(registrarAprRequestSchema)) input: RegistrarAprRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<RegistroApr> {
    return this.service.registrarApr(id, input, principal);
  }

  @Post(":id/apr/:aprId/assinar")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @Departamento(OPERAR_OBRA)
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
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @Departamento(LER_OBRA)
  registrarIncidente(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(registrarIncidenteRequestSchema)) input: RegistrarIncidenteRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<Incidente> {
    return this.service.registrarIncidente(id, input, principal);
  }

  @Post(":id/liberacoes")
  @HttpCode(201)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @Departamento(OPERAR_OBRA)
  registrarLiberacao(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(registrarLiberacaoRequestSchema)) input: RegistrarLiberacaoRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<LiberacaoSeguranca> {
    return this.service.registrarLiberacao(id, input, principal);
  }

  @Post(":id/liberacoes/:liberacaoId/revogar")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @Departamento(DECIDIR_OBRA_GERENTE, "gerente")
  revogarLiberacao(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("liberacaoId", ParseUUIDPipe) liberacaoId: string,
    @Body(new ZodValidationPipe(revogarLiberacaoRequestSchema)) input: RevogarLiberacaoRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<LiberacaoSeguranca> {
    return this.service.revogarLiberacao(id, liberacaoId, input, principal);
  }

  @Post(":id/pendencias")
  @HttpCode(201)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @Departamento(OPERAR_OBRA)
  registrarPendencia(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(registrarPendenciaRequestSchema)) input: RegistrarPendenciaRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<PendenciaDeCampo> {
    return this.service.registrarPendencia(id, input, principal);
  }

  @Post(":id/pendencias/:pendenciaId/prioridade")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @Departamento(OPERAR_OBRA)
  classificarPrioridadePendencia(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("pendenciaId", ParseUUIDPipe) pendenciaId: string,
    @Body(new ZodValidationPipe(classificarPrioridadeRequestSchema)) input: ClassificarPrioridadeRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<PendenciaDeCampo> {
    return this.service.classificarPrioridadePendencia(id, pendenciaId, input, principal);
  }

  @Post(":id/pendencias/:pendenciaId/encerrar")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @Departamento(OPERAR_OBRA_COM_SUPRIMENTOS)
  encerrarPendencia(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("pendenciaId", ParseUUIDPipe) pendenciaId: string,
    @Body(new ZodValidationPipe(encerrarPendenciaRequestSchema)) input: EncerrarPendenciaRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<PendenciaDeCampo> {
    return this.service.encerrarPendencia(id, pendenciaId, input, principal);
  }

  @Post(":id/medicoes")
  @HttpCode(201)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @Departamento(OPERAR_OBRA)
  lancarMedicao(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(lancarMedicaoRequestSchema)) input: LancarMedicaoRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<MedicaoTecnica> {
    return this.service.lancarMedicao(id, input, principal);
  }

  @Post(":id/medicoes/:medicaoId/aprovar")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @Departamento(DECIDIR_OBRA_GERENTE, "gerente")
  aprovarMedicao(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("medicaoId", ParseUUIDPipe) medicaoId: string,
    @Body(new ZodValidationPipe(aprovarMedicaoRequestSchema)) input: AprovarMedicaoRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<MedicaoTecnica> {
    return this.service.aprovarMedicao(id, medicaoId, input, principal);
  }

  @Post(":id/medicoes/:medicaoId/solicitar-correcao")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @Departamento(DECIDIR_OBRA_GERENTE, "gerente")
  solicitarCorrecaoMedicao(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("medicaoId", ParseUUIDPipe) medicaoId: string,
    @Body(new ZodValidationPipe(solicitarCorrecaoMedicaoRequestSchema)) input: SolicitarCorrecaoMedicaoRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<MedicaoTecnica> {
    return this.service.solicitarCorrecaoMedicao(id, medicaoId, input, principal);
  }

  /** `multipart` opcional: o desenho pode chegar depois, mas o payload sempre precisa vir junto. */
  @Post(":id/projeto/versoes")
  @HttpCode(201)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @Departamento(OPERAR_OBRA)
  @UseInterceptors(
    UploadEmDisco(),
    FileInterceptor("arquivo", { storage: armazenamentoEmDisco, limits: { fileSize: TAMANHO_MAXIMO_POR_ARQUIVO } }),
  )
  criarVersaoDeProjeto(
    @Param("id", ParseUUIDPipe) id: string,
    @Body("payload") payload: string,
    @UploadedFile() arquivo: ArquivoDeEvidencia | undefined,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<ProjetoVersao> {
    const input = new ZodValidationPipe(criarVersaoDeProjetoRequestSchema).transform(this.lerPayload(payload));
    return this.service.criarVersaoDeProjeto(id, input, arquivo ?? null, principal);
  }

  @Post(":id/projeto/versoes/:versaoId/enviar-para-aprovacao")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @Departamento(OPERAR_OBRA)
  enviarProjetoParaAprovacao(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("versaoId", ParseUUIDPipe) versaoId: string,
    @Body(new ZodValidationPipe(enviarProjetoParaAprovacaoRequestSchema)) input: EnviarProjetoParaAprovacaoRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<ProjetoVersao> {
    return this.service.enviarProjetoParaAprovacao(id, versaoId, input, principal);
  }

  @Post(":id/projeto/versoes/:versaoId/aprovar")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @Departamento(DECIDIR_OBRA_GERENTE, "gerente")
  aprovarProjeto(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("versaoId", ParseUUIDPipe) versaoId: string,
    @Body(new ZodValidationPipe(aprovarProjetoRequestSchema)) input: AprovarProjetoRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<ProjetoVersao> {
    return this.service.aprovarProjeto(id, versaoId, input, principal);
  }

  @Post(":id/projeto/versoes/:versaoId/solicitar-revisao")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @Departamento(DECIDIR_OBRA_GERENTE, "gerente")
  solicitarRevisaoDeProjeto(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("versaoId", ParseUUIDPipe) versaoId: string,
    @Body(new ZodValidationPipe(solicitarRevisaoDeProjetoRequestSchema)) input: SolicitarRevisaoDeProjetoRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<ProjetoVersao> {
    return this.service.solicitarRevisaoDeProjeto(id, versaoId, input, principal);
  }

  @Get(":id")
  obra(
    @Param("id", ParseUUIDPipe) id: string,
    @Query("companyId", new ZodValidationPipe(companyKeySchema)) companyId: CompanyKey,
  ): Promise<ObraExecucaoDetalhe> {
    return this.service.obra(id, companyId);
  }
}
