import { AsyncLocalStorage } from "node:async_hooks";

import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { PrismaClient, type Prisma } from "@prisma/client";

import { contextoBanco, type ContextoBanco } from "./contexto-banco";
import { validarPapelBanco } from "./validar-papel-banco";

type OpcoesTransacao = Parameters<PrismaClient["$transaction"]>[1];
const transacaoAtual = new AsyncLocalStorage<{
  cliente: PrismaClient;
  tx: Prisma.TransactionClient;
  contexto: ContextoBanco;
}>();

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await validarPapelBanco(this, "plugga_runtime");
  }

  /** Só trabalho de banco: HTTP, storage e outros I/Os ficam fora desta transação curta. */
  async comContexto<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>, opcoes?: OpcoesTransacao): Promise<T> {
    const contexto = { ...contextoBanco.getStore() };
    const atual = transacaoAtual.getStore();
    if (atual) {
      if (atual.cliente !== this || atual.contexto.sessionHash !== contexto.sessionHash || atual.contexto.agentHash !== contexto.agentHash) {
        throw new Error("Não é permitido trocar de pool ou identidade dentro da transação.");
      }
      if (opcoes !== undefined) throw new Error("As opções pertencem à transação externa.");
      return fn(atual.tx);
    }

    // Absorve rajadas na fila do pool sem ampliar o prazo de execução da transação.
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT set_config('plugga.session_hash', ${contexto.sessionHash ?? ""}, true),
               set_config('plugga.agent_hash', ${contexto.agentHash ?? ""}, true)`;
      return transacaoAtual.run({ cliente: this, tx, contexto }, () => fn(tx));
    }, { ...opcoes, maxWait: opcoes?.maxWait ?? 10_000 });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
