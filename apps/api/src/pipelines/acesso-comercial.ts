import type { Prisma, PrismaClient } from "@prisma/client";
import { companyKeys, departamentoComercial } from "@plugga/shared";

import type { AcessoComercial } from "./pipelines.rules";

/**
 * Admin, ou empresas em que a pessoa gere o departamento comercial. Usado pelos
 * pipelines e pelos negócios, que seguem o mesmo alcance (pipelines.rules.ts).
 */
export async function lerAcessoComercial(prisma: PrismaClient | Prisma.TransactionClient, pessoaId: string): Promise<AcessoComercial> {
  const [admin, gestao] = await Promise.all([
    prisma.userPlatformRole.findFirst({ where: { userId: pessoaId, role: { key: "admin" } }, select: { userId: true } }),
    prisma.userDepartmentAccess.findMany({
      where: { userId: pessoaId, isManager: true, departmentId: { in: Object.values(departamentoComercial) } },
      select: { companyId: true, departmentId: true },
    }),
  ]);
  const gestorEm = companyKeys.filter((empresa) => gestao.some((g) => g.companyId === empresa && g.departmentId === departamentoComercial[empresa]));
  return { admin: admin !== null, gestorEm };
}
