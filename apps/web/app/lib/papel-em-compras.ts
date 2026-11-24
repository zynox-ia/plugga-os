import { alcancaDepartamento, alcancaTela, type Acesso } from "@plugga/shared";

/**
 * Quem faz o quê em Compras, espelho de `papelEmCompras` da API
 * (apps/api/src/compras/compras.rules.ts). Quem opera Compras cria e conduz o
 * pedido; o gerente do Financeiro aprova e revisa; quem é do Financeiro paga.
 * Quem é só do Financeiro abre a tela para decidir, mas não cria pedido.
 * As ações de cada pedido vêm prontas da API em `acoesPermitidas`; aqui fica só
 * o que a web precisa antes de ter um pedido: abrir a tela e criar.
 */
export type PapelEmCompras = { operaCompras: boolean; membroDoFinanceiro: boolean; gerenteDoFinanceiro: boolean };

export function papelEmCompras(acesso: Acesso | null | undefined): PapelEmCompras {
  if (!acesso) return { operaCompras: false, membroDoFinanceiro: false, gerenteDoFinanceiro: false };
  return {
    operaCompras: alcancaTela(acesso, "suprimentos.compras"),
    membroDoFinanceiro: alcancaDepartamento(acesso, "financeiro", "membro"),
    gerenteDoFinanceiro: alcancaDepartamento(acesso, "financeiro", "gerente"),
  };
}

/** Telas do Financeiro que o guard da API aceita em Compras (@Tela do controller). */
const TELAS_DO_FINANCEIRO = ["financeiro.pagar", "financeiro.receber", "financeiro.conciliacao", "financeiro.fiscal"] as const;

/**
 * Abre a tela quem opera Compras, ou quem é do Financeiro e alcança alguma tela
 * do Financeiro: o guard da API exige as duas coisas, e sem a tela a página
 * abriria só para mostrar o 403.
 */
export const podeVerCompras = (acesso: Acesso | null | undefined): boolean => {
  const papel = papelEmCompras(acesso);
  return papel.operaCompras || (papel.membroDoFinanceiro && TELAS_DO_FINANCEIRO.some((tela) => alcancaTela(acesso!, tela)));
};

export const podeCriarPedido = (acesso: Acesso | null | undefined): boolean => papelEmCompras(acesso).operaCompras;
