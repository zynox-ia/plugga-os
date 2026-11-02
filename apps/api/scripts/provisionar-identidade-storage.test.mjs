import { describe, expect, it, vi } from "vitest";
import { assinaRequisicao, provisionarIdentidade } from "./provisionar-identidade-storage.mjs";

describe("assinaRequisicao", () => {
  it("assina com o escopo s3/us-east-1 e cabeçalhos ordenados", () => {
    const cabecalhos = assinaRequisicao({
      metodo: "PUT",
      caminho: "/rustfs/admin/v3/add-user",
      query: "accessKey=teste",
      corpo: "{}",
      host: "localhost:9000",
      accessKey: "root",
      secretKey: "segredo",
    });
    expect(cabecalhos.Authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=root\/\d{8}\/us-east-1\/s3\/aws4_request/);
    expect(cabecalhos.Authorization).toContain("SignedHeaders=host;x-amz-content-sha256;x-amz-date");
    expect(cabecalhos["x-amz-content-sha256"]).toHaveLength(64);
  });
});

describe("provisionarIdentidade", () => {
  it("cria a política, cria o usuário e vincula a política, na ordem", async () => {
    const chamadas = [];
    const enviar = vi.fn(async (requisicao) => {
      chamadas.push(requisicao.caminho);
      return { status: 200, corpo: "{}" };
    });
    await provisionarIdentidade(enviar, {
      accessKey: "corpus-leitor",
      secretKey: "segredo-leitor",
      politicaNome: "corpus-leitor",
      politicaJson: '{"Version":"2012-10-17","Statement":[]}',
    });
    expect(chamadas).toEqual([
      "/rustfs/admin/v3/add-canned-policy",
      "/rustfs/admin/v3/add-user",
      "/rustfs/admin/v3/idp/builtin/policy/attach",
    ]);
    const corposEnviados = enviar.mock.calls.map(([requisicao]) => requisicao.corpo);
    expect(JSON.parse(corposEnviados[1])).toEqual({ secretKey: "segredo-leitor", status: "enabled" });
    expect(JSON.parse(corposEnviados[2])).toEqual({ policies: ["corpus-leitor"], user: "corpus-leitor" });
  });

  it.each([
    ["criar a política", 0],
    ["criar o usuário", 1],
    ["vincular a política", 2],
  ])("propaga falha ao %s (passo %i)", async (trechoEsperado, indiceQueFalha) => {
    let chamada = -1;
    const enviar = vi.fn(async () => {
      chamada += 1;
      return chamada === indiceQueFalha ? { status: 403, corpo: "Access Denied" } : { status: 200, corpo: "{}" };
    });
    await expect(
      provisionarIdentidade(enviar, {
        accessKey: "x",
        secretKey: "y",
        politicaNome: "z",
        politicaJson: "{}",
      }),
    ).rejects.toThrow(new RegExp(trechoEsperado));
  });
});
