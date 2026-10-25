import type { Prisma, PrismaClient } from "@prisma/client";
import { companyKeys } from "@plugga/shared";

import type { AcessoComercial } from "./pipelines.rules";

/**
 * Admin (ou desenvolvedor, que tem a linha `admin`), ou gerente do CRM — que
 * gere o CRM das duas empresas. Relido do banco, e não da sessão: um acesso
 * revogado vale na requisição seguinte. Usado pelos pipelines e pelos
 * negócios, que seguem o mesmo alcance (pipelines.rules.ts).
 */
export async function lerAcessoComercial(prisma: PrismaClient | Prisma.TransactionClient, pessoaId: string): Promise<AcessoComercial> {
  const [admin, gerente] = await Promise.all([
    prisma.userPlatformRole.findFirst({ where: { userId: pessoaId, role: { key: "admin" } }, select: { userId: true } }),
    prisma.userDepartamento.findFirst({ where: { userId: pessoaId, departamento: "crm", nivel: "gerente" }, select: { userId: true } }),
  ]);
  return { admin: admin !== null, gestorEm: gerente ? [...companyKeys] : [] };
}
