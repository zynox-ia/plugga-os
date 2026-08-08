import type { RoleKey } from "@plugga/shared";

/**
 * Permissões do estudo de eficiência energética, no mesmo padrão de
 * `energy.permissions.ts`: constantes nomeadas em vez de arrays de papel
 * espalhados pelo controller.
 *
 * A aprovação é mais estreita que a operação de propósito — quem calcula não é
 * necessariamente quem assume a responsabilidade pelo que sai para o cliente.
 */
export const LER_ESTUDO: readonly RoleKey[] = [
  "opm",
  "financeiro",
  "admin",
  "diretoria",
  "comercial",
  "tech",
  "viewer",
];
export const OPERAR_ESTUDO: readonly RoleKey[] = ["opm", "admin", "tech"];
export const APROVAR_ESTUDO: readonly RoleKey[] = ["admin", "diretoria"];
