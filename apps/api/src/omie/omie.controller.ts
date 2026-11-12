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
  entradaDoOmieSchema,
  type EmpresaDoOmie,
  type EntradaDoOmie,
  type EstadoDoOmie,
  type EstadoDoOmieComCofre,
} from "@plugga/shared";

import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { Plataforma } from "../core/auth/acesso.decorator";
import { AcessoGuard } from "../core/auth/acesso.guard";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { CurrentPrincipal } from "../core/auth/current-principal.decorator";
import { OriginCheckGuard } from "../core/auth/origin-check.guard";
import { SessionAuthGuard } from "../core/auth/session-auth.guard";
import { chaveMestraConfigurada } from "../llm/cripto.js";
import { OmieCofreService } from "./omie-cofre.service";
import { OmieFalhouError } from "./omie.port";

const MENSAGEM: Record<OmieFalhouError["motivo"], string> = {
  credenciais_invalidas: "O OMIE recusou a chave ou o segredo do app. Confira os dois em Meus aplicativos, no OMIE.",
  limite_de_consumo: "O OMIE limitou o consumo da API. Tente de novo em instantes.",
  recusada: "O OMIE recusou a consulta. Confira se a chave e o segredo são do mesmo app e se o app está ativo.",
  resposta_inesperada: "O OMIE respondeu de um jeito inesperado. Confira a chave e o segredo e tente de novo.",
  indisponivel: "Não foi possível falar com o OMIE. Tente de novo em instantes.",
};

/**
 * A conta do OMIE da plataforma pela tela. Só desenvolvedor: é infraestrutura do
 * sistema, e quem troca a chave redireciona o financeiro e as notas fiscais. O
 * segredo do app é escrita-apenas: nunca volta na resposta.
 */
@Controller("integracoes/omie")
@UseGuards(SessionAuthGuard, AcessoGuard)
export class OmieController {
  constructor(@Inject(OmieCofreService) private readonly cofre: OmieCofreService) {}

  @Get()
  @Plataforma("desenvolvedor")
  async estado(): Promise<EstadoDoOmieComCofre> {
    return { ...(await this.cofre.estado()), cofreConfigurado: chaveMestraConfigurada() };
  }

  @Put()
  @Plataforma("desenvolvedor")
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  async gravar(
    @Body(new ZodValidationPipe(entradaDoOmieSchema)) entrada: EntradaDoOmie,
    @CurrentPrincipal() quem?: AuthPrincipal,
  ): Promise<EstadoDoOmie> {
    if (!chaveMestraConfigurada()) {
      throw new ServiceUnavailableException(
        "o cofre não está configurado: defina SECRETS_ENCRYPTION_KEY no ambiente " +
          "(gere com `openssl rand -base64 32`) e reinicie a API",
      );
    }
    return this.cofre.gravar(entrada, quem?.id ?? "desconhecido");
  }

  @Delete()
  @Plataforma("desenvolvedor")
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  async apagar(@CurrentPrincipal() quem?: AuthPrincipal): Promise<EstadoDoOmie> {
    return this.cofre.apagar(quem?.id ?? "desconhecido");
  }

  /** Confirma no OMIE de quem é a conta. Só roda a pedido do desenvolvedor. */
  @Post("teste")
  @HttpCode(200)
  @Plataforma("desenvolvedor")
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  async testar(): Promise<EmpresaDoOmie> {
    try {
      return await this.cofre.testar();
    } catch (erro) {
      // Só um texto fixo por motivo: nunca a chave, o segredo ou a mensagem do OMIE.
      throw new BadGatewayException(erro instanceof OmieFalhouError ? MENSAGEM[erro.motivo] : MENSAGEM.indisponivel);
    }
  }
}
