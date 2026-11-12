import { z } from "zod";

export const emailProviderSchema = z.enum(["noop", "brevo"]);

/**
 * Not backed by the `integrations` table: email delivery isn't gated by the
 * mock -> read_only -> bridge -> write cutover state machine (ADR-0005) the
 * way Bitrix/OMIE/etc. are. This just reports which adapter is selected via
 * EMAIL_PROVIDER and whether it can currently deliver — never an address,
 * key, or other secret.
 */
export const emailStatusSchema = z
  .object({
    provider: emailProviderSchema,
    configured: z.boolean(),
  })
  .strict();

export type EmailProvider = z.infer<typeof emailProviderSchema>;
export type EmailStatus = z.infer<typeof emailStatusSchema>;

/** Brevo conectado pela tela (cofre da plataforma). A chave nunca sai da API. */
export const entradaDoBrevoSchema = z
  .object({
    chave: z.string({ error: "informe a chave da API do Brevo" }).trim().min(8, "informe a chave da API do Brevo"),
    remetenteNome: z.string({ error: "informe o nome do remetente" }).trim().min(1, "informe o nome do remetente").max(80),
    remetenteEmail: z.string({ error: "informe o e-mail do remetente" }).trim().email("informe um e-mail válido").max(254),
  })
  .strict();
export type EntradaDoBrevo = z.infer<typeof entradaDoBrevoSchema>;

export const entradaDeTesteDoBrevoSchema = z
  .object({ destinatario: z.string({ error: "informe o e-mail de destino" }).trim().email("informe um e-mail válido").max(254) })
  .strict();
export type EntradaDeTesteDoBrevo = z.infer<typeof entradaDeTesteDoBrevoSchema>;

export type EstadoDoBrevo = {
  /** Se o sistema consegue enviar por Brevo agora, venha do cofre ou do ambiente. */
  conectado: boolean;
  /** O cofre tem precedência sobre o ambiente. `cofre_ilegivel`: chave-mestra mudou sem regravar. */
  origem: "cofre" | "cofre_ilegivel" | "ambiente" | "nenhuma";
  /** Só os quatro últimos caracteres da chave. */
  mascara: string | null;
  remetente: { nome: string; email: string } | null;
  atualizadoEm: string | null;
  atualizadoPor: string | null;
};

/** Resposta de `GET /email/brevo`: o estado mais a prontidão do cofre. */
export type EstadoDoBrevoComCofre = EstadoDoBrevo & { cofreConfigurado: boolean };
