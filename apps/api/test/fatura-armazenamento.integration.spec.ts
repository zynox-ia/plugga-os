import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { ArmazenamentoDeFaturas } from "../src/energy-efficiency/fatura/armazenamento.js";

/**
 * Guarda da fatura no armazenamento de objetos.
 *
 * Roda contra o MinIO que o Compose sobe. Fica atrás de variável porque exige
 * serviço no ar, como os outros testes de integração deste diretório:
 *
 *     docker compose up -d minio minio-provisiona
 *     pnpm --filter @plugga/api test:storage
 *
 * O que se prova é o que a implementação promete: o arquivo sobe, o nome é
 * função do conteúdo — então reenviar não duplica — e, o mais importante,
 * armazenamento indisponível **não** derruba a leitura da fatura.
 */
const HABILITADO = process.env.RUN_STORAGE_INTEGRATION_TESTS === "true";

const PRAZO_MS = 60_000;

const FATURA = Buffer.from("%PDF-1.4 conteudo de fatura para o teste", "latin1");

describe.skipIf(!HABILITADO)("armazenamento de faturas", () => {
  it(
    "guarda o arquivo e devolve a chave",
    async () => {
      const armazenamento = new ArmazenamentoDeFaturas();
      const { chave } = await armazenamento.guardar(FATURA, "application/pdf", "fatura.pdf");

      expect(chave).not.toBeNull();
      // A chave carrega a impressão digital do conteúdo: é o que torna o envio
      // repetido idempotente sem precisar consultar o balde antes.
      const digital = createHash("sha256").update(FATURA).digest("hex").slice(0, 16);
      expect(chave).toBe(`faturas/${digital}/fatura.pdf`);
    },
    PRAZO_MS,
  );

  it(
    "dá a mesma chave para o mesmo arquivo e chave diferente para outro",
    async () => {
      const armazenamento = new ArmazenamentoDeFaturas();

      const primeira = await armazenamento.guardar(FATURA, "application/pdf", "fatura.pdf");
      const repetida = await armazenamento.guardar(FATURA, "application/pdf", "fatura.pdf");
      const outra = await armazenamento.guardar(
        Buffer.concat([FATURA, Buffer.from(" outro mes")]),
        "application/pdf",
        "fatura.pdf",
      );

      expect(repetida.chave).toBe(primeira.chave);
      expect(outra.chave).not.toBe(primeira.chave);
    },
    PRAZO_MS,
  );

  it(
    "guarda foto da conta com a extensão do tipo real",
    async () => {
      const armazenamento = new ArmazenamentoDeFaturas();
      const foto = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

      // O nome chega mentindo — é o caso das 18 faturas do CRM que são foto
      // renomeada. Quem abrir o balde depois precisa ver um `.jpg`.
      const { chave } = await armazenamento.guardar(foto, "image/jpeg", "conta.pdf");

      expect(chave).toMatch(/\.jpg$/);
    },
    PRAZO_MS,
  );
});
