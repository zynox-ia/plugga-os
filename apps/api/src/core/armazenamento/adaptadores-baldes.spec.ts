import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const enviados: Array<{ Bucket?: string; Key?: string }> = [];

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    send(comando: { input: { Bucket?: string; Key?: string } }) {
      enviados.push(comando.input);
      return Promise.resolve({});
    }
    destroy() {}
  },
  PutObjectCommand: class {
    constructor(public input: { Bucket?: string; Key?: string }) {}
  },
}));

import { ArmazenamentoDeCotacoes } from "../../compras/armazenamento-de-cotacoes.js";
import { ArmazenamentoDeFaturas } from "../../energy-efficiency/fatura/armazenamento.js";
import { ArmazenamentoDeEvidencias } from "../../obras/armazenamento-de-evidencias.js";

/**
 * Cada ponto que grava arquivo cai no balde do seu departamento. O balde não
 * vem mais de STORAGE_BUCKET: uma variável única mandava tudo, de qualquer
 * empresa, para o mesmo lugar.
 */
describe("adaptadores de armazenamento escolhem o balde pelo departamento", () => {
  const originais = { ...process.env };
  const pdf = Buffer.from("%PDF-1.4 conteudo");

  beforeEach(() => {
    enviados.length = 0;
    process.env.STORAGE_ENDPOINT = "http://seaweedfs:8333";
    process.env.STORAGE_ACCESS_KEY = "chave";
    process.env.STORAGE_SECRET_KEY = "segredo";
    delete process.env.STORAGE_BUCKET;
  });

  afterEach(() => {
    process.env = { ...originais };
  });

  it("fatura de energia vai para plugga-energia-opm", async () => {
    const resultado = await new ArmazenamentoDeFaturas().guardar(pdf, "application/pdf", "fatura.pdf");

    expect(resultado.chave).toMatch(/^faturas\/[0-9a-f]{16}\/fatura\.pdf$/);
    expect(enviados).toHaveLength(1);
    expect(enviados[0]?.Bucket).toBe("plugga-energia-opm");
  });

  it("cotação da Plugga vai para plugga-financeiro", async () => {
    await new ArmazenamentoDeCotacoes().guardar(pdf, "application/pdf", "orcamento.pdf", "plugga");

    expect(enviados[0]?.Bucket).toBe("plugga-financeiro");
  });

  it("cotação da Waze vai para waze-financeiro, outro balde que o da Plugga", async () => {
    await new ArmazenamentoDeCotacoes().guardar(pdf, "application/pdf", "orcamento.pdf", "waze");

    expect(enviados[0]?.Bucket).toBe("waze-financeiro");
  });

  it("evidência de obra vai para waze-engenharia-obras", async () => {
    await new ArmazenamentoDeEvidencias().guardar(pdf, "application/pdf", "foto.pdf");

    expect(enviados[0]?.Bucket).toBe("waze-engenharia-obras");
  });

  it("STORAGE_BUCKET legado é ignorado: o balde vem do departamento", async () => {
    process.env.STORAGE_BUCKET = "plugga-faturas";

    await new ArmazenamentoDeFaturas().guardar(pdf, "application/pdf", "fatura.pdf");
    await new ArmazenamentoDeEvidencias().guardar(pdf, "application/pdf", "foto.pdf");

    expect(enviados.map((e) => e.Bucket)).toEqual(["plugga-energia-opm", "waze-engenharia-obras"]);
  });

  it("cotação com empresa inválida falha em vez de escolher um balde qualquer", async () => {
    await expect(
      new ArmazenamentoDeCotacoes().guardar(pdf, "application/pdf", "o.pdf", "outra" as never),
    ).rejects.toThrow();
    expect(enviados).toHaveLength(0);
  });

  it("basta o endereço do servidor para considerar o armazenamento configurado", async () => {
    // Antes exigia também STORAGE_BUCKET; sem ele o balde é derivado.
    delete process.env.STORAGE_BUCKET;

    const resultado = await new ArmazenamentoDeFaturas().guardar(pdf, "application/pdf", "fatura.pdf");

    expect(resultado.chave).not.toBeNull();
  });
});
