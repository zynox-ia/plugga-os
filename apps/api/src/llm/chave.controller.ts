import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Put,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";

import type { AuthPrincipal } from "../core/auth/auth.types";
import { CurrentPrincipal } from "../core/auth/current-principal.decorator";
import { DevAuthGuard } from "../core/auth/dev-auth.guard";
import { OriginCheckGuard } from "../core/auth/origin-check.guard";
import { Roles } from "../core/auth/roles.decorator";
import { RolesGuard } from "../core/auth/roles.guard";
import { ChaveDeLlmService, type EstadoDaChave } from "./chave.service.js";
import { chaveMestraConfigurada } from "./cripto.js";

/**
 * A chave da OpenRouter pela tela.
 *
 * Só admin: quem pode trocar a credencial pode redirecionar todo o gasto do
 * sistema. E `OriginCheckGuard` nas rotas que escrevem, pelo mesmo motivo das
 * outras rotas mutantes — uma troca de credencial disparada de outro site seria
 * um belo estrago silencioso.
 *
 * A chave **nunca** volta na resposta. Nem para admin, nem mascarada além dos
 * quatro últimos: é escrita-apenas, e quem esqueceu grava outra.
 */
@Controller("llm/chave")
@UseGuards(DevAuthGuard, RolesGuard)
export class ChaveController {
  constructor(private readonly chave: ChaveDeLlmService) {}

  @Get()
  @Roles("admin")
  async estado(): Promise<EstadoDaChave & { cofreConfigurado: boolean }> {
    // A tela precisa saber se o cofre está pronto antes de oferecer o campo:
    // sem chave-mestra, gravar falharia depois de a pessoa colar a credencial,
    // que é a hora errada de descobrir.
    return { ...(await this.chave.estado()), cofreConfigurado: chaveMestraConfigurada() };
  }

  @Put()
  @Roles("admin")
  @UseGuards(OriginCheckGuard)
  async gravar(
    @Body("chave") valor: unknown,
    @CurrentPrincipal() quem?: AuthPrincipal,
  ): Promise<EstadoDaChave> {
    if (typeof valor !== "string" || valor.trim().length < 8) {
      throw new BadRequestException("informe a chave da OpenRouter");
    }
    if (!chaveMestraConfigurada()) {
      // 503 e não 500: é configuração de infraestrutura faltando, e a mensagem
      // diz o comando exato em vez de mandar procurar.
      throw new ServiceUnavailableException(
        "o cofre não está configurado: defina SECRETS_ENCRYPTION_KEY no ambiente " +
          "(gere com `openssl rand -base64 32`) e reinicie a API",
      );
    }

    return this.chave.gravar(valor, quem?.id ?? "desconhecido");
  }

  @Delete()
  @Roles("admin")
  @UseGuards(OriginCheckGuard)
  async apagar(@CurrentPrincipal() quem?: AuthPrincipal): Promise<EstadoDaChave> {
    return this.chave.apagar(quem?.id ?? "desconhecido");
  }
}
