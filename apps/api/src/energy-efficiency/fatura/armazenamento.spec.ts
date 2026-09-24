import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ArmazenamentoDeFaturas } from "./armazenamento.js";

/**
 * A garantia que este teste protege é a de degradação: **guardar nunca bloqueia
 * ler**.
 *
 * Sem armazenamento configurado — que é o caso do `pnpm dev` e de qualquer
 * ambiente que ainda não subiu o MinIO — a leitura da fatura tem de continuar
 * inteira, só sem a chave do arquivo. Uma pessoa não pode ficar sem lançar a
 * conta de luz porque um serviço de apoio não está de pé.
 *
 * A ida ao servidor de verdade fica no teste de integração
 * (`pnpm test:storage`), que exige o MinIO no ar.
 */
describe("ArmazenamentoDeFaturas sem servidor configurado", () => {
  const originais = { ...process.env };

  beforeEach(() => {
    delete process.env.STORAGE_ENDPOINT;
  });

  afterEach(() => {
    process.env = { ...originais };
  });

  it("devolve chave nula em vez de falhar", async () => {
    const armazenamento = new ArmazenamentoDeFaturas();
    const resultado = await armazenamento.guardar(
      Buffer.from("%PDF-1.4 fatura"),
      "application/pdf",
      "fatura.pdf",
    );

    expect(resultado).toEqual({ chave: null });
  });
});
