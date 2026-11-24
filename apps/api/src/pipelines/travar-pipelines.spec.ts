import { describe, expect, it, vi } from "vitest";

import { travarPipelines } from "./travar-pipelines";

describe("Lock transacional de pipelines", () => {
  it("deduplica e adquire em ordem estável, aguardando uma chave antes da próxima", async () => {
    let liberar!: (count: number) => void;
    const primeira = new Promise<number>((resolve) => { liberar = resolve; });
    const executar = vi.fn().mockReturnValueOnce(primeira).mockResolvedValue(1);
    const banco = { $executeRaw: executar };
    const trabalho = travarPipelines(banco as never, ["b", "a", "b"]);
    expect(executar).toHaveBeenCalledOnce();
    expect(executar.mock.calls[0]?.[1]).toBe("plugga:pipeline:a");
    liberar(1);
    await trabalho;
    expect(executar.mock.calls.map((call) => call[1])).toEqual(["plugga:pipeline:a", "plugga:pipeline:b"]);
    expect(executar.mock.calls[0]?.[0].join("?")).toBe("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))");
  });

  it("falha na aquisição não executa as chaves seguintes", async () => {
    const erro = new Error("Transação cancelada");
    const executar = vi.fn().mockRejectedValue(erro);
    await expect(travarPipelines({ $executeRaw: executar } as never, ["b", "a"])).rejects.toBe(erro);
    expect(executar).toHaveBeenCalledOnce();
  });

  it("usa a mesma chave para o UUID vindo da URL ou do banco", async () => {
    const id = "abcd0000-0000-4000-8000-000000000001";
    const executar = vi.fn().mockResolvedValue(1);
    await travarPipelines({ $executeRaw: executar } as never, [id.toUpperCase(), id]);
    expect(executar).toHaveBeenCalledOnce();
    expect(executar.mock.calls[0]?.[1]).toBe(`plugga:pipeline:${id}`);
  });
});
