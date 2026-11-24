import type { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { contextoBanco } from "./contexto-banco";
// eslint-disable-next-line no-restricted-imports -- A interface transacional é o alvo deste teste.
import { PrismaService } from "./prisma.service";

function bancoSimulado() {
  const comandos: unknown[][] = [];
  const tx = {
    $executeRaw: vi.fn(async (_sql: TemplateStringsArray, ...valores: unknown[]) => {
      comandos.push(valores);
      return 1;
    }),
  };
  const prisma = new PrismaService();
  const transacao = vi.spyOn(prisma, "$transaction").mockImplementation(async (callback: unknown) =>
    (callback as (tx: Prisma.TransactionClient) => Promise<unknown>)(tx as never),
  );
  return { prisma, tx, comandos, transacao };
}

describe("PrismaService.comContexto", () => {
  it("aplica a sessão na mesma conexão antes do trabalho e reutiliza a transação aninhada", async () => {
    const { prisma, tx, comandos, transacao } = bancoSimulado();

    const resultado = await contextoBanco.run({ sessionHash: "sessao-sintetica" }, () =>
      prisma.comContexto(async (banco) => {
        expect(banco).toBe(tx);
        expect(comandos).toEqual([["sessao-sintetica", ""]]);
        return prisma.comContexto(async (interno) => {
          expect(interno).toBe(banco);
          return "concluído";
        });
      }),
    );

    expect(resultado).toBe("concluído");
    expect(transacao).toHaveBeenCalledTimes(1);
  });

  it("limpa as duas capacidades sem autenticação e preserva as opções externas", async () => {
    const { prisma, comandos, transacao } = bancoSimulado();
    await prisma.comContexto(async () => "anônimo", { maxWait: 250, timeout: 2_000 });
    expect(comandos).toEqual([["", ""]]);
    expect(transacao).toHaveBeenCalledWith(expect.any(Function), { maxWait: 250, timeout: 2_000 });
  });

  it("transporta agente sem inventar sessão de usuário", async () => {
    const { prisma, comandos } = bancoSimulado();
    await contextoBanco.run({ agentHash: "agente-sintetico" }, () => prisma.comContexto(async () => undefined));
    expect(comandos).toEqual([["", "agente-sintetico"]]);
  });

  it("mantém requisições concorrentes isoladas e não conserva transação após falha", async () => {
    const { prisma, transacao } = bancoSimulado();
    const executar = (sessionHash: string) => contextoBanco.run({ sessionHash }, () =>
      prisma.comContexto(async () => {
        await Promise.resolve();
        return contextoBanco.getStore()?.sessionHash;
      }),
    );
    expect(await Promise.all([executar("a"), executar("b")])).toEqual(["a", "b"]);
    const erro = new Error("falha sintética");
    await expect(prisma.comContexto(async () => { throw erro; })).rejects.toBe(erro);
    await expect(executar("c")).resolves.toBe("c");
    expect(transacao).toHaveBeenCalledTimes(4);
    expect(contextoBanco.getStore()).toBeUndefined();
  });

  it("recusa troca de identidade, de pool ou de opções dentro da transação", async () => {
    const { prisma } = bancoSimulado();
    const outro = bancoSimulado();
    await contextoBanco.run({ sessionHash: "a" }, () => prisma.comContexto(async () => {
      await expect(contextoBanco.run({ sessionHash: "b" }, () =>
        prisma.comContexto(async () => undefined),
      )).rejects.toThrow(/identidade/);
      await expect(outro.prisma.comContexto(async () => undefined)).rejects.toThrow(/pool/);
      await expect(prisma.comContexto(async () => undefined, { timeout: 1 })).rejects.toThrow(/externa/);
    }));
    expect(outro.transacao).not.toHaveBeenCalled();
  });

  it("não executa o trabalho se não conseguir estabelecer o contexto", async () => {
    const { prisma, tx } = bancoSimulado();
    tx.$executeRaw.mockRejectedValueOnce(new Error("falha sintética de contexto"));
    const trabalho = vi.fn(async () => undefined);
    await expect(prisma.comContexto(trabalho)).rejects.toThrow(/contexto/);
    expect(trabalho).not.toHaveBeenCalled();
  });
});
