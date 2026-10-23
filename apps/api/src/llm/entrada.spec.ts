import { consultaDeConsumoSchema, entradaDeChaveSchema } from "@plugga/shared";
import { describe, expect, it } from "vitest";

describe("entrada do módulo LLM (T198)", () => {
  it("recusa chave ausente, não textual ou curta", () => {
    expect(entradaDeChaveSchema.safeParse({}).success).toBe(false);
    expect(entradaDeChaveSchema.safeParse({ chave: 123 }).success).toBe(false);
    expect(entradaDeChaveSchema.safeParse({ chave: "  curta " }).success).toBe(false);
  });

  it("aceita chave com 8 caracteres ou mais e apara espaços", () => {
    expect(entradaDeChaveSchema.parse({ chave: "  sk-or-12345  " }).chave).toBe("sk-or-12345");
  });

  it("recusa data inválida e aceita janela vazia", () => {
    expect(consultaDeConsumoSchema.safeParse({ desde: "ontem" }).success).toBe(false);
    expect(consultaDeConsumoSchema.safeParse({}).success).toBe(true);
    expect(consultaDeConsumoSchema.safeParse({ desde: "2026-10-01", ate: "2026-10-06" }).success).toBe(true);
  });
});
