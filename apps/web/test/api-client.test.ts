import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { lerApi, montarCaminho, montarConsulta, statusDoErro } from "../app/lib/api-core.ts";

const ID = "00000000-0000-4000-8000-000000001001";
const esquema = {
  safeParse: (v: unknown) =>
    typeof v === "object" && v !== null && (v as { ok?: unknown }).ok === true
      ? { success: true as const, data: v as { ok: true } }
      : { success: false as const },
};

type Chamada = { url: string; init: RequestInit };

function contextoCom(resposta: Response | Error, chamadas: Chamada[] = []) {
  return {
    baseUrl: "http://api.test",
    cabecalhos: { cookie: "sid=abc" },
    fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
      chamadas.push({ url: String(url), init: init ?? {} });
      if (resposta instanceof Error) throw resposta;
      return resposta;
    }) as typeof fetch,
  };
}

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });

const envelope = (codigo: string, status: number) =>
  json({ codigo, mensagem: "mensagem da api", requestId: "req-1" }, status);

describe("identificadores", () => {
  for (const ruim of ["../..", "..%2F..", "%2F", "abc", "", ID + "/x", ID + "?a=1"]) {
    it(`recusa ${JSON.stringify(ruim)} sem chamar a API`, async () => {
      const chamadas: Chamada[] = [];
      const r = await lerApi(contextoCom(json({ ok: true }), chamadas), "/clientes/:id/ficha", esquema, { id: ruim });
      assert.equal(r.ok, false);
      assert.equal(chamadas.length, 0);
    });
  }

  it("aceita UUID e monta o caminho", () => {
    assert.equal(montarCaminho("/clientes/:id/ficha", { id: ID }), `/clientes/${ID}/ficha`);
  });

  it("recusa quando falta o identificador", () => {
    assert.equal(montarCaminho("/clientes/:id", {}), null);
  });
});

describe("parâmetros", () => {
  it("codifica valores com URLSearchParams e omite vazios", () => {
    assert.equal(montarConsulta({ q: "a&b=c d", vazio: "", nada: undefined }), "?q=a%26b%3Dc+d");
    assert.equal(montarConsulta({}), "");
  });

  it("repassa cookie e envia a query codificada", async () => {
    const chamadas: Chamada[] = [];
    const r = await lerApi(contextoCom(json({ ok: true }), chamadas), "/compras/pedidos", esquema, {}, {
      consulta: { companyId: "a b&c" },
    });
    assert.equal(r.ok, true);
    assert.equal(chamadas[0]?.url, "http://api.test/compras/pedidos?companyId=a+b%26c");
    assert.deepEqual(chamadas[0]?.init.headers, { cookie: "sid=abc" });
    assert.ok(chamadas[0]?.init.signal);
  });
});

describe("status viram erro tipado", () => {
  const casos: [string, Response | Error, string][] = [
    ["401 sem envelope", json({}, 401), "naoAutenticado"],
    ["403 sem envelope", json({}, 403), "proibido"],
    ["404 sem envelope", json({}, 404), "naoEncontrado"],
    ["500", json({}, 500), "indisponivel"],
    ["503", json({}, 503), "indisponivel"],
    ["falha de rede", new Error("ECONNREFUSED"), "indisponivel"],
    ["envelope NAO_AUTENTICADO", envelope("NAO_AUTENTICADO", 401), "naoAutenticado"],
    ["envelope ACESSO_NEGADO", envelope("ACESSO_NEGADO", 403), "proibido"],
    ["envelope NAO_ENCONTRADO", envelope("NAO_ENCONTRADO", 404), "naoEncontrado"],
    ["envelope SERVICO_INDISPONIVEL", envelope("SERVICO_INDISPONIVEL", 503), "indisponivel"],
    ["envelope REQUISICAO_INVALIDA", envelope("REQUISICAO_INVALIDA", 400), "rejeitado"],
  ];
  for (const [nome, resposta, tipo] of casos) {
    it(nome, async () => {
      const r = await lerApi(contextoCom(resposta), "/x", esquema);
      assert.equal(r.ok, false);
      if (!r.ok) assert.equal(r.erro.tipo, tipo);
    });
  }

  it("preserva requestId e mensagem do envelope em rejeição", async () => {
    const r = await lerApi(contextoCom(envelope("REQUISICAO_INVALIDA", 400)), "/x", esquema);
    assert.ok(!r.ok);
    if (!r.ok) {
      assert.equal(r.erro.requestId, "req-1");
      assert.equal(r.erro.mensagem, "mensagem da api");
      assert.equal(r.erro.codigo, "REQUISICAO_INVALIDA");
    }
  });

  it("resposta fora do contrato vira indisponível", async () => {
    const r = await lerApi(contextoCom(json({ ok: false })), "/x", esquema);
    assert.ok(!r.ok);
    if (!r.ok) assert.equal(r.erro.tipo, "indisponivel");
  });

  it("statusDoErro devolve o status que o proxy repassa", async () => {
    const r = await lerApi(contextoCom(json({}, 403)), "/x", esquema);
    assert.ok(!r.ok);
    if (!r.ok) assert.equal(statusDoErro(r.erro), 403);
  });
});
