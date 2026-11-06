import type { Prisma, PrismaClient } from "@prisma/client";
import { alcancaTela, companyKeys } from "@plugga/shared";
import { mapAcesso } from "../core/auth/user-access.mapper";
import { AcessoNegado, NaoEncontrado } from "../common/errors/dominio";

import type { AcessoComercial } from "./pipelines.rules";

/** Usa a permissão relida do banco; o papel guardado na sessão pode estar revogado. */
export const filtroDoResponsavelComercial = (acesso: AcessoComercial, pessoaId: string): { ownerId?: string } =>
  acesso.admin || acesso.gestorEm.length > 0 ? {} : { ownerId: pessoaId };

export function pessoaVisivelComercial<T extends { id: string }>(acesso: AcessoComercial, pessoaId: string, pessoa: T | null): T | null {
  return pessoa && filtroDoResponsavelComercial(acesso, pessoaId).ownerId && pessoa.id !== pessoaId ? null : pessoa;
}

export function exigeDonoComercial(acesso: AcessoComercial, pessoaId: string, ownerId: string | null | undefined, mensagem = "Negócio não encontrado."): void {
  if (!acesso.podeOperar || (filtroDoResponsavelComercial(acesso, pessoaId).ownerId && ownerId !== pessoaId)) throw new NaoEncontrado(mensagem);
}

export function exigeAtribuicaoComercial(acesso: AcessoComercial, pessoaId: string, ownerId: string): void {
  if (filtroDoResponsavelComercial(acesso, pessoaId).ownerId && ownerId !== pessoaId) throw new AcessoNegado("Somente a gestão pode atribuir registros a outra pessoa.");
}

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
