import { acessoADepartamentoSchema, type Acesso } from "@plugga/shared";

/** Forma mínima do include do Prisma exigida para montar `Acesso` (modelo de 4 papéis). */
export interface AcessoSource {
  platformRoles: Array<{ role: { key: string } }>;
  departamentos: Array<{ departamento: string; nivel: string; telas?: string[] }>;
}

/**
 * Acesso no modelo de 4 papéis. Desenvolvedor prevalece sobre admin (quem é
 * desenvolvedor também tem a linha `admin`, que é o que a regra do último admin
 * conta). Papel de plataforma alcança tudo por regra, então as linhas de
 * departamento de quem o tem não são lidas.
 */
export function mapAcesso(user: AcessoSource): Acesso {
  const chaves = new Set(user.platformRoles.map((assignment) => assignment.role.key));
  const plataforma = chaves.has("desenvolvedor") ? "desenvolvedor" : chaves.has("admin") ? "admin" : null;
  if (plataforma !== null) {
    return { plataforma, departamentos: [] };
  }
  return {
    plataforma: null,
    // Linha fora do catálogo é lixo de migração: some da leitura em vez de
    // derrubar o login.
    departamentos: user.departamentos.flatMap((linha) => {
      const parsed = acessoADepartamentoSchema.safeParse({
        departamento: linha.departamento,
        nivel: linha.nivel,
        ...(linha.telas !== undefined ? { telas: linha.telas } : {}),
      });
      return parsed.success ? [parsed.data] : [];
    }),
  };
}
