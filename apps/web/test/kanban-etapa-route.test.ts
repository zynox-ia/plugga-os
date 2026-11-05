import assert from "node:assert/strict";
import { afterEach, it } from "node:test";

import { POST } from "../app/api/leads/[id]/etapa/route.ts";

const id = "00000000-0000-4000-8000-000000001001";
const stageId = "00000000-0000-4000-8000-000000001002";
const referencia = "00000000-0000-4000-8000-000000001003";
const fetchOriginal = globalThis.fetch;
const baseOriginal = process.env.API_INTERNAL_URL;

afterEach(() => {
  globalThis.fetch = fetchOriginal;
  if (baseOriginal === undefined) delete process.env.API_INTERNAL_URL;
  else process.env.API_INTERNAL_URL = baseOriginal;
});

it("encaminha a referência de posição e preserva a recusa da API", async () => {
  process.env.API_INTERNAL_URL = "http://api.test";
  for (const beforeDealId of [referencia, null]) {
    const body = JSON.stringify({ stageId, beforeDealId });
    globalThis.fetch = async (url, init) => {
      assert.equal(String(url), `http://api.test/leads/${id}/etapa`);
      assert.equal(init?.body, body);
      assert.equal(new Headers(init?.headers).get("cookie"), "sid=sessao-sintetica");
      return Response.json({ codigo: "ESTADO_INVALIDO" }, { status: 409 });
    };
    const resposta = await POST(new Request(`http://localhost:3000/api/leads/${id}/etapa`, {
      method: "POST", body, headers: { origin: "http://localhost:3000", cookie: "sid=sessao-sintetica" },
    }), { params: Promise.resolve({ id }) });
    assert.equal(resposta.status, 409);
    assert.deepEqual(await resposta.json(), { codigo: "ESTADO_INVALIDO" });
  }
});
