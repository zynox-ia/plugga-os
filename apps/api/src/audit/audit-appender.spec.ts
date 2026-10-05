import type { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { AuditAppender, PayloadDeAuditoriaInvalido, type EventoParaRegistro } from "./audit-appender";

function transacaoFalsa() {
  const create = vi.fn().mockResolvedValue({ id: "1" });
  return { tx: { eventLog: { create } } as unknown as Prisma.TransactionClient, create };
}

const base: EventoParaRegistro = {
  eventName: "commercial.opportunity.won",
  entityType: "opportunity",
  entityId: "00000000-0000-4000-8000-000000000001",
  actorType: "user",
  actorId: "00000000-0000-4000-8000-000000000002",
  payload: { campos: ["status"] },
};

describe("AuditAppender", () => {
  const appender = new AuditAppender();

  it("grava na transação recebida", async () => {
    const { tx, create } = transacaoFalsa();

    await appender.append(tx, base);

    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.calls[0]![0].data).toMatchObject({
      eventName: "commercial.opportunity.won",
      entityType: "opportunity",
      payload: { campos: ["status"] },
    });
  });

  it("exige a transação (tx)", async () => {
    await expect(appender.append(undefined as never, base)).rejects.toBeInstanceOf(PayloadDeAuditoriaInvalido);
  });

  it("aceita evento legado, que continua válido por uma versão", async () => {
    const { tx, create } = transacaoFalsa();

    await appender.append(tx, { ...base, eventName: "commercial.opportunity_won" as never });

    expect(create).toHaveBeenCalledOnce();
  });

  it("rejeita evento fora do catálogo", async () => {
    const { tx, create } = transacaoFalsa();

    await expect(appender.append(tx, { ...base, eventName: "qualquer.coisa.feita" as never })).rejects.toThrow(
      /fora do catálogo/,
    );
    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    ["e-mail em valor", { contato: "pessoa@exemplo.com" }],
    ["chave e-mail", { email: "x" }],
    ["chave com acento e caixa", { "Endereço": "x" }],
    ["chave aninhada", { dados: { telefone: "x" } }],
    ["chave dentro de lista", { itens: [{ cnpj: "x" }] }],
    ["CNPJ formatado", { ref: "12.345.678/0001-95" }],
    ["CPF formatado", { ref: "123.456.789-09" }],
    ["CPF só com dígitos e dígito verificador válido", { ref: "52998224725" }],
    ["CNPJ só com dígitos e dígito verificador válido", { ref: "11222333000181" }],
  ])("rejeita payload com %s", async (_nome, payload) => {
    const { tx, create } = transacaoFalsa();

    await expect(appender.append(tx, { ...base, payload })).rejects.toBeInstanceOf(PayloadDeAuditoriaInvalido);
    expect(create).not.toHaveBeenCalled();
  });

  it("aceita só identificadores e nomes de campos", async () => {
    const { tx, create } = transacaoFalsa();

    await appender.append(tx, {
      ...base,
      payload: { campos: ["nome"], entidadeId: "00000000-0000-4000-8000-000000000003", total: 3, protocolo: "12345678901" },
    });

    expect(create).toHaveBeenCalledOnce();
  });

  it("não deixa o valor rejeitado aparecer na mensagem de erro", async () => {
    const { tx } = transacaoFalsa();

    const erro = await appender.append(tx, { ...base, payload: { ref: "pessoa@exemplo.com" } }).catch((e: Error) => e);

    expect((erro as Error).message).not.toContain("pessoa@exemplo.com");
  });
});
