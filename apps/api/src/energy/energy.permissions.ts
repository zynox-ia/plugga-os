import type { RoleKey } from "@plugga/shared";

/**
 * Named permission constants instead of role arrays scattered across
 * controllers (plano técnico Energia & OPM, seção "Decisões de forma").
 * RBAC is broad for now (opm/financeiro/admin/diretoria); tighten by editing
 * these constants, not by touching every route.
 */
export const READ_ENERGY: readonly RoleKey[] = ["opm", "financeiro", "admin", "diretoria", "comercial", "tech", "viewer"];
export const OPERATE_ENERGY: readonly RoleKey[] = ["opm", "admin"];
export const APPROVE_REPORT: readonly RoleKey[] = ["financeiro", "admin", "diretoria"];
export const CLOSE_CYCLE: readonly RoleKey[] = ["opm", "financeiro", "admin"];
export const RESOLVE_CONTESTATION: readonly RoleKey[] = ["financeiro", "admin", "diretoria"];
