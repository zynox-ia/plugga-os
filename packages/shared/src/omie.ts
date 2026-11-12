import { z } from "zod";

/**
 * OMIE (financeiro e nota fiscal): uma conta só para a plataforma. A chave e o
 * segredo do app ficam cifrados no cofre; o segredo é escrita-apenas e nunca
 * volta da API.
 */

export const entradaDoOmieSchema = z
  .object({
    appKey: z
      .string({ error: "informe a chave do app (App Key)" })
      .trim()
      .min(6, "a chave do app (App Key) é maior que isso; confira se copiou inteira")
      .max(64, "a chave do app (App Key) é menor que isso; confira o que foi colado")
      .refine((v) => !/\s/.test(v), "a chave do app não pode ter espaços; confira o que foi colado"),
    appSecret: z
      .string({ error: "informe o segredo do app (App Secret)" })
      .trim()
      .min(16, "o segredo do app (App Secret) é maior que isso; confira se copiou inteiro")
      .max(128, "o segredo do app (App Secret) é menor que isso; confira o que foi colado")
      .refine((v) => !/\s/.test(v), "o segredo do app não pode ter espaços; confira o que foi colado"),
  })
  .strict();
export type EntradaDoOmie = z.infer<typeof entradaDoOmieSchema>;

export type EstadoDoOmie = {
  conectado: boolean;
  /** Só os quatro últimos caracteres da chave do app. */
  mascara: string | null;
  /** `cofre_ilegivel`: a chave-mestra mudou sem regravar. */
  origem: "cofre" | "cofre_ilegivel" | "nenhuma";
  atualizadoEm: string | null;
  atualizadoPor: string | null;
};

/** Resposta de `GET /integracoes/omie`: o estado mais a prontidão do cofre. */
export type EstadoDoOmieComCofre = EstadoDoOmie & { cofreConfigurado: boolean };

/** A empresa dona da conta, como o OMIE a informou no teste de conexão. */
export type EmpresaDoOmie = {
  razaoSocial: string | null;
  nomeFantasia: string | null;
  /** Só os 14 dígitos. */
  cnpj: string | null;
};
