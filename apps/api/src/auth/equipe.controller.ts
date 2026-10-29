import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from "@nestjs/common";
import { SkipThrottle, ThrottlerGuard } from "@nestjs/throttler";
import {
  consultaDaEquipeSchema,
  conviteDaEquipeSchema,
  edicaoDeAcessoSchema,
  type AuthAcknowledgement,
  type ConsultaDaEquipe,
  type ConviteDaEquipe,
  type EdicaoDeAcesso,
  type ListaDaEquipe,
  type MembroDaEquipe,
} from "@plugga/shared";

import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { Authenticated } from "../core/auth/access.decorators";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { CurrentPrincipal } from "../core/auth/current-principal.decorator";
import { OriginCheckGuard } from "../core/auth/origin-check.guard";
import { SessionAuthGuard } from "../core/auth/session-auth.guard";
import { EquipeService } from "./equipe.service";

/**
 * Equipe e acessos no modelo de 4 papéis.
 *
 * Sem `@Departamento`/`@Plataforma`: quem pode o quê depende do alvo e do
 * acesso pedido, coisas que um guard por papel não enxerga. A sessão é exigida
 * aqui e o `EquipeService` responde 403/404 pela escada.
 */
@Authenticated()
@Controller("equipe")
export class EquipeController {
  constructor(@Inject(EquipeService) private readonly service: EquipeService) {}

  // Leitura refeita a cada filtro da tela: fica fora do throttle, que é das mutações.
  @Get()
  @SkipThrottle()
  @UseGuards(SessionAuthGuard)
  listar(
    @Query(new ZodValidationPipe(consultaDaEquipeSchema)) consulta: ConsultaDaEquipe,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<ListaDaEquipe> {
    return this.service.listar(principal, consulta);
  }

  @Post("convites")
  @UseGuards(OriginCheckGuard, SessionAuthGuard, ThrottlerGuard)
  convidar(
    @Body(new ZodValidationPipe(conviteDaEquipeSchema)) convite: ConviteDaEquipe,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<MembroDaEquipe> {
    return this.service.convidar(principal, convite);
  }

  @Put(":id/acesso")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, SessionAuthGuard, ThrottlerGuard)
  editarAcesso(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(edicaoDeAcessoSchema)) edicao: EdicaoDeAcesso,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<MembroDaEquipe> {
    return this.service.editarAcesso(principal, id, edicao.acesso);
  }

  @Post(":id/desativar")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, SessionAuthGuard, ThrottlerGuard)
  desativar(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<AuthAcknowledgement> {
    return this.service.desativar(principal, id);
  }

  @Post(":id/reenviar-convite")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, SessionAuthGuard, ThrottlerGuard)
  reenviarConvite(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<AuthAcknowledgement> {
    return this.service.reenviarConvite(principal, id);
  }

  @Post(":id/remover")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, SessionAuthGuard, ThrottlerGuard)
  remover(@Param("id", ParseUUIDPipe) id: string, @CurrentPrincipal() principal: AuthPrincipal): Promise<AuthAcknowledgement> {
    return this.service.remover(principal, id);
  }
}
