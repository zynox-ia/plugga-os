import assert from "node:assert/strict";
import { after, afterEach, before, it } from "node:test";

import { GET as lancamentosDaLinha } from "../app/api/financeiro/relatorios/categorias/lancamentos/route.ts";

/** O proxy dos lançamentos de uma linha do relatório (PLU-360): leva a consulta e o cookie, e devolve a resposta da API intacta. */
const fetchOriginal = globalThis.fetch;
const baseOriginal = process.env.API_INTERNAL_URL;
const ambiente = process.env as Record<string, string | undefined>;
const nodeEnvOriginal = ambiente.NODE_ENV;
before(() => { ambiente.NODE_ENV = "test"; });
after(() => {
  if (nodeEnvOriginal === undefined) delete ambiente.NODE_ENV;
  else ambiente.NODE_ENV = nodeEnvOriginal;
});
afterEach(() => {
  globalThis.fetch = fetchOriginal;
  if (baseOriginal === undefined) delete process.env.API_INTERNAL_URL;
  else process.env.API_INTERNAL_URL = baseOriginal;
});

it("encaminha a consulta e o cookie, e devolve a recusa da API", async () => {
  process.env.API_INTERNAL_URL = "http://api.test";
  const consulta = "?de=2026-11-01&ate=2026-11-30&tipo=saida&categoria=sem";
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), `http://api.test/financeiro/relatorios/categorias/lancamentos${consulta}`);
    assert.equal(init?.method, "GET");
    assert.equal(new Headers(init?.headers).get("cookie"), "sid=sessao-sintetica");
    return Response.json({ codigo: "ACESSO_NEGADO", message: "principal does not have the required access" }, { status: 403 });
  };
  const resposta = await lancamentosDaLinha(new Request(`http://localhost:3000/api/financeiro/relatorios/categorias/lancamentos${consulta}`, { headers: { cookie: "sid=sessao-sintetica" } }));
  assert.equal(resposta.status, 403);
  assert.deepEqual(await resposta.json(), { codigo: "ACESSO_NEGADO", message: "principal does not have the required access" });
});

it("com o portão do Financeiro fechado, responde 404 sem chamar a API", async () => {
  process.env.API_INTERNAL_URL = "http://api.test";
  ambiente.NODE_ENV = "production";
  globalThis.fetch = async () => assert.fail("não deveria chamar a API");
  try {
    const resposta = await lancamentosDaLinha(new Request("http://localhost:3000/api/financeiro/relatorios/categorias/lancamentos?de=2026-11-01&ate=2026-11-30&tipo=saida&categoria=sem"));
    assert.equal(resposta.status, 404);
  } finally {
    ambiente.NODE_ENV = "test";
  }
});
