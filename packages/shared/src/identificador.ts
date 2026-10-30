import { z } from "zod";

/**
 * Identificador de registro que vem da URL ou de um corpo (US12, T123).
 *
 * O web valida antes de montar qualquer caminho para a API: `../..`, `%2F` e
 * qualquer coisa que não seja UUID são recusados sem chamada de rede.
 */
// `guid` mantém a regra do zod 3 (ver `primitivas.ts`): `uuid()` do zod 4
// recusaria ids válidos no banco que não seguem a RFC 9562.
export const identificadorSchema = z.guid();

/** Verdadeiro só para UUID bem formado. */
export function ehIdentificador(valor: unknown): valor is string {
  return identificadorSchema.safeParse(valor).success;
}
