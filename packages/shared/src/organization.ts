import { z } from "zod";

/**
 * Empresa → Departamento, na fatia que atravessa web e API.
 *
 * O catálogo completo (rótulos, ícones, processos, rotas) segue em
 * `apps/web/app/lib/organizacao.ts`: é desenho de navegação e só a web usa.
 * Aqui moram apenas os **identificadores**, porque são eles que a API precisa
 * validar ao conceder acesso — um `departmentId` que a API aceitasse sem
 * conferir viraria um acesso a um departamento que não existe, invisível na
 * tela e impossível de revogar por ela.
 *
 * `financeiro` existe nas duas empresas de propósito: acesso é sempre o par
 * (empresa, departamento), nunca o departamento sozinho.
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
] as const;

export const departmentIdSchema = z.enum(departmentIds);

export type DepartmentId = (typeof departmentIds)[number];

export const departmentIdsByCompany = {
  plugga: ["comercial-clientes", "energia-opm", "produto-tecnologia", "financeiro"],
  waze: ["comercial-obras", "engenharia-obras", "financeiro"],
} as const satisfies Record<CompanyKey, readonly DepartmentId[]>;

export const companyNames: Record<CompanyKey, string> = {
  plugga: "Plugga",
  waze: "Waze Energia",
};

export function isCompanyKey(value: string): value is CompanyKey {
  return (companyKeys as readonly string[]).includes(value);
}

export function isDepartmentId(value: string): value is DepartmentId {
  return (departmentIds as readonly string[]).includes(value);
}

/** Um departamento só pertence a uma empresa se o catálogo disser que pertence. */
export function isDepartmentOfCompany(company: CompanyKey, departmentId: string): boolean {
  return (departmentIdsByCompany[company] as readonly string[]).includes(departmentId);
}
