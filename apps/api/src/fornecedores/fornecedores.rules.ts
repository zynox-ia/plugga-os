import type { Prisma } from "@prisma/client";
import {
  somenteDigitos,
  type CriarFornecedor,
  type EditarFornecedor,
  type Fornecedor,
  type FornecedorNaLista,
  type ListarFornecedoresQuery,
} from "@plugga/shared";

/**
 * Regras do cadastro de fornecedores (PLU-326), puras: filtro de busca, nomes
 * dos campos para o evento e conversão da linha do banco no contrato.
 */

/**
 * Busca por nome, nome fantasia ou documento. O documento é comparado pelos
 * dígitos, então "12.345.678/0001-90" e "12345678000190" acham o mesmo; só entra
 * quando há dígitos suficientes para não casar com qualquer número no nome.
 */
export function filtroDaBusca(busca: string | undefined): Prisma.FornecedorWhereInput {
  if (!busca) return {};
  const termo = busca.trim();
  const digitos = somenteDigitos(termo);
  const ou: Prisma.FornecedorWhereInput[] = [
    { nome: { contains: termo, mode: "insensitive" } },
    { nomeFantasia: { contains: termo, mode: "insensitive" } },
  ];
  if (digitos.length >= 3) ou.push({ documento: { contains: digitos } });
  return { OR: ou };
}

export function filtroDaSituacao(situacao: ListarFornecedoresQuery["situacao"]): Prisma.FornecedorWhereInput {
  if (situacao === "ativos") return { ativo: true };
  if (situacao === "inativos") return { ativo: false };
  return {};
}

/** Nomes dos campos enviados, para o evento: nunca os valores. */
export function camposInformados(input: CriarFornecedor | EditarFornecedor): string[] {
  return Object.entries(input)
    .filter(([, valor]) => valor !== undefined)
    .map(([campo]) => campo)
    .sort();
}

export const INCLUDE_DO_FORNECEDOR = {
  criadoPor: { select: { id: true, name: true } },
  atualizadoPor: { select: { id: true, name: true } },
  _count: { select: { cotacoes: true } },
} satisfies Prisma.FornecedorInclude;

export type LinhaDoFornecedor = Prisma.FornecedorGetPayload<{ include: typeof INCLUDE_DO_FORNECEDOR }>;

const pessoa = (usuario: { id: string; name: string } | null) => (usuario ? { id: usuario.id, nome: usuario.name } : null);

export function paraFornecedor(linha: LinhaDoFornecedor): Fornecedor {
  return {
    id: linha.id,
    nome: linha.nome,
    nomeFantasia: linha.nomeFantasia,
    documento: linha.documento,
    categoria: linha.categoria,
    contatoNome: linha.contatoNome,
    telefone: linha.telefone,
    email: linha.email,
    cidade: linha.cidade,
    uf: linha.uf,
    formasDePagamento: linha.formasDePagamento,
    chavePix: linha.chavePix,
    dadosBancarios: linha.dadosBancarios,
    observacoes: linha.observacoes,
    ativo: linha.ativo,
    cotacoes: linha._count.cotacoes,
    criadoPor: pessoa(linha.criadoPor),
    atualizadoPor: pessoa(linha.atualizadoPor),
    createdAt: linha.createdAt.toISOString(),
    updatedAt: linha.updatedAt.toISOString(),
  };
}

export function paraItemDaLista(linha: LinhaDoFornecedor): FornecedorNaLista {
  const completo = paraFornecedor(linha);
  return {
    id: completo.id,
    nome: completo.nome,
    nomeFantasia: completo.nomeFantasia,
    documento: completo.documento,
    categoria: completo.categoria,
    contatoNome: completo.contatoNome,
    telefone: completo.telefone,
    email: completo.email,
    formasDePagamento: completo.formasDePagamento,
    cotacoes: completo.cotacoes,
    cidade: completo.cidade,
    uf: completo.uf,
    ativo: completo.ativo,
    updatedAt: completo.updatedAt,
  };
}
