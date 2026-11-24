import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Inject,
  Put,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import {
  entradaDoGoogleOAuthSchema,
  type EntradaDoGoogleOAuth,
  type EstadoDoGoogleOAuth,
  type EstadoDoGoogleOAuthComCofre,
} from "@plugga/shared";

import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { Plataforma } from "../core/auth/acesso.decorator";
import { AcessoGuard } from "../core/auth/acesso.guard";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { CurrentPrincipal } from "../core/auth/current-principal.decorator";
import { OriginCheckGuard } from "../core/auth/origin-check.guard";
import { SessionAuthGuard } from "../core/auth/session-auth.guard";
import { chaveMestraConfigurada } from "../llm/cripto.js";
import { GoogleOAuthCofreService } from "./google-oauth-cofre.service";

/**
 * As credenciais do app OAuth do Google. Só desenvolvedor: é infraestrutura do
 * sistema, e quem troca o client id redireciona a conexão de toda a equipe. O
 * client secret é escrita-apenas: nunca volta na resposta.
 */
@Controller("google/oauth")
@UseGuards(SessionAuthGuard, AcessoGuard)
export class GoogleOAuthController {
  constructor(@Inject(GoogleOAuthCofreService) private readonly cofre: GoogleOAuthCofreService) {}

  @Get()
  @Plataforma("desenvolvedor")
  @Header("Cache-Control", "no-store")
  async estado(): Promise<EstadoDoGoogleOAuthComCofre> {
    return { ...(await this.cofre.estado()), cofreConfigurado: chaveMestraConfigurada() };
  }

  @Put()
  @Plataforma("desenvolvedor")
  @Header("Cache-Control", "no-store")
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  async gravar(
    @Body(new ZodValidationPipe(entradaDoGoogleOAuthSchema)) entrada: EntradaDoGoogleOAuth,
    @CurrentPrincipal() quem: AuthPrincipal,
  ): Promise<EstadoDoGoogleOAuth> {
    if (!chaveMestraConfigurada()) {
      throw new ServiceUnavailableException(
        "o cofre não está configurado: defina SECRETS_ENCRYPTION_KEY no ambiente " +
          "(gere com `openssl rand -base64 32`) e reinicie a API",
      );
    }
    return this.cofre.gravar(entrada, quem.id);
  }

  @Delete()
  @Plataforma("desenvolvedor")
  @Header("Cache-Control", "no-store")
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  async apagar(@CurrentPrincipal() quem: AuthPrincipal): Promise<EstadoDoGoogleOAuth> {
    return this.cofre.apagar(quem.id);
  }
}
