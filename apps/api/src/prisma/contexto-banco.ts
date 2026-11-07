import { AsyncLocalStorage } from "node:async_hooks";

/** Capacidades internas autenticadas; nunca vêm de headers nem são serializadas/logadas. */
export interface ContextoBanco {
  sessionHash?: string;
  agentHash?: string;
}

export const contextoBanco = new AsyncLocalStorage<ContextoBanco>();
