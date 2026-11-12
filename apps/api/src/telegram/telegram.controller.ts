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
  entradaDoTelegramSchema,
  type EntradaDoTelegram,
  type EstadoDoTelegram,
  type EstadoDoTelegramComCofre,
} from "@plugga/shared";

import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { Plataforma } from "../core/auth/acesso.decorator";
import { AcessoGuard } from "../core/auth/acesso.guard";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { CurrentPrincipal } from "../core/auth/current-principal.decorator";
import { OriginCheckGuard } from "../core/auth/origin-check.guard";
import { SessionAuthGuard } from "../core/auth/session-auth.guard";
import { chaveMestraConfigurada } from "../llm/cripto.js";
import { TelegramCofreService } from "./telegram-cofre.service";
import { TelegramFalhouError } from "./telegram.port";

const MENSAGEM: Record<TelegramFalhouError["motivo"], string> = {
  token_invalido: "O Telegram recusou o token do bot. Confira o token no BotFather.",
  chat_invalido: "O Telegram não encontrou o chat. Confira o id do chat.",
  bot_sem_permissao: "O bot não tem permissão no chat. Adicione o bot ao grupo ou canal.",
  limite_de_envio: "O Telegram limitou os envios. Tente de novo em instantes.",
  indisponivel: "Não foi possível falar com o Telegram. Tente de novo em instantes.",
};

/**
 * O Telegram da plataforma pela tela. Só desenvolvedor: é infraestrutura do
 * sistema, e quem troca o bot ou o chat redireciona os avisos de toda a equipe.
 * O token é escrita-apenas: nunca volta na resposta.
 */
@Controller("integracoes/telegram")
@UseGuards(SessionAuthGuard, AcessoGuard)
export class TelegramController {
  constructor(@Inject(TelegramCofreService) private readonly cofre: TelegramCofreService) {}

  @Get()
  @Plataforma("desenvolvedor")
  async estado(): Promise<EstadoDoTelegramComCofre> {
    return { ...(await this.cofre.estado()), cofreConfigurado: chaveMestraConfigurada() };
  }

  @Put()
  @Plataforma("desenvolvedor")
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  async gravar(
    @Body(new ZodValidationPipe(entradaDoTelegramSchema)) entrada: EntradaDoTelegram,
    @CurrentPrincipal() quem?: AuthPrincipal,
  ): Promise<EstadoDoTelegram> {
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
  async apagar(@CurrentPrincipal() quem?: AuthPrincipal): Promise<EstadoDoTelegram> {
    return this.cofre.apagar(quem?.id ?? "desconhecido");
  }

  /** Manda uma mensagem de teste com a conexão atual. Só roda a pedido do desenvolvedor. */
  @Post("teste")
  @HttpCode(200)
  @Plataforma("desenvolvedor")
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  async testar(): Promise<{ enviado: true }> {
    try {
      await this.cofre.enviarTeste();
    } catch (erro) {
      // Só um texto fixo por motivo: nunca o token, o chat ou o corpo do Telegram.
      throw new BadGatewayException(erro instanceof TelegramFalhouError ? MENSAGEM[erro.motivo] : MENSAGEM.indisponivel);
    }
    return { enviado: true };
  }
}
