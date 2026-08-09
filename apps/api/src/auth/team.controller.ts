import { Body, Controller, Get, HttpCode, Inject, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { SkipThrottle, ThrottlerGuard } from "@nestjs/throttler";
import {
  assignAccessRequestSchema,
  inviteRequestSchema,
  teamListQuerySchema,
  type AssignAccessRequest,
  type AuthAcknowledgement,
  type InviteRequest,
  type TeamListQuery,
  type TeamListResponse,
  type TeamMember,
} from "@plugga/shared";

import { ZodValidationPipe } from "../common/zod-validation.pipe";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { CurrentPrincipal } from "../core/auth/current-principal.decorator";
import { DevAuthGuard } from "../core/auth/dev-auth.guard";
import { OriginCheckGuard } from "../core/auth/origin-check.guard";
import { TeamService } from "./team.service";

/**
 * Equipe: quem tem acesso, com que papel e em qual empresa/departamento.
 *
 * Sem `@Roles`: a autorização aqui não é "tem o papel X", e sim "este acesso
 * cabe no escopo de quem está pedindo" — depende do alvo e do corpo da
 * requisição, coisas que um guard por papel não enxerga. `DevAuthGuard` garante
 * que existe uma sessão; `TeamService` decide o resto e responde 403.
 *
 * Nas mutações, `OriginCheckGuard` vem antes de `DevAuthGuard` pelo mesmo
 * princípio do AuthController: requisição cross-origin rejeitada não deve pagar
 * o lookup de sessão no banco (nem o write da renovação deslizante).
 */
@Controller("auth")
export class TeamController {
  constructor(@Inject(TeamService) private readonly service: TeamService) {}

  // Leitura autenticada que a tela refaz a cada filtro — não é alvo de força
  // bruta como convite/login. Com o balde por IP degradado para um só (a API
  // enxerga apenas a conexão de loopback do web), mantê-la no throttle faria a
  // lista falhar com 429 no uso normal. As mutações abaixo seguem limitadas.
  @Get("users")
  @SkipThrottle()
  @UseGuards(DevAuthGuard)
  list(
    @Query(new ZodValidationPipe(teamListQuerySchema)) query: TeamListQuery,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<TeamListResponse> {
    return this.service.list(principal, query);
  }

  @Post("invite")
  @UseGuards(OriginCheckGuard, DevAuthGuard, ThrottlerGuard)
  invite(
    @Body(new ZodValidationPipe(inviteRequestSchema)) input: InviteRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<TeamMember> {
    return this.service.invite(principal, input);
  }

  @Put("users/:id/access")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, DevAuthGuard, ThrottlerGuard)
  updateAccess(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(assignAccessRequestSchema)) input: AssignAccessRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<TeamMember> {
    return this.service.updateAccess(principal, id, input.access);
  }

  @Post("users/:id/deactivate")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, DevAuthGuard, ThrottlerGuard)
  deactivate(
    @Param("id") id: string,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<AuthAcknowledgement> {
    return this.service.deactivate(principal, id);
  }

  @Post("users/:id/resend-invite")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, DevAuthGuard, ThrottlerGuard)
  resendInvite(
    @Param("id") id: string,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<AuthAcknowledgement> {
    return this.service.resendInvite(principal, id);
  }
}
