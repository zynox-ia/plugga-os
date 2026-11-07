import type { Prisma, PrismaClient } from "@prisma/client";
import { alcancaTela, companyKeys } from "@plugga/shared";
import { mapAcesso } from "../core/auth/user-access.mapper";
import { AcessoNegado, NaoEncontrado } from "../common/errors/dominio";

import type { AcessoComercial } from "./pipelines.rules";

/** A tela libera os leads; ownership não é uma restrição desta etapa (decisão do André). */
export function exigeOperacaoComercial(acesso: AcessoComercial, mensagem = "Negócio não encontrado."): void {
  if (!acesso.podeOperar) throw new NaoEncontrado(mensagem);
}

export function exigeAtribuicaoComercial(acesso: AcessoComercial, pessoaId: string, ownerId: string): void {
  if (!acesso.admin && acesso.gestorEm.length === 0 && ownerId !== pessoaId) throw new AcessoNegado("Somente a gestão pode atribuir registros a outra pessoa.");
}

/**
 * Acesso de plataforma ou permissão para CRM/Pipelines, com gestão separada
 * da visualização. Relido do banco, e não da sessão: um acesso
 * revogado vale na requisição seguinte. Usado pelos pipelines e pelos
 * negócios, que seguem o mesmo alcance (pipelines.rules.ts).
 */
export async function lerAcessoComercial(prisma: PrismaClient | Prisma.TransactionClient, pessoaId: string): Promise<AcessoComercial> {
  const pessoa = await prisma.user.findUnique({ where: { id: pessoaId }, select: { status: true,
    platformRoles: { include: { role: true } }, departamentos: true,
  } });
  const acesso = pessoa ? mapAcesso(pessoa) : undefined;
  const podeOperar = pessoa?.status === "active" && alcancaTela(acesso, "crm.pipelines");
  return {
    podeOperar,
    podeVerClientes: pessoa?.status === "active" && alcancaTela(acesso, "crm.clientes"),
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
