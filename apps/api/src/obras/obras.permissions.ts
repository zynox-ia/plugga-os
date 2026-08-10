import type { RoleKey } from "@plugga/shared";

/**
 * Matriz de permissão por ação, no molde de `compras.permissions.ts` — POP-OBR-001
 * §5 (Matriz de Permissões por Etapa).
 */

/** Leitura ampla: quem acompanha a obra sem necessariamente poder mudar nada. */
export const LER_OBRA: readonly RoleKey[] = [
  "diretoria",
  "projetista",
  "engenheiro",
  "supervisor",
  "tecnico",
  "almoxarife",
  "seguranca",
  "gestor_suprimentos",
  "admin",
  "viewer",
];

/** Avançar etapa é o engenheiro (aprovação técnica) ou diretoria (POP §5). */
export const AVANCAR_ETAPA: readonly RoleKey[] = ["engenheiro", "diretoria"];

/** Reabertura de projeto aprovado: engenheiro com justificativa, ou diretoria — POP §3. */
export const REABRIR_PROJETO: readonly RoleKey[] = ["engenheiro", "diretoria"];

/** Registrar evidência: quem está em campo ou aprova o que está em campo (POP §5, linha "Registrar evidência"). */
export const REGISTRAR_EVIDENCIA: readonly RoleKey[] = [
  "tecnico",
  "supervisor",
  "engenheiro",
  "projetista",
  "almoxarife",
  "seguranca",
  "gestor_suprimentos",
  "diretoria",
];

/** EPI: quem executa ou supervisiona registra; segurança confere (POP §8.1). */
export const REGISTRAR_EPI: readonly RoleKey[] = ["seguranca", "supervisor", "engenheiro"];
export const CONFERIR_EPI: readonly RoleKey[] = ["seguranca"];

/** APR: mesmo trio que registra EPI; assinatura é validada por identidade, não por papel adicional. */
export const REGISTRAR_APR: readonly RoleKey[] = ["seguranca", "supervisor", "engenheiro"];
export const ASSINAR_APR: readonly RoleKey[] = ["seguranca", "supervisor"];

/** Incidente: POP §8.3 é explícito — "qualquer membro pode registrar". */
export const REGISTRAR_INCIDENTE: readonly RoleKey[] = LER_OBRA;

/** Liberação de segurança: POP §8.4 — seguranca, supervisor (ciência) ou engenheiro (risco técnico). */
export const REGISTRAR_LIBERACAO: readonly RoleKey[] = ["seguranca", "supervisor", "engenheiro"];
export const REVOGAR_LIBERACAO: readonly RoleKey[] = ["seguranca", "supervisor", "engenheiro", "diretoria"];
