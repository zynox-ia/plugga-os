import {
  BadGatewayException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Post,
  Put,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import {
  entradaDeTesteDoBrevoSchema,
  entradaDoBrevoSchema,
  type EntradaDeTesteDoBrevo,
  type EntradaDoBrevo,
  type EstadoDoBrevo,
  type EstadoDoBrevoComCofre,
} from "@plugga/shared";

import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { Plataforma } from "../core/auth/acesso.decorator";
import { AcessoGuard } from "../core/auth/acesso.guard";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { CurrentPrincipal } from "../core/auth/current-principal.decorator";
import { OriginCheckGuard } from "../core/auth/origin-check.guard";
import { SessionAuthGuard } from "../core/auth/session-auth.guard";
import { chaveMestraConfigurada } from "../llm/cripto.js";
import { BrevoCofreService } from "./brevo-cofre.service";
import { BrevoEmailAdapter } from "./brevo-email.adapter";

/**
 * O Brevo da empresa pela tela. Só admin: quem troca a credencial redireciona
 * todo e-mail do sistema. A chave é escrita-apenas: nunca volta na resposta.
 */
@Controller("email/brevo")
@UseGuards(SessionAuthGuard, AcessoGuard)
export class BrevoController {
  constructor(
    @Inject(BrevoCofreService) private readonly cofre: BrevoCofreService,
    @Inject(BrevoEmailAdapter) private readonly brevo: BrevoEmailAdapter,
  ) {}

  @Get()
  @Plataforma("admin")
  async estado(): Promise<EstadoDoBrevoComCofre> {
    return { ...(await this.cofre.estado()), cofreConfigurado: chaveMestraConfigurada() };
  }

  @Put()
  @Plataforma("admin")
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  async gravar(
    @Body(new ZodValidationPipe(entradaDoBrevoSchema)) entrada: EntradaDoBrevo,
    @CurrentPrincipal() quem?: AuthPrincipal,
  ): Promise<EstadoDoBrevo> {
    if (!chaveMestraConfigurada()) {
      throw new ServiceUnavailableException(
        "o cofre não está configurado: defina SECRETS_ENCRYPTION_KEY no ambiente " +
          "(gere com `openssl rand -base64 32`) e reinicie a API",
      );
    }
    return this.cofre.gravar(entrada, quem?.id ?? "desconhecido");
  }

  @Delete()
  @Plataforma("admin")
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  async apagar(@CurrentPrincipal() quem?: AuthPrincipal): Promise<EstadoDoBrevo> {
    return this.cofre.apagar(quem?.id ?? "desconhecido");
  }

  /** Manda um e-mail de teste com a configuração em uso. Só roda a pedido do admin. */
  @Post("teste")
  @HttpCode(200)
  @Plataforma("admin")
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  async testar(
    @Body(new ZodValidationPipe(entradaDeTesteDoBrevoSchema)) { destinatario }: EntradaDeTesteDoBrevo,
  ): Promise<{ enviado: true }> {
    try {
      await this.brevo.enviarTeste(destinatario);
    } catch (erro) {
      // Só o status do Brevo volta; nunca o corpo, a chave ou o remetente.
      const status = erro instanceof Error ? /HTTP (\d{3})/.exec(erro.message)?.[1] : undefined;
      throw new BadGatewayException(
        status
          ? `o Brevo recusou o envio (HTTP ${status}); confira a chave e se o remetente está validado no Brevo`
          : "não foi possível falar com o Brevo; tente de novo em instantes",
      );
    }
    return { enviado: true };
  }
}
