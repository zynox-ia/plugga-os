import assert from "node:assert/strict";
import { test } from "node:test";
import { GET } from "../app/api/pipelines/route.ts";

test("atualizar a configuração lê pipelines com sessão e sem cache, preservando falhas da API", async () => {
  const originalFetch = globalThis.fetch;
  const originalBase = process.env.API_INTERNAL_URL;
  process.env.API_INTERNAL_URL = "http://api.test";
  try {
    globalThis.fetch = async (url, init) => {
      assert.equal(String(url), "http://api.test/pipelines?pipelineId=00000000-0000-4000-8000-000000000001");
      assert.equal(init?.method, "GET");
      assert.equal(init?.cache, "no-store");
      assert.equal(new Headers(init?.headers).get("cookie"), "sid=sessao-sintetica");
      return Response.json({ codigo: "SEM_ACESSO", mensagem: "Acesso revogado" }, { status: 403 });
    };
    const resposta = await GET(new Request("http://localhost:3000/api/pipelines?pipelineId=00000000-0000-4000-8000-000000000001", { headers: { cookie: "sid=sessao-sintetica" } }));
    assert.equal(resposta.status, 403);
    assert.deepEqual(await resposta.json(), { codigo: "SEM_ACESSO", mensagem: "Acesso revogado" });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalBase === undefined) delete process.env.API_INTERNAL_URL;
    else process.env.API_INTERNAL_URL = originalBase;
  }
});
