import {
  acessoADepartamentoSchema,
  companyKeySchema,
  companyRoleKeySchema,
  departmentIdSchema,
  isDepartmentOfCompany,
  platformRoleKeySchema,
  type Acesso,
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

/** Forma mínima do include do Prisma exigida para montar `Acesso` (modelo de 4 papéis). */
export interface AcessoSource {
  platformRoles: Array<{ role: { key: string } }>;
  departamentos: Array<{ departamento: string; nivel: string }>;
}

/**
 * Acesso no modelo de 4 papéis. Desenvolvedor prevalece sobre admin: durante a
 * transição, quem é desenvolvedor também tem a linha `admin` (ver
 * `UserDepartamento` no schema). Papel de plataforma alcança tudo por regra,
 * então as linhas de departamento de quem o tem não são lidas.
 */
export function mapAcesso(user: AcessoSource): Acesso {
  const chaves = new Set(user.platformRoles.map((assignment) => assignment.role.key));
  const plataforma = chaves.has("desenvolvedor") ? "desenvolvedor" : chaves.has("admin") ? "admin" : null;
  if (plataforma !== null) {
    return { plataforma, departamentos: [] };
  }
  return {
    plataforma: null,
    // Linha fora do catálogo é lixo de migração, como em `mapUserAccess`: some
    // da leitura em vez de derrubar o login.
    departamentos: user.departamentos.flatMap((linha) => {
      const parsed = acessoADepartamentoSchema.safeParse({
        departamento: linha.departamento,
        nivel: linha.nivel,
      });
      return parsed.success ? [parsed.data] : [];
    }),
  };
}
