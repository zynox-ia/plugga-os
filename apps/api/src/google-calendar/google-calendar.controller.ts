import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  Inject,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import {
  entradaDeRetornoDoGoogleSchema,
  type AutorizacaoDoGoogleCalendar,
  type EntradaDeRetornoDoGoogle,
  type EstadoDoGoogleCalendar,
} from "@plugga/shared";

import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { Authenticated } from "../core/auth/access.decorators";
import { AcessoGuard } from "../core/auth/acesso.guard";
import type { AuthenticatedRequest, AuthPrincipal } from "../core/auth/auth.types";
import { CurrentPrincipal } from "../core/auth/current-principal.decorator";
import { OriginCheckGuard } from "../core/auth/origin-check.guard";
import { SessionAuthGuard } from "../core/auth/session-auth.guard";
import { GoogleCalendarService, type PedidoDaSessao } from "./google-calendar.service";

/**
 * A agenda do Google da PRÓPRIA pessoa. Qualquer papel conecta a sua: a rota exige
 * só sessão válida, e tudo o que ela faz é sobre quem está na sessão (nunca há id
 * de usuário no caminho ou no corpo). Identidade de IA não conecta agenda.
 *
 * Nenhuma resposta carrega token. O retorno do Google chega pelo web, que repassa
 * `code` e `state` aqui com a sessão da pessoa; o `state` selado amarra o retorno
 * à pessoa e à sessão que iniciaram o pedido.
 */
@Controller("google/calendar")
@Authenticated()
@UseGuards(SessionAuthGuard, AcessoGuard)
export class GoogleCalendarController {
  constructor(@Inject(GoogleCalendarService) private readonly servico: GoogleCalendarService) {}

  @Get("conexao")
  @Header("Cache-Control", "no-store")
  async estado(@CurrentPrincipal() quem: AuthPrincipal | undefined, @Req() request: AuthenticatedRequest): Promise<EstadoDoGoogleCalendar> {
    return this.servico.estado(this.pedido(quem, request).userId);
  }

  /** Começa o consentimento: devolve o endereço do Google para onde o navegador deve ir. */
  @Post("conexao/autorizacao")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  async iniciar(@CurrentPrincipal() quem: AuthPrincipal | undefined, @Req() request: AuthenticatedRequest): Promise<AutorizacaoDoGoogleCalendar> {
    return this.servico.iniciar(this.pedido(quem, request));
  }

  /** Conclui o consentimento com o `code` e o `state` que o Google devolveu ao navegador. */
  @Post("conexao/retorno")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  async concluir(
    @Body(new ZodValidationPipe(entradaDeRetornoDoGoogleSchema)) entrada: EntradaDeRetornoDoGoogle,
    @CurrentPrincipal() quem: AuthPrincipal | undefined,
    @Req() request: AuthenticatedRequest,
  ): Promise<EstadoDoGoogleCalendar> {
    return this.servico.concluir(this.pedido(quem, request), entrada);
  }

  @Delete("conexao")
  @Header("Cache-Control", "no-store")
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  async desconectar(@CurrentPrincipal() quem: AuthPrincipal | undefined, @Req() request: AuthenticatedRequest): Promise<EstadoDoGoogleCalendar> {
    return this.servico.desconectar(this.pedido(quem, request).userId);
  }

  private pedido(quem: AuthPrincipal | undefined, request: AuthenticatedRequest): PedidoDaSessao {
    // Só pessoa, com sessão: a identidade de IA não tem agenda, e sem sessão não há com o que amarrar o state.
    if (quem?.kind !== "user" || !request.databaseSessionHash) {
      throw new ForbiddenException("a agenda do Google só se conecta numa sessão de pessoa");
    }
    return { userId: quem.id, sessaoHash: request.databaseSessionHash };
  }
}
