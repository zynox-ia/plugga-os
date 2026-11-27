import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { PATCH as editarCategoria } from "../app/api/financeiro/categorias/[id]/route.ts";
import { POST as criarCategoria } from "../app/api/financeiro/categorias/route.ts";
import { PATCH as editarConta } from "../app/api/financeiro/contas-correntes/[id]/route.ts";
import { POST as criarConta } from "../app/api/financeiro/contas-correntes/route.ts";

/** Os proxies do cadastro do Financeiro (PLU-340): a mesma origem, o id como UUID e a recusa da API intacta. */
const id = "00000000-0000-4000-8000-000000003401";
const fetchOriginal = globalThis.fetch;
const baseOriginal = process.env.API_INTERNAL_URL;

afterEach(() => {
  globalThis.fetch = fetchOriginal;
  if (baseOriginal === undefined) delete process.env.API_INTERNAL_URL;
  else process.env.API_INTERNAL_URL = baseOriginal;
});

const pedido = (caminho: string, metodo: string, body: string, origin = "http://localhost:3000") =>
  new Request(`http://localhost:3000${caminho}`, { method: metodo, body, headers: { origin, cookie: "sid=sessao-sintetica", "content-type": "application/json" } });
const params = (valor: string) => ({ params: Promise.resolve({ id: valor }) });

describe("proxies do cadastro do Financeiro", () => {
  const casos = [
    { nome: "nova categoria", metodo: "POST", destino: "/financeiro/categorias", chamar: (r: Request) => criarCategoria(r) },
    { nome: "editar categoria", metodo: "PATCH", destino: `/financeiro/categorias/${id}`, chamar: (r: Request) => editarCategoria(r, params(id)) },
    { nome: "nova conta corrente", metodo: "POST", destino: "/financeiro/contas-correntes", chamar: (r: Request) => criarConta(r) },
    { nome: "editar conta corrente", metodo: "PATCH", destino: `/financeiro/contas-correntes/${id}`, chamar: (r: Request) => editarConta(r, params(id)) },
  ] as const;

  for (const caso of casos) {
    it(`${caso.nome}: encaminha o corpo com o cookie e devolve a recusa da API`, async () => {
      process.env.API_INTERNAL_URL = "http://api.test";
      const body = JSON.stringify({ nome: "Sintética" });
      globalThis.fetch = async (url, init) => {
        assert.equal(String(url), `http://api.test${caso.destino}`);
        assert.equal(init?.method, caso.metodo);
        assert.equal(init?.body, body);
        assert.equal(new Headers(init?.headers).get("cookie"), "sid=sessao-sintetica");
        return Response.json({ codigo: "ACESSO_NEGADO", message: "principal does not have the required access" }, { status: 403 });
      };
      const resposta = await caso.chamar(pedido("/api" + caso.destino, caso.metodo, body));
      assert.equal(resposta.status, 403);
      assert.deepEqual(await resposta.json(), { codigo: "ACESSO_NEGADO", message: "principal does not have the required access" });
    });

    it(`${caso.nome}: outra origem não chega à API`, async () => {
      process.env.API_INTERNAL_URL = "http://api.test";
      globalThis.fetch = async () => assert.fail("não deveria chamar a API");
      const resposta = await caso.chamar(pedido("/api" + caso.destino, caso.metodo, "{}", "https://outro.exemplo"));
      assert.equal(resposta.status, 403);
    });
  }

  it("o id que não é UUID para no proxy", async () => {
    globalThis.fetch = async () => assert.fail("não deveria chamar a API");
    assert.equal((await editarCategoria(pedido("/api/financeiro/categorias/x", "PATCH", "{}"), params("../opcoes"))).status, 400);
    assert.equal((await editarConta(pedido("/api/financeiro/contas-correntes/x", "PATCH", "{}"), params("%2F"))).status, 400);
  });
});
