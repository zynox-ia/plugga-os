import { z } from "zod";

/**
 * Primitivas de validação compartilhadas pelos contratos de domínio. Um arquivo,
 * uma regra: a mesma regex de decimal vivia copiada em quatro módulos, e uma
 * mudança (ex.: aceitar negativo para resultado financeiro) teria de acertar as
 * quatro cópias sem nada que cobrasse isso. Deliberadamente NÃO reexportadas no
 * index.ts — são detalhe interno dos contratos, não API pública do pacote.
 */
// `guid` e não `uuid`: no zod 4, `uuid()` exige os bits de versão e variante
// da RFC 9562 e recusa ids que o Postgres aceita (fixos como 00000000-…-c1).
// `guid` é a regra do zod 3: 8-4-4-4-12 hexadecimal.
export const uuid = z.guid();
export const isoDate = z.string().datetime();
export const decimalString = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, "valor deve ser um decimal com até 2 casas");
