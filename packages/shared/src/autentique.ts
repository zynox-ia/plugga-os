import { z } from "zod";

import { companyKeys, type CompanyKey } from "./organization.js";

/**
 * Autentique (assinatura eletrônica): uma conta por empresa. A Plugga e a Waze
 * Energia têm cada uma o seu token, guardado cifrado no cofre; o token é
 * escrita-apenas e nunca volta da API.
 */

export const entradaDaAutentiqueSchema = z
  .object({
    token: z
      .string({ error: "informe o token da API da Autentique" })
      .trim()
      .min(20, "o token da API da Autentique é maior que isso; confira se copiou inteiro")
      .max(300, "o token da API da Autentique é menor que isso; confira o que foi colado"),
    /** Documentos criados em modo de testes: não valem juridicamente nem consomem a franquia. */
    sandbox: z.boolean(),
  })
  .strict();
export type EntradaDaAutentique = z.infer<typeof entradaDaAutentiqueSchema>;

export type ContaDaAutentique = {
  empresa: CompanyKey;
  conectada: boolean;
  /** Só os quatro últimos caracteres do token. */
  mascara: string | null;
  sandbox: boolean;
  /** `cofre_ilegivel`: a chave-mestra mudou sem regravar. */
  origem: "cofre" | "cofre_ilegivel" | "nenhuma";
  atualizadoEm: string | null;
  atualizadoPor: string | null;
};

/** Uma entrada por empresa, sempre na ordem de `companyKeys`. */
export type EstadoDaAutentique = { contas: ContaDaAutentique[] };

/** Resposta de `GET /integracoes/autentique`: o estado mais a prontidão do cofre. */
export type EstadoDaAutentiqueComCofre = EstadoDaAutentique & { cofreConfigurado: boolean };

/** Quem é o dono da conta, como a Autentique o informou no teste de conexão. */
export type ContaConsultadaDaAutentique = { nome: string | null; email: string | null };

export const empresasDaAutentique = companyKeys;
