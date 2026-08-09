import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import {
  approveEnergyStudyRequestSchema,
  createEnergyStudyRequestSchema,
  energyStudyListQuerySchema,
  submitEnergyInvoiceRequestSchema,
  type ApproveEnergyStudyRequest,
  type CreateEnergyStudyRequest,
  type EnergyStudyDetail,
  type EnergyStudyListQuery,
  type ListEnergyStudiesResponse,
  type SubmitEnergyInvoiceRequest,
} from "@plugga/shared";

import type { AuthPrincipal } from "../core/auth/auth.types";
import { CurrentPrincipal } from "../core/auth/current-principal.decorator";
import { DevAuthGuard } from "../core/auth/dev-auth.guard";
import { OriginCheckGuard } from "../core/auth/origin-check.guard";
import { Roles } from "../core/auth/roles.decorator";
import { RolesGuard } from "../core/auth/roles.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { APROVAR_ESTUDO, LER_ESTUDO, OPERAR_ESTUDO } from "./estudo.permissions.js";
import { EstudoService } from "./estudo.service.js";

@Controller("energy-efficiency/studies")
@UseGuards(DevAuthGuard, RolesGuard)
@Roles(...LER_ESTUDO)
export class EstudoController {
  // `@Inject` explícito como nos demais controllers: o vitest transpila por
  // esbuild, que não emite `design:paramtypes`, então sem o token o Nest injeta
  // undefined em teste — e o erro só aparece na primeira chamada da rota.
  constructor(@Inject(EstudoService) private readonly service: EstudoService) {}

  @Get()
  listar(
    @Query(new ZodValidationPipe(energyStudyListQuerySchema)) query: EnergyStudyListQuery,
  ): Promise<ListEnergyStudiesResponse> {
    return this.service.listar(query);
  }

  @Get(":id")
  detalhar(@Param("id", ParseUUIDPipe) id: string): Promise<EnergyStudyDetail> {
    return this.service.detalhar(id);
  }

  /**
   * O documento sai como HTML porque é a fonte: o PDF é derivado dele. Servir o
   * HTML permite conferir no navegador antes de gerar o arquivo final.
   */
  @Get(":id/document")
  @Header("content-type", "text/html; charset=utf-8")
  documento(@Param("id", ParseUUIDPipe) id: string): Promise<string> {
    return this.service.documento(id, "desktop");
  }

  @Get(":id/document.mobile")
  @Header("content-type", "text/html; charset=utf-8")
  documentoCelular(@Param("id", ParseUUIDPipe) id: string): Promise<string> {
    return this.service.documento(id, "celular");
  }

  /**
   * O mesmo documento em PDF — é este arquivo que vai para o cliente.
   *
   * `attachment` e não `inline`: o visualizador do navegador serve para
   * conferir, e para isso já existe a rota HTML. Quem pede o PDF quer o arquivo
   * na mão para anexar num e-mail.
   */
  @Get(":id/document.pdf")
  // Limite por IP mais apertado que o padrão: cada conversão sobe um Chromium,
  // e a rota é a única do módulo que custa CPU de verdade. Sem isto, segurar o
  // F5 enfileira dezenas de renderizações que ninguém vai ler.
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async pdf(@Param("id", ParseUUIDPipe) id: string): Promise<StreamableFile> {
    const { arquivo, nome } = await this.service.pdf(id);

    return new StreamableFile(arquivo, {
      type: "application/pdf",
      // O nome é ASCII por construção (nome-arquivo.ts), então dispensa a
      // codificação da RFC 5987 e chega íntegro em qualquer cliente.
      disposition: `attachment; filename="${nome}"`,
    });
  }

  @Post()
  @UseGuards(OriginCheckGuard)
  @Roles(...OPERAR_ESTUDO)
  criar(
    @Body(new ZodValidationPipe(createEnergyStudyRequestSchema)) body: CreateEnergyStudyRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<EnergyStudyDetail> {
    return this.service.criar(body, principal);
  }

  @Post(":id/invoice")
  @UseGuards(OriginCheckGuard)
  @Roles(...OPERAR_ESTUDO)
  receberFatura(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(submitEnergyInvoiceRequestSchema)) body: SubmitEnergyInvoiceRequest,
  ): Promise<EnergyStudyDetail> {
    return this.service.receberFatura(id, body);
  }

  /** Recalcula depois de corrigir dado ou premissa; refaz a validação. */
  @Post(":id/recalculate")
  @UseGuards(OriginCheckGuard)
  @Roles(...OPERAR_ESTUDO)
  recalcular(@Param("id", ParseUUIDPipe) id: string): Promise<EnergyStudyDetail> {
    return this.service.calcular(id);
  }

  @Post(":id/approve")
  @UseGuards(OriginCheckGuard)
  @Roles(...APROVAR_ESTUDO)
  aprovar(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(approveEnergyStudyRequestSchema)) body: ApproveEnergyStudyRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<EnergyStudyDetail> {
    return this.service.aprovar(id, body, principal);
  }

  @Post(":id/sent")
  @UseGuards(OriginCheckGuard)
  @Roles(...APROVAR_ESTUDO)
  marcarEnviado(@Param("id", ParseUUIDPipe) id: string): Promise<EnergyStudyDetail> {
    return this.service.marcarEnviado(id);
  }
}
