import { z } from "zod";

/**
 * Empresas (etiqueta dos registros) e o catálogo empresa × área que dá nome aos
 * **baldes de armazenamento de arquivos** (`apps/api/src/core/armazenamento/baldes.ts`):
 * os baldes `plugga-financeiro`, `waze-engenharia-obras`… já existem no storage,
 * e renomeá-los é mudança de infraestrutura, não de código.
 *
 * Não é acesso. O acesso é por departamento, sem empresa (`acesso.ts`), e a
 * navegação lista os departamentos de lá (`apps/web/app/lib/organizacao.ts`).
 */

export const companyKeys = ["plugga", "waze"] as const;

export const companyKeySchema = z.enum(companyKeys);

export type CompanyKey = (typeof companyKeys)[number];

export const departmentIds = [
  "comercial-clientes",
  "energia-opm",
  "produto-tecnologia",
  "financeiro",
  "comercial-obras",
  "engenharia-obras",
  "suprimentos",
  "marketing",
] as const;

export const departmentIdSchema = z.enum(departmentIds);

export type DepartmentId = (typeof departmentIds)[number];

export const departmentIdsByCompany = {
  plugga: [
    "comercial-clientes",
    "energia-opm",
    "produto-tecnologia",
    "suprimentos",
    "financeiro",
    "marketing",
  ],
  waze: [
    "comercial-obras",
    "engenharia-obras",
    "suprimentos",
    "financeiro",
    "marketing",
  ],
} as const satisfies Record<CompanyKey, readonly DepartmentId[]>;

/** Um departamento só pertence a uma empresa se o catálogo disser que pertence. */
export function isDepartmentOfCompany(company: CompanyKey, departmentId: string): boolean {
  return (departmentIdsByCompany[company] as readonly string[]).includes(departmentId);
}
