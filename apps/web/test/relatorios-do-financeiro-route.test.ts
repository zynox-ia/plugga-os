import assert from "node:assert/strict";
import { afterEach, it } from "node:test";

import { GET as lancamentosDaLinha } from "../app/api/financeiro/relatorios/categorias/lancamentos/route.ts";

/** O proxy dos lançamentos de uma linha do relatório (PLU-360): leva a consulta e o cookie, e devolve a resposta da API intacta. */
const fetchOriginal = globalThis.fetch;
const baseOriginal = process.env.API_INTERNAL_URL;
afterEach(() => {
  globalThis.fetch = fetchOriginal;
  if (baseOriginal === undefined) delete process.env.API_INTERNAL_URL;
  else process.env.API_INTERNAL_URL = baseOriginal;
});

type Portao = { NODE_ENV: string; NEXT_PUBLIC_FINANCEIRO_HABILITADO: string | undefined };
/** Portão fechado: produção, com a variável desligada ou ausente. */
const FECHADOS: readonly Portao[] = [
  { NODE_ENV: "production", NEXT_PUBLIC_FINANCEIRO_HABILITADO: undefined },
  { NODE_ENV: "production", NEXT_PUBLIC_FINANCEIRO_HABILITADO: "false" },
];
/** Portão aberto: teste ou desenvolvimento, ou produção com a variável (a CI liga `true`). */
const ABERTOS: readonly Portao[] = [
  { NODE_ENV: "test", NEXT_PUBLIC_FINANCEIRO_HABILITADO: undefined },
  { NODE_ENV: "production", NEXT_PUBLIC_FINANCEIRO_HABILITADO: "true" },
];

/**
 * O portão do Financeiro lê o NODE_ENV e a NEXT_PUBLIC_FINANCEIRO_HABILITADO
 * (lib/recursos.ts): cada cenário fixa as duas e as devolve, sem depender do
 * ambiente em que o teste roda (a CI liga a variável).
 */
async function comPortao<T>(portao: Portao, fazer: () => Promise<T>): Promise<T> {
  const ambiente = process.env as Record<string, string | undefined>;
  const anteriores = { NODE_ENV: ambiente.NODE_ENV, NEXT_PUBLIC_FINANCEIRO_HABILITADO: ambiente.NEXT_PUBLIC_FINANCEIRO_HABILITADO };
  const fixar = (valores: Record<string, string | undefined>) => {
    for (const [chave, valor] of Object.entries(valores)) {
      if (valor === undefined) delete ambiente[chave];
      else ambiente[chave] = valor;
    }
  };
  fixar(portao);
  try {
    return await fazer();
  } finally {
    fixar(anteriores);
  }
}

const consulta = "?de=2026-11-01&ate=2026-11-30&tipo=saida&categoria=sem";
const pedido = () => new Request(`http://localhost:3000/api/financeiro/relatorios/categorias/lancamentos${consulta}`, { headers: { cookie: "sid=sessao-sintetica" } });

for (const portao of ABERTOS) {
  it(`portão aberto (${JSON.stringify(portao)}): encaminha a consulta e o cookie, e devolve a recusa da API`, async () => {
    process.env.API_INTERNAL_URL = "http://api.test";
    globalThis.fetch = async (url, init) => {
      assert.equal(String(url), `http://api.test/financeiro/relatorios/categorias/lancamentos${consulta}`);
      assert.equal(init?.method, "GET");
      assert.equal(new Headers(init?.headers).get("cookie"), "sid=sessao-sintetica");
      return Response.json({ codigo: "ACESSO_NEGADO", message: "principal does not have the required access" }, { status: 403 });
    };
    const resposta = await comPortao(portao, () => lancamentosDaLinha(pedido()));
    assert.equal(resposta.status, 403);
    assert.deepEqual(await resposta.json(), { codigo: "ACESSO_NEGADO", message: "principal does not have the required access" });
  });
}

for (const portao of FECHADOS) {
  it(`portão fechado (${JSON.stringify(portao)}): responde 404 sem chamar a API`, async () => {
    process.env.API_INTERNAL_URL = "http://api.test";
    globalThis.fetch = async () => assert.fail("não deveria chamar a API");
    const resposta = await comPortao(portao, () => lancamentosDaLinha(pedido()));
    assert.equal(resposta.status, 404);
  });
}

it("cada cenário devolve o ambiente como estava", async () => {
  const antes = { NODE_ENV: process.env.NODE_ENV, flag: process.env.NEXT_PUBLIC_FINANCEIRO_HABILITADO };
  await comPortao(FECHADOS[0]!, async () => undefined);
  await comPortao(ABERTOS[1]!, async () => undefined);
  assert.deepEqual({ NODE_ENV: process.env.NODE_ENV, flag: process.env.NEXT_PUBLIC_FINANCEIRO_HABILITADO }, antes);
});
