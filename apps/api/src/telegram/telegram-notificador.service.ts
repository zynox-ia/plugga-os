import { Inject, Injectable, Logger } from "@nestjs/common";

import { avisoDeAtividadeAtrasada, avisoDeNovoLead, type DadosDeAtividadeAtrasada, type DadosDeNovoLead } from "./avisos";
import { TelegramCofreService } from "./telegram-cofre.service";
import { TelegramFalhouError, TelegramPort } from "./telegram.port";

/**
 * A porta de entrada dos avisos para o canal da equipe. Quem tem um lead novo ou
 * uma atividade atrasada chama o método; o resto é daqui: conta conectada? aviso
 * ligado? Falha do Telegram NUNCA volta para quem chamou: um lead não pode deixar
 * de ser criado porque o canal está fora do ar.
 */
@Injectable()
export class TelegramNotificadorService {
  private readonly logger = new Logger(TelegramNotificadorService.name);

  constructor(
    @Inject(TelegramCofreService) private readonly cofre: TelegramCofreService,
    @Inject(TelegramPort) private readonly telegram: TelegramPort,
  ) {}

  /** Devolve se o aviso saiu. `false` quando desligado, não conectado ou se o Telegram falhou. */
  avisarNovoLead(dados: DadosDeNovoLead): Promise<boolean> {
    return this.enviar("avisarNovoLead", avisoDeNovoLead(dados));
  }

  avisarAtividadeAtrasada(dados: DadosDeAtividadeAtrasada): Promise<boolean> {
    return this.enviar("avisarAtividadeAtrasada", avisoDeAtividadeAtrasada(dados));
  }

  private async enviar(aviso: "avisarNovoLead" | "avisarAtividadeAtrasada", texto: string): Promise<boolean> {
    try {
      const credenciais = await this.cofre.credenciais();
      if (!credenciais || !credenciais[aviso]) return false;
      await this.telegram.enviar(credenciais.token, credenciais.chatId, texto);
      return true;
    } catch (erro) {
      // Só o motivo curto: o texto do aviso tem dado de cliente e a URL do Telegram tem o token.
      this.logger.warn(`aviso ${aviso} não enviado: ${erro instanceof TelegramFalhouError ? erro.motivo : "erro inesperado"}`);
      return false;
    }
  }
}
