import { z } from "zod";

/**
 * Identificador de registro que vem da URL ou de um corpo (US12, T123).
 *
 * O web valida antes de montar qualquer caminho para a API: `../..`, `%2F` e
 * qualquer coisa que não seja UUID são recusados sem chamada de rede.
 */
export const identificadorSchema = z.string().uuid();

/** Verdadeiro só para UUID bem formado. */
export function ehIdentificador(valor: unknown): valor is string {
  return identificadorSchema.safeParse(valor).success;
}
