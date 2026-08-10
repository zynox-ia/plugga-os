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

/** Pendência: quem pode abrir (POP §6) é o time de campo inteiro, mais segurança e almoxarife. */
export const REGISTRAR_PENDENCIA: readonly RoleKey[] = [
  "tecnico",
  "supervisor",
  "engenheiro",
  "seguranca",
  "almoxarife",
];

/** Classificar prioridade: supervisor ou engenheiro (POP §6). */
export const CLASSIFICAR_PRIORIDADE_PENDENCIA: readonly RoleKey[] = ["supervisor", "engenheiro"];

/**
 * Encerrar pendência: a lista é ampla porque o POP §6 distribui o encerramento
 * por origem (técnica: supervisor/engenheiro; segurança: seguranca; material:
 * almoxarife/gestor_suprimentos) — quem decide *qual* encerramento vale é a
 * identidade combinada com o tipo da pendência, não um papel único aqui.
 */
export const ENCERRAR_PENDENCIA: readonly RoleKey[] = [
  "supervisor",
  "engenheiro",
  "seguranca",
  "almoxarife",
  "gestor_suprimentos",
];

/** Medição: lançar é supervisor/engenheiro; aprovar é só engenheiro (POP §9). */
export const LANCAR_MEDICAO: readonly RoleKey[] = ["supervisor", "engenheiro"];
export const APROVAR_MEDICAO: readonly RoleKey[] = ["engenheiro"];

/** Projeto: criar/editar versão é projetista/engenheiro; aprovar é só engenheiro (POP §3/§5). */
export const CRIAR_VERSAO_DE_PROJETO: readonly RoleKey[] = ["projetista", "engenheiro"];
export const APROVAR_PROJETO: readonly RoleKey[] = ["engenheiro"];
