import assert from "node:assert/strict";
import { afterEach, beforeEach, it } from "node:test";

import { GET, PATCH } from "../app/api/leads/[id]/route.ts";
import { POST as upload } from "../app/api/leads/[id]/documentos/route.ts";
import { GET as download } from "../app/api/leads/[id]/documentos/[documentId]/download/route.ts";
import { POST as convert } from "../app/api/leads/[id]/converter/route.ts";
import { GET as history } from "../app/api/leads/[id]/historico/route.ts";

const id = "00000000-0000-4000-8000-000000001001";
const originalFetch = globalThis.fetch;
const originalBase = process.env.API_INTERNAL_URL;
const originalOrigins = process.env.AUTH_ALLOWED_ORIGINS;

beforeEach(() => {
  process.env.API_INTERNAL_URL = "http://api.test";
  delete process.env.AUTH_ALLOWED_ORIGINS;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalBase === undefined) delete process.env.API_INTERNAL_URL;
  else process.env.API_INTERNAL_URL = originalBase;
  if (originalOrigins === undefined) delete process.env.AUTH_ALLOWED_ORIGINS;
  else process.env.AUTH_ALLOWED_ORIGINS = originalOrigins;
});

it("leitura do detalhe mantém a sessão e a resposta de acesso negado da API", async () => {
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), `http://api.test/leads/${id}`);
    assert.equal(new Headers(init?.headers).get("cookie"), "sid=sessao-de-teste");
    return Response.json({ codigo: "NAO_ENCONTRADO" }, { status: 404 });
  };
  const response = await GET(new Request(`http://localhost:3000/api/leads/${id}`, {
    headers: { cookie: "sid=sessao-de-teste" },
  }), { params: Promise.resolve({ id }) });
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { codigo: "NAO_ENCONTRADO" });
});

it("salvar o lead encaminha os dados e mantém conflitos de edição", async () => {
  const body = JSON.stringify({ lead: { name: "Lead de exemplo" }, version: 1 });
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), `http://api.test/leads/${id}`);
    assert.equal(init?.method, "PATCH");
    assert.equal(init?.body, body);
    return Response.json({ codigo: "CONFLITO" }, { status: 409 });
  };
  const response = await PATCH(new Request(`http://localhost:3000/api/leads/${id}`, {
    method: "PATCH", body, headers: { origin: "http://localhost:3000" },
  }), { params: Promise.resolve({ id }) });
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { codigo: "CONFLITO" });
});

it("recusa id inválido antes de consultar a API", async () => {
  globalThis.fetch = async () => { assert.fail("não deve consultar a API"); };
  const response = await GET(new Request("http://localhost:3000/api/leads/invalido"), {
    params: Promise.resolve({ id: "invalido" }),
  });
  assert.equal(response.status, 400);
});

it("recusa alteração do lead de uma origem externa", async () => {
  globalThis.fetch = async () => { assert.fail("não deve alterar a API"); };
  const response = await PATCH(new Request(`http://localhost:3000/api/leads/${id}`, {
    method: "PATCH", body: "{}", headers: { origin: "https://outro.example" },
  }), { params: Promise.resolve({ id }) });
  assert.equal(response.status, 403);
});

it("upload do lead preserva arquivo, categoria e sessão no transporte multipart", async () => {
  const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0xff]);
  const form = new FormData();
  form.set("category", "outros");
  form.set("arquivo", new Blob([bytes], { type: "image/png" }), "exemplo.png");
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), `http://api.test/leads/${id}/documentos`);
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("cookie"), "sid=sessao-de-teste");
    assert.equal(headers.has("content-type"), false);
    assert.ok(init?.body instanceof FormData);
    assert.equal(init.body.get("category"), "outros");
    const file = init.body.get("arquivo");
    assert.ok(file instanceof File);
    assert.equal(file.name, "exemplo.png");
    assert.deepEqual(new Uint8Array(await file.arrayBuffer()), bytes);
    return Response.json({ id }, { status: 201 });
  };
  const response = await upload(new Request(`http://localhost:3000/api/leads/${id}/documentos`, {
    method: "POST", body: form, headers: { origin: "http://localhost:3000", cookie: "sid=sessao-de-teste" },
  }), { params: Promise.resolve({ id }) });
  assert.equal(response.status, 201);
});

it("download recusa identificador de documento inválido antes da chamada", async () => {
  globalThis.fetch = async () => { assert.fail("não deve consultar a API"); };
  const response = await download(new Request("http://localhost:3000/api/leads/documento"), {
    params: Promise.resolve({ id, documentId: "../arquivo" }),
  });
  assert.equal(response.status, 400);
});

it("converter preserva a escolha do usuário e o resultado da resolução de duplicatas", async () => {
  const body = JSON.stringify({ resolution: { type: "link", clientId: id } });
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), `http://api.test/leads/${id}/converter`);
    assert.equal(init?.body, body);
    return Response.json({ status: "needs_resolution", candidates: [] });
  };
  const response = await convert(new Request(`http://localhost:3000/api/leads/${id}/converter`, {
    method: "POST", body, headers: { origin: "http://localhost:3000" },
  }), { params: Promise.resolve({ id }) });
  assert.deepEqual(await response.json(), { status: "needs_resolution", candidates: [] });
});

it("histórico encaminha cursor e limite sem perder a paginação", async () => {
  const query = new URLSearchParams({ cursor: "cursor+com/tupla=", limit: "30" });
  globalThis.fetch = async (url) => {
    const target = new URL(String(url));
    assert.equal(target.pathname, `/leads/${id}/historico`);
    assert.equal(target.searchParams.get("cursor"), "cursor+com/tupla=");
    assert.equal(target.searchParams.get("limit"), "30");
    return Response.json({ entries: [], nextCursor: "proxima-pagina" });
  };
  const response = await history(new Request(`http://localhost:3000/api/leads/${id}/historico?${query}`), {
    params: Promise.resolve({ id }),
  });
  assert.deepEqual(await response.json(), { entries: [], nextCursor: "proxima-pagina" });
});
