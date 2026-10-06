import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  criarFornecedorRequestSchema,
  criarObraRequestSchema,
  loseOpportunityRequestSchema,
  triagemRequestSchema,
} from "@plugga/shared";

import { postarJson, validarCorpo } from "../app/lib/requisicao.ts";

const ID = "00000000-0000-4000-8000-000000001001";
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function espiarFetch(resposta: Response): { chamadas: { url: string; body: unknown }[] } {
  const chamadas: { url: string; body: unknown }[] = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    chamadas.push({ url: String(url), body: init?.body });
    return resposta;
  }) as typeof fetch;
  return { chamadas };
}

describe("validarCorpo (FR-060)", () => {
  it("aceita corpo válido e devolve o valor normalizado pelo schema", () => {
    const r = validarCorpo(criarObraRequestSchema, { companyId: "plugga", nome: "  Obra Norte  " });
    assert.ok(r.ok);
    if (r.ok) assert.equal(r.dados.nome, "Obra Norte");
  });

  it("recusa campo desconhecido (schema estrito)", () => {
    const r = validarCorpo(criarObraRequestSchema, { companyId: "plugga", nome: "Obra", extra: 1 });
    assert.equal(r.ok, false);
  });

  it("recusa identificador que não é UUID", () => {
    const r = validarCorpo(triagemRequestSchema, { responsavelId: "../.." });
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.message, /responsavelId/);
  });

  it("recusa campo obrigatório ausente, com mensagem em texto", () => {
    const r = validarCorpo(loseOpportunityRequestSchema, {});
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.message.length > 0);
  });
});

describe("postarJson", () => {
  it("não chama a rede quando o corpo é inválido", async () => {
    const { chamadas } = espiarFetch(Response.json({}));
    const r = await postarJson("/api/compras/fornecedores", criarFornecedorRequestSchema, { nome: "" }, "sem rede");
    assert.equal(r.ok, false);
    assert.equal(chamadas.length, 0);
  });

  it("envia o corpo validado quando é válido", async () => {
    const { chamadas } = espiarFetch(Response.json({ id: ID }, { status: 201 }));
    const r = await postarJson(
      "/api/compras/fornecedores",
      criarFornecedorRequestSchema,
      { companyId: "waze", nome: " Fornecedor X " },
      "sem rede",
    );
    assert.ok(r.ok);
    assert.equal(chamadas.length, 1);
    assert.deepEqual(JSON.parse(String(chamadas[0]?.body)), { companyId: "waze", nome: "Fornecedor X" });
  });

  it("lê a mensagem do envelope de erro da API", async () => {
    espiarFetch(Response.json({ codigo: "CONFLITO_UNICIDADE", mensagem: "já existe", requestId: "r1" }, { status: 409 }));
    const r = await postarJson("/x", criarObraRequestSchema, { companyId: "plugga", nome: "A" }, "sem rede");
    assert.ok(!r.ok);
    if (!r.ok) assert.equal(r.message, "já existe");
  });

  it("devolve a mensagem de rede quando o fetch falha", async () => {
    globalThis.fetch = (async () => {
      throw new Error("down");
    }) as typeof fetch;
    const r = await postarJson("/x", criarObraRequestSchema, { companyId: "plugga", nome: "A" }, "sem rede");
    assert.ok(!r.ok);
    if (!r.ok) assert.equal(r.message, "sem rede");
  });
});
