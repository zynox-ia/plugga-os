import { afterEach, describe, expect, it } from "vitest";

import { ServicoIndisponivel } from "../../common/errors/dominio";
import { ArmazenamentoS3 } from "./armazenamento-s3";

const s3 = () =>
  new ArmazenamentoS3({
    extensoes: { "application/pdf": "pdf" },
    prefixo: "docs",
    nomePadrao: "arquivo",
    mensagemNaoConfigurado: "sem storage",
  });

describe("ArmazenamentoS3", () => {
  const original = process.env.STORAGE_ENDPOINT;
  afterEach(() => {
    if (original === undefined) delete process.env.STORAGE_ENDPOINT;
    else process.env.STORAGE_ENDPOINT = original;
  });

  it("nomeia pelo conteúdo e limpa o nome original", () => {
    const nome = s3().nomeDoObjeto(Buffer.from("abc"), "application/pdf", "Orçamento Final (2).pdf");
    expect(nome).toMatch(/^docs\/[0-9a-f]{16}\/Orcamento-Final-2-?\.pdf$/);
  });

  it("usa o nome padrão e a extensão bin quando nada sobra", () => {
    expect(s3().nomeDoObjeto(Buffer.from("x"), "image/gif", "***")).toMatch(/^docs\/[0-9a-f]{16}\/arquivo\.bin$/);
  });

  it("lança, sem engolir, quando o storage não está configurado", async () => {
    delete process.env.STORAGE_ENDPOINT;
    await expect(s3().guardarEm("balde", Buffer.from("x"), "application/pdf", "a.pdf")).rejects.toBeInstanceOf(
      ServicoIndisponivel,
    );
  });
});
