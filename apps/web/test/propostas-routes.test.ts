import assert from "node:assert/strict";
import { afterEach, it } from "node:test";
import { GET as listar, POST as criar } from "../app/api/leads/[id]/propostas/route.ts";
import { GET as modelos } from "../app/api/leads/[id]/propostas/modelos/route.ts";
import { PATCH as editar } from "../app/api/leads/[id]/propostas/[proposalId]/route.ts";
import { POST as gerar } from "../app/api/leads/[id]/propostas/[proposalId]/gerar/route.ts";
import { GET as preview } from "../app/api/leads/[id]/propostas/[proposalId]/preview/route.ts";
import { GET as download } from "../app/api/leads/[id]/propostas/[proposalId]/download/route.ts";

const originalFetch = globalThis.fetch;
const api = process.env.API_INTERNAL_URL;
afterEach(() => { globalThis.fetch = originalFetch; if (api === undefined) delete process.env.API_INTERNAL_URL; else process.env.API_INTERNAL_URL = api; });
const id = "00000000-0000-4000-8000-000000001001";
const proposalId = "00000000-0000-4000-8000-000000001002";
const contexto = { params: Promise.resolve({ id, proposalId }) };
it("encaminha modelos e CRUD com IDs, sessão e origem, sem trocar o corpo", async () => {
  process.env.API_INTERNAL_URL = "http://api.test";
  for (const [handler, method, suffix] of [[listar, "GET", ""], [modelos, "GET", "/modelos"], [criar, "POST", ""], [editar, "PATCH", `/${proposalId}`], [gerar, "POST", `/${proposalId}/gerar`]] as const) {
    globalThis.fetch = async (url, init) => {
      assert.equal(String(url), `http://api.test/leads/${id}/propostas${suffix}`);
      assert.equal(init?.method, method);
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("cookie"), "sid=sintetico");
      if (method !== "GET") { assert.equal(headers.get("origin"), "http://localhost:3000"); assert.equal(init?.body, '{"revision":2}'); }
      return Response.json({ ok: true });
    };
    const resposta = await handler(new Request("http://localhost:3000/api/propostas", { method, headers: { cookie: "sid=sintetico", origin: "http://localhost:3000" }, ...(method !== "GET" ? { body: '{"revision":2}' } : {}) }), contexto);
    assert.equal(resposta.status, 200);
  }
});
it("transmite bytes PDF e cabeçalhos sem serializar o arquivo como JSON", async () => {
  process.env.API_INTERNAL_URL = "http://api.test";
  for (const [handler, suffix] of [[preview, "preview"], [download, "download"]] as const) {
    globalThis.fetch = async (url) => {
      assert.equal(String(url), `http://api.test/leads/${id}/propostas/${proposalId}/${suffix}`);
      return new Response("%PDF-1.4\n", { headers: { "content-type": "application/pdf", "content-disposition": `${suffix === "preview" ? "inline" : "attachment"}; filename="proposta.pdf"`, "content-security-policy": "sandbox" } });
    };
    const resposta = await handler(new Request("http://localhost:3000/api/propostas"), contexto);
    assert.equal(await resposta.text(), "%PDF-1.4\n");
    assert.equal(resposta.headers.get("content-type"), "application/pdf");
    assert.equal(resposta.headers.get("content-security-policy"), "sandbox");
  }
});
