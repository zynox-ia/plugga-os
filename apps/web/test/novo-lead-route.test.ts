import assert from "node:assert/strict";
import { afterEach, beforeEach, it } from "node:test";
import { existsSync } from "node:fs";

import { POST } from "../app/api/leads/route.ts";

const fetchOriginal = globalThis.fetch;
const urlOriginal = process.env.API_INTERNAL_URL;
const origensOriginais = process.env.AUTH_ALLOWED_ORIGINS;

beforeEach(() => {
  process.env.API_INTERNAL_URL = "http://api.test";
  delete process.env.AUTH_ALLOWED_ORIGINS;
});
afterEach(() => {
  globalThis.fetch = fetchOriginal;
  if (urlOriginal === undefined) delete process.env.API_INTERNAL_URL;
  else process.env.API_INTERNAL_URL = urlOriginal;
  if (origensOriginais === undefined) delete process.env.AUTH_ALLOWED_ORIGINS;
  else process.env.AUTH_ALLOWED_ORIGINS = origensOriginais;
});

it("POST novo lead encaminha todos os campos sem criar cliente e só repassa sucesso real da API", async () => {
  const payload = { pipelineId: "pipeline", stageId: "etapa", title: "Lead sintético", ownerId: "equipe", lead: {
    name: "Lead sintético", phone: "92999990000", email: null, personType: "pf", document: null,
  } };
  let chamadas = 0;
  globalThis.fetch = async (url, init) => {
    chamadas++;
    assert.equal(String(url), "http://api.test/leads");
    assert.equal(init?.method, "POST");
    assert.equal(new Headers(init?.headers).get("cookie"), "sid=teste");
    assert.equal(new Headers(init?.headers).get("origin"), "http://localhost:3000");
    assert.deepEqual(JSON.parse(String(init?.body)), payload);
    return Response.json({ id: "persistido-pela-api", ...payload, client: null }, { status: 201 });
  };
  const resposta = await POST(new Request("http://localhost:3000/api/leads", {
    method: "POST", body: JSON.stringify(payload), headers: { origin: "http://localhost:3000", cookie: "sid=teste" },
  }));
  assert.equal(chamadas, 1);
  assert.equal(resposta.status, 201);
  assert.equal((await resposta.json()).id, "persistido-pela-api");
  assert.equal(existsSync(new URL("../app/api/negocios/route.ts", import.meta.url)), false);
});

it("preserva erro por campo e não transforma falha do servidor em cadastro concluído", async () => {
  const erro = { codigo: "REQUISICAO_INVALIDA", detalhes: [{ campo: "lead.phone", problema: "Telefone inválido" }] };
  globalThis.fetch = async () => Response.json(erro, { status: 400 });
  const resposta = await POST(new Request("http://localhost:3000/api/leads", {
    method: "POST", body: "{}", headers: { origin: "http://localhost:3000" },
  }));
  assert.equal(resposta.status, 400);
  assert.deepEqual(await resposta.json(), erro);
});

it("recusa origem externa antes de qualquer cadastro na API", async () => {
  globalThis.fetch = async () => { assert.fail("não deve enviar ao backend"); };
  const resposta = await POST(new Request("http://localhost:3000/api/leads", {
    method: "POST", body: "{}", headers: { origin: "https://fora.example" },
  }));
  assert.equal(resposta.status, 403);
});

it("API indisponível devolve falha e nunca um lead de demonstração", async () => {
  globalThis.fetch = async () => { throw new Error("falha sintética de conexão"); };
  const resposta = await POST(new Request("http://localhost:3000/api/leads", {
    method: "POST", body: "{}", headers: { origin: "http://localhost:3000" },
  }));
  assert.equal(resposta.status, 503);
  assert.equal((await resposta.json()).codigo, "SERVICO_INDISPONIVEL");
});
