import { Body, Controller, Get, Inject, Put, ServiceUnavailableException, UseGuards } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import {
  entradaDaConsultaCadastralSchema,
  type EntradaDaConsultaCadastral,
  type EstadoDaConsultaCadastral,
  type EstadoDaConsultaCadastralComCofre,
} from "@plugga/shared";

import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { Plataforma } from "../core/auth/acesso.decorator";
import { AcessoGuard } from "../core/auth/acesso.guard";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { CurrentPrincipal } from "../core/auth/current-principal.decorator";
import { OriginCheckGuard } from "../core/auth/origin-check.guard";
import { SessionAuthGuard } from "../core/auth/session-auth.guard";
import { chaveMestraConfigurada } from "../llm/cripto.js";
import { ConsultaCadastralService } from "./consulta-cadastral.service";

/** O liga/desliga da consulta de CNPJ e CEP. Só desenvolvedor: é infraestrutura da plataforma. */
@Controller("integracoes/cadastro")
@UseGuards(SessionAuthGuard, AcessoGuard)
export class CadastroIntegracaoController {
  constructor(@Inject(ConsultaCadastralService) private readonly consulta: ConsultaCadastralService) {}

  @Get()
  @Plataforma("desenvolvedor")
  async estado(): Promise<EstadoDaConsultaCadastralComCofre> {
    return { ...(await this.consulta.estado()), cofreConfigurado: chaveMestraConfigurada() };
  }

  @Put()
  @Plataforma("desenvolvedor")
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  async definir(
    @Body(new ZodValidationPipe(entradaDaConsultaCadastralSchema)) { ativa }: EntradaDaConsultaCadastral,
    @CurrentPrincipal() quem?: AuthPrincipal,
  ): Promise<EstadoDaConsultaCadastral> {
    if (ativa && !chaveMestraConfigurada()) {
      throw new ServiceUnavailableException(
        "o cofre não está configurado: defina SECRETS_ENCRYPTION_KEY no ambiente " +
          "(gere com `openssl rand -base64 32`) e reinicie a API",
      );
    }
    return this.consulta.definir(ativa, quem?.id ?? "desconhecido");
  }
}
