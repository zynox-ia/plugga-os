import type { Prisma, PrismaClient } from "@prisma/client";
import { alcancaTela, companyKeys } from "@plugga/shared";
import { mapAcesso } from "../core/auth/user-access.mapper";

import type { AcessoComercial } from "./pipelines.rules";

/**
 * Acesso de plataforma ou permissão para CRM/Pipelines, com gestão separada
 * da visualização. Relido do banco, e não da sessão: um acesso
 * revogado vale na requisição seguinte. Usado pelos pipelines e pelos
 * negócios, que seguem o mesmo alcance (pipelines.rules.ts).
 */
export async function lerAcessoComercial(prisma: PrismaClient | Prisma.TransactionClient, pessoaId: string): Promise<AcessoComercial> {
  const pessoa = await prisma.user.findUnique({ where: { id: pessoaId }, include: {
    platformRoles: { include: { role: true } }, departamentos: true,
  } });
  const acesso = pessoa ? mapAcesso(pessoa) : undefined;
  const podeOperar = pessoa?.status === "active" && alcancaTela(acesso, "crm.pipelines");
  return {
    podeOperar,
    admin: podeOperar && acesso?.plataforma !== null,
    gestorEm: podeOperar && acesso?.departamentos.some((d) => d.departamento === "crm" && d.nivel === "gerente") ? [...companyKeys] : [],
  };
}

/** Mesma elegibilidade para listar, configurar equipe e atribuir negócios. */
export const pessoaElegivelParaPipelines = {
  status: "active",
  OR: [
    { platformRoles: { some: { role: { key: { in: ["admin", "desenvolvedor"] } } } } },
    { departamentos: { some: { departamento: "crm", telas: { has: "crm.pipelines" } } } },
  ],
} satisfies Prisma.UserWhereInput;
