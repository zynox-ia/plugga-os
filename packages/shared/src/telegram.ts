import { z } from "zod";

/** Telegram conectado pela plataforma: o token do bot é escrita-apenas e nunca volta da API. */

/** Token do BotFather: `<id numérico>:<segredo>`. */
const tokenDoBot = z
  .string({ error: "informe o token do bot" })
  .trim()
  .regex(/^\d{6,12}:[A-Za-z0-9_-]{30,}$/, "o token do bot não tem o formato do BotFather (123456789:AA...)");

/** Id numérico do chat (grupos têm id negativo) ou @canal público. */
const idDoChat = z
  .string({ error: "informe o id do chat" })
  .trim()
  .regex(/^(-?\d{5,20}|@[A-Za-z][A-Za-z0-9_]{4,})$/, "informe o id numérico do chat (ex.: -1001234567890) ou o @canal");

export const entradaDoTelegramSchema = z
  .object({
    token: tokenDoBot,
    chatId: idDoChat,
    avisarNovoLead: z.boolean(),
    avisarAtividadeAtrasada: z.boolean(),
  })
  .strict();
export type EntradaDoTelegram = z.infer<typeof entradaDoTelegramSchema>;

export type EstadoDoTelegram = {
  conectado: boolean;
  /** Só os quatro últimos caracteres do token. */
  mascara: string | null;
  chatId: string | null;
  avisarNovoLead: boolean;
  avisarAtividadeAtrasada: boolean;
  /** `cofre_ilegivel`: a chave-mestra mudou sem regravar. */
  origem: "cofre" | "cofre_ilegivel" | "nenhuma";
  atualizadoEm: string | null;
  atualizadoPor: string | null;
};

/** Resposta de `GET /integracoes/telegram`: o estado mais a prontidão do cofre. */
export type EstadoDoTelegramComCofre = EstadoDoTelegram & { cofreConfigurado: boolean };
