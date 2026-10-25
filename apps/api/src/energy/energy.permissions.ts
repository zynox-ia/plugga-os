import type { Departamento } from "@plugga/shared";

/**
 * Quem faz o quê em Energia, no modelo de 4 papéis (decisão do André em
 * 25/10/2026). Admin e desenvolvedor passam em todas por regra do guard.
 *
 * - Ver: Energia e Financeiro — o Financeiro aprova o relatório e decide a
 *   contestação, então precisa enxergar o ciclo.
 * - Operar (ciclo, relatório, envio, migração, auditoria, abrir contestação):
 *   membro de Energia.
 * - Fechar o ciclo: membro de Energia ou do Financeiro, como antes.
 * - Aprovar o relatório e decidir a contestação: gerente do Financeiro. Quem
 *   produz não aprova — a separação que já existia entre opm e financeiro.
 */
export const VER_ENERGIA: Departamento[] = ["energia-opm", "financeiro"];
export const OPERAR_ENERGIA: Departamento = "energia-opm";
export const FECHAR_CICLO: Departamento[] = ["energia-opm", "financeiro"];
/** Com nível `gerente`. */
export const APROVAR_EM_ENERGIA: Departamento = "financeiro";
