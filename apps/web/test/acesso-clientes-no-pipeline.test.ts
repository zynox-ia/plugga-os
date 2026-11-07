import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import type { Acesso } from "@plugga/shared";
import { buscarClientesParaNegocio } from "../app/lib/clientes.ts";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const pipelines: Acesso = { plataforma: null, departamentos: [{ departamento: "crm", nivel: "membro", telas: ["crm.pipelines"] }] };
const clientes: Acesso = { plataforma: null, departamentos: [{ departamento: "crm", nivel: "membro", telas: ["crm.pipelines", "crm.clientes"] }] };

test("Pipelines sem Clientes ou sessão pendente não consulta candidatos", async () => {
  globalThis.fetch = async () => { assert.fail("a busca de cadastro não pode ser enviada sem Clientes"); };
  assert.deepEqual(await buscarClientesParaNegocio("Cliente sintético", pipelines), []);
  assert.deepEqual(await buscarClientesParaNegocio("Cliente sintético", undefined), []);
});

test("Clientes liberado mantém a busca e respeita o limite de resultados", async () => {
  let chamadas = 0;
  globalThis.fetch = async (url, init) => {
    chamadas += 1;
    assert.equal(init?.method, "GET");
    assert.equal(String(url), "/api/leads/clientes?q=Cliente+sint%C3%A9tico");
    return Response.json({ items: Array.from({ length: 9 }, (_, index) => ({ id: String(index), name: "Cliente sintético" })) });
  };
  assert.deepEqual(await buscarClientesParaNegocio("C", clientes), []);
  assert.equal((await buscarClientesParaNegocio(" Cliente sintético ", clientes)).length, 8);
  assert.equal(chamadas, 1);
});
