/** O Telegram recusou ou não respondeu. Só o motivo curto, nunca a URL (ela carrega o token). */
export class TelegramFalhouError extends Error {
  constructor(
    readonly motivo: "token_invalido" | "chat_invalido" | "bot_sem_permissao" | "limite_de_envio" | "indisponivel",
  ) {
    super(`telegram falhou: ${motivo}`);
  }
}

/**
 * Porta do Telegram. Ninguém no sistema fala com a API do Telegram direto: o
 * notificador e o teste da tela passam por aqui, e os testes usam um dublê.
 */
export abstract class TelegramPort {
  abstract enviar(token: string, chatId: string, textoHtml: string): Promise<void>;
}
