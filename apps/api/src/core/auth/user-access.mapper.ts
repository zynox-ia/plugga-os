import {
  companyKeySchema,
  companyRoleKeySchema,
  departmentIdSchema,
  isDepartmentOfCompany,
  platformRoleKeySchema,
  type CompanyAccess,
  type UserAccess,
} from "@plugga/shared";

/**
 * Forma mínima do include do Prisma exigida para montar `UserAccess`. Extraída
 * de `PrismaAuthRepository.toRecord` para o core: `PrismaSessionLookupRepository`
 * precisa da mesma validação de papel/empresa/departamento, e o core não pode
 * depender do módulo de auth (feature) para não inverter a dependência.
 */
export interface UserAccessSource {
  platformRoles: Array<{ role: { key: string } }>;
  memberships: Array<{
    companyId: string;
    roles: Array<{ role: { key: string } }>;
    departments: Array<{ departmentId: string; isManager: boolean }>;
  }>;
}

export function mapUserAccess(user: UserAccessSource): UserAccess {
  return {
    platformRoles: user.platformRoles.flatMap((assignment) => {
      const parsed = platformRoleKeySchema.safeParse(assignment.role.key);
      return parsed.success ? [parsed.data] : [];
    }),
    companies: user.memberships.flatMap((membership) => {
      const empresa = companyKeySchema.safeParse(membership.companyId);
      if (!empresa.success) {
        return [];
      }

      const company: CompanyAccess = {
        companyId: empresa.data,
        roles: membership.roles.flatMap((assignment) => {
          const parsed = companyRoleKeySchema.safeParse(assignment.role.key);
          return parsed.success ? [parsed.data] : [];
        }),
        // Uma linha para um departamento que saiu do catálogo é lixo de
        // migração, não acesso: some da leitura em vez de derrubar o login.
        departments: membership.departments.flatMap((department) => {
          const parsed = departmentIdSchema.safeParse(department.departmentId);
          if (!parsed.success || !isDepartmentOfCompany(empresa.data, parsed.data)) {
            return [];
          }
          return [{ departmentId: parsed.data, isManager: department.isManager }];
        }),
      };

      return [company];
    }),
  };
}
