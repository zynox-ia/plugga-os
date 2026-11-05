import assert from "node:assert/strict";
import { afterEach, it } from "node:test";
import { carregarPropostas, salvarProposta, gerarProposta, FalhaProposta, dataDaProposta } from "../app/lib/propostas-lead.ts";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const id = "00000000-0000-4000-8000-000000001001";
const content = { title: "Proposta comercial", recipient: "Empresa de teste", company: "", email: "", phone: "", city: "", owner: "", jobTitle: "", amount: "1500.00", validUntil: "2028-02-29", introduction: "", scope: "", payment: "", notes: "" };
const proposal = { id: "00000000-0000-4000-8000-000000001002", dealId: id, templateId: "00000000-0000-4000-8000-000000001003", templateName: "Essencial", templateStyle: "essencial", number: 1, status: "draft", version: 0, revision: 1, content, document: null, createdAt: "2026-11-03T12:00:00Z", updatedAt: "2026-11-03T12:00:00Z" };

it("preserva datas civis, inclusive dia bissexto, sem conversão de fuso", () => {
  assert.equal(dataDaProposta("2028-02-29"), "29/02/2028");
  assert.equal(dataDaProposta("2028-03-01"), "01/03/2028");
});
it("valida o vínculo com o lead em listas e respostas de mutação", async () => {
  globalThis.fetch = async () => Response.json({ proposals: [proposal] });
  assert.equal((await carregarPropostas(id))[0]?.id, proposal.id);
  globalThis.fetch = async () => Response.json({ proposals: [{ ...proposal, dealId: proposal.id }] });
  await assert.rejects(carregarPropostas(id), /incompleta/i);
  globalThis.fetch = async () => Response.json({ proposal: { ...proposal, dealId: proposal.id } });
  await assert.rejects(salvarProposta(id, proposal.templateId, content, null), /confirmar/i);
});
it("cria rascunho e envia a revisão atual nas alterações e na geração", async () => {
  const chamadas: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = async (url, init) => { chamadas.push({ url: String(url), init }); return Response.json({ proposal }); };
  const novo = await salvarProposta(id, proposal.templateId, content, null);
  await salvarProposta(id, proposal.templateId, content, novo);
  await gerarProposta(id, novo);
  assert.deepEqual(chamadas.map((c) => [c.url, c.init?.method]), [
    [`/api/leads/${id}/propostas`, "POST"], [`/api/leads/${id}/propostas/${proposal.id}`, "PATCH"], [`/api/leads/${id}/propostas/${proposal.id}/gerar`, "POST"],
  ]);
  assert.equal(JSON.parse(String(chamadas[1]?.init?.body)).revision, 1);
  assert.deepEqual(JSON.parse(String(chamadas[2]?.init?.body)), { revision: 1 });
});
it("distingue conflito de edição e resposta de mutação sem confirmação", async () => {
  globalThis.fetch = async () => Response.json({ mensagem: "A proposta mudou. Recarregue antes de salvar." }, { status: 409 });
  await assert.rejects(salvarProposta(id, proposal.templateId, content, null), (erro) => erro instanceof FalhaProposta && erro.conflito && !erro.incerta);
  globalThis.fetch = async () => { throw new TypeError("Failed to fetch"); };
  await assert.rejects(gerarProposta(id, { id: proposal.id, revision: 1 }), (erro) => erro instanceof FalhaProposta && erro.incerta);
});
