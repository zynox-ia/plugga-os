import { AsyncLocalStorage } from "node:async_hooks";

/** Contexto da requisição em andamento, para o log achar o `requestId` sem recebê-lo por parâmetro. */
export type ContextoDaRequisicao = { requestId: string };

export const contextoDaRequisicao = new AsyncLocalStorage<ContextoDaRequisicao>();

export function requestIdAtual(): string | undefined {
  return contextoDaRequisicao.getStore()?.requestId;
}
