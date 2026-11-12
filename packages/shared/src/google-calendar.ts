import { z } from "zod";

/**
 * Google Calendar: a agenda de cada pessoa, conectada por OAuth 2.0.
 *
 * Duas camadas, de donos diferentes:
 * - credenciais do app OAuth (client id e secret), da plataforma: só o
 *   desenvolvedor as cadastra, e ficam cifradas no cofre;
 * - conexão da pessoa: cada membro autoriza a própria conta Google. O token de
 *   renovação fica cifrado e só a própria pessoa o alcança.
 */

/** Escopo da agenda: ver e editar eventos. É o menor que cobre criar, atualizar e remover eventos na agenda principal. */
export const ESCOPO_AGENDA_DO_GOOGLE = "https://www.googleapis.com/auth/calendar.events";

/** Tudo o que o consentimento pede. `openid` e `email` só servem para mostrar a conta conectada. */
export const ESCOPOS_DO_GOOGLE_CALENDAR = ["openid", "email", ESCOPO_AGENDA_DO_GOOGLE] as const;

/** Credenciais do app OAuth criado no Google Cloud. */
export const entradaDoGoogleOAuthSchema = z
  .object({
    clientId: z
      .string({ error: "informe o ID do cliente OAuth" })
      .trim()
      .min(1, "informe o ID do cliente OAuth")
      .max(256)
      .regex(/\.apps\.googleusercontent\.com$/, "o ID do cliente termina em .apps.googleusercontent.com"),
    clientSecret: z
      .string({ error: "informe a chave secreta do cliente OAuth" })
      .trim()
      .min(8, "informe a chave secreta do cliente OAuth")
      .max(256),
  })
  .strict();
export type EntradaDoGoogleOAuth = z.infer<typeof entradaDoGoogleOAuthSchema>;

export type EstadoDoGoogleOAuth = {
  conectado: boolean;
  /** `cofre_ilegivel`: a chave-mestra mudou depois de gravar; é preciso regravar. */
  origem: "cofre" | "cofre_ilegivel" | "nenhuma";
  /** O ID do cliente é público por natureza (vai na URL de consentimento de todo mundo). */
  clientId: string | null;
  /** Só os quatro últimos caracteres da chave secreta. */
  mascara: string | null;
  atualizadoEm: string | null;
  atualizadoPor: string | null;
  /** URI de redirecionamento que o app OAuth precisa ter cadastrada, exatamente assim. */
  urlDeRetorno: string;
  escopos: readonly string[];
};

/** Resposta de `GET /google/oauth`: o estado mais a prontidão do cofre. */
export type EstadoDoGoogleOAuthComCofre = EstadoDoGoogleOAuth & { cofreConfigurado: boolean };

/** A conexão da própria pessoa. Nunca carrega token. */
export type EstadoDoGoogleCalendar = {
  /** A plataforma já cadastrou as credenciais do app OAuth. Sem isso ninguém conecta. */
  disponivel: boolean;
  conectado: boolean;
  /** Conta Google conectada. */
  email: string | null;
  conectadoEm: string | null;
};

/** Para onde mandar a pessoa para autorizar no Google. */
export type AutorizacaoDoGoogleCalendar = { url: string };

/** O que o Google devolve ao navegador no retorno do consentimento. */
export const entradaDeRetornoDoGoogleSchema = z
  .object({
    code: z.string({ error: "retorno sem código" }).min(1, "retorno sem código").max(2048),
    state: z.string({ error: "retorno sem state" }).min(1, "retorno sem state").max(4096),
  })
  .strict();
export type EntradaDeRetornoDoGoogle = z.infer<typeof entradaDeRetornoDoGoogleSchema>;
