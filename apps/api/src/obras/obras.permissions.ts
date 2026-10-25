import type { Departamento } from "@plugga/shared";

/**
 * Quem faz o quê em Obras (POP-OBR-001), no modelo de 4 papéis. Admin e
 * desenvolvedor passam em todas por regra do guard. O membro de Engenharia e
 * Obras opera o campo; o gerente aprova (etapa, projeto, medição) e decide as
 * exceções de segurança. As duas assinaturas da APR continuam sendo de pessoas
 * diferentes, conferidas pela identidade de quem assina.
 *
 * Constantes com `_GERENTE` no nome vão com nível `gerente`.
 */

/** Ver a obra: Engenharia e Obras, e Suprimentos, que atende o material. */
export const LER_OBRA: Departamento[] = ["engenharia-obras", "suprimentos"];

/** Operação de campo: evidência, EPI, APR, liberação, pendência, medição, versão de projeto. */
export const OPERAR_OBRA: Departamento = "engenharia-obras";

/** Evidência e encerramento de pendência também cabem a Suprimentos (material em campo). */
export const OPERAR_OBRA_COM_SUPRIMENTOS: Departamento[] = ["engenharia-obras", "suprimentos"];

/** Avançar etapa, reabrir/aprovar projeto, aprovar medição, conferir EPI, revogar liberação. */
export const DECIDIR_OBRA_GERENTE: Departamento = "engenharia-obras";
