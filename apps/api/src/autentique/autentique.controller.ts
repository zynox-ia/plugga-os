import {
  BadGatewayException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import {
  companyKeySchema,
  entradaDaAutentiqueSchema,
  type CompanyKey,
  type ContaConsultadaDaAutentique,
  type EntradaDaAutentique,
  type EstadoDaAutentique,
  type EstadoDaAutentiqueComCofre,
} from "@plugga/shared";

import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { Plataforma } from "../core/auth/acesso.decorator";
import { AcessoGuard } from "../core/auth/acesso.guard";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { CurrentPrincipal } from "../core/auth/current-principal.decorator";
import { OriginCheckGuard } from "../core/auth/origin-check.guard";
import { SessionAuthGuard } from "../core/auth/session-auth.guard";
import { chaveMestraConfigurada } from "../llm/cripto.js";
import { AutentiqueCofreService } from "./autentique-cofre.service";
import { AutentiqueFalhouError } from "./autentique.port";

const MENSAGEM: Record<AutentiqueFalhouError["motivo"], string> = {
  token_invalido: "A Autentique recusou o token. Confira o token da API desta empresa.",
  limite_de_envio: "A Autentique limitou as consultas. Tente de novo em instantes.",
  resposta_inesperada: "A Autentique respondeu de um jeito inesperado. Confira o token e tente de novo.",
  indisponivel: "Não foi possível falar com a Autentique. Tente de novo em instantes.",
};

const empresaPipe = new ZodValidationPipe(companyKeySchema);

/**
 * As contas da Autentique da plataforma, uma por empresa. Só desenvolvedor: é
 * infraestrutura do sistema, e quem troca o token redireciona as assinaturas de
 * uma empresa inteira. O token é escrita-apenas: nunca volta na resposta.
 */
@Controller("integracoes/autentique")
@UseGuards(SessionAuthGuard, AcessoGuard)
export class AutentiqueController {
  constructor(@Inject(AutentiqueCofreService) private readonly cofre: AutentiqueCofreService) {}

  @Get()
  @Plataforma("desenvolvedor")
  async estado(): Promise<EstadoDaAutentiqueComCofre> {
    return { ...(await this.cofre.estado()), cofreConfigurado: chaveMestraConfigurada() };
  }

  @Put(":empresa")
  @Plataforma("desenvolvedor")
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  async gravar(
    @Param("empresa", empresaPipe) empresa: CompanyKey,
    @Body(new ZodValidationPipe(entradaDaAutentiqueSchema)) entrada: EntradaDaAutentique,
    @CurrentPrincipal() quem?: AuthPrincipal,
  ): Promise<EstadoDaAutentique> {
    if (!chaveMestraConfigurada()) {
      throw new ServiceUnavailableException(
        "o cofre não está configurado: defina SECRETS_ENCRYPTION_KEY no ambiente " +
          "(gere com `openssl rand -base64 32`) e reinicie a API",
      );
    }
    return this.cofre.gravar(empresa, entrada, quem?.id ?? "desconhecido");
  }

  @Delete(":empresa")
  @Plataforma("desenvolvedor")
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  async apagar(@Param("empresa", empresaPipe) empresa: CompanyKey, @CurrentPrincipal() quem?: AuthPrincipal): Promise<EstadoDaAutentique> {
    return this.cofre.apagar(empresa, quem?.id ?? "desconhecido");
  }

  /** Confirma na Autentique de quem é a conta desta empresa. Só roda a pedido do desenvolvedor. */
  @Post(":empresa/teste")
  @HttpCode(200)
  @Plataforma("desenvolvedor")
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  async testar(@Param("empresa", empresaPipe) empresa: CompanyKey): Promise<ContaConsultadaDaAutentique> {
    try {
      return await this.cofre.testar(empresa);
    } catch (erro) {
      // Só um texto fixo por motivo: nunca o token ou o corpo da Autentique.
      throw new BadGatewayException(erro instanceof AutentiqueFalhouError ? MENSAGEM[erro.motivo] : MENSAGEM.indisponivel);
    }
  }
}
