import { Injectable } from "@nestjs/common";

import { TelegramFalhouError, TelegramPort } from "./telegram.port";

const PRAZO_MS = 8_000;

/**
 * Bot API do Telegram (`sendMessage`). A URL carrega o token, então nenhum erro
 * ou log daqui inclui a URL, a causa da falha de rede nem o corpo da resposta:
 * só o motivo curto.
 */
@Injectable()
export class TelegramHttpAdapter extends TelegramPort {
  async enviar(token: string, chatId: string, textoHtml: string): Promise<void> {
    let resposta: Response;
    try {
      resposta = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: textoHtml, parse_mode: "HTML", disable_web_page_preview: true }),
        signal: AbortSignal.timeout(PRAZO_MS),
      });
    } catch {
      throw new TelegramFalhouError("indisponivel");
    }
    if (resposta.ok) return;

    switch (resposta.status) {
      case 401:
      case 404:
        throw new TelegramFalhouError("token_invalido");
      case 400:
        throw new TelegramFalhouError("chat_invalido");
      case 403:
        throw new TelegramFalhouError("bot_sem_permissao");
      case 429:
        throw new TelegramFalhouError("limite_de_envio");
      default:
        throw new TelegramFalhouError("indisponivel");
    }
  }
}
