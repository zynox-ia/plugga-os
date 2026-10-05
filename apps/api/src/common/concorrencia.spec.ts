import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { comRepeticaoP2002, transicionar } from "./concorrencia";
import { Conflito, EstadoInvalido } from "./errors/dominio";

const p2002 = () =>
  new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "test" });

describe("transicionar", () => {
  it("condiciona o WHERE ao id e ao estado de origem", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });

    await transicionar({ updateMany }, "e1", { status: "draft" }, { status: "approved" });

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "e1", status: "draft" },
      data: { status: "approved" },
    });
  });

  it("lança EstadoInvalido (CONFLITO_ESTADO) quando nenhuma linha casa", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });

    const erro = await transicionar({ updateMany }, "e1", { status: "draft" }, {}).catch((e) => e);

    expect(erro).toBeInstanceOf(EstadoInvalido);
    expect(erro.codigo).toBe("CONFLITO_ESTADO");
  });

  it("usa a mensagem do chamador", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });

    const erro = await transicionar({ updateMany }, "e1", {}, {}, "A APR já foi assinada.").catch((e) => e);

    expect(erro.mensagemParaUsuario).toBe("A APR já foi assinada.");
  });
});

describe("comRepeticaoP2002", () => {
  it("repete após P2002 e devolve o resultado da tentativa que passa", async () => {
    const fn = vi.fn().mockRejectedValueOnce(p2002()).mockResolvedValueOnce("ok");

    expect(await comRepeticaoP2002(fn)).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("esgotadas as tentativas, lança Conflito", async () => {
    const fn = vi.fn().mockRejectedValue(p2002());

    await expect(comRepeticaoP2002(fn, 3)).rejects.toBeInstanceOf(Conflito);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("não repete outros erros", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("boom"));

    await expect(comRepeticaoP2002(fn)).rejects.toThrow("boom");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
