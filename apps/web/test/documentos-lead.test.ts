import assert from "node:assert/strict";
import { afterEach, it } from "node:test";
import { LEAD_DOCUMENT_MAX_BYTES } from "@plugga/shared";
import { enviarDocumentoDoLead, validarArquivoDocumento } from "../app/lib/documentos-lead.ts";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const dealId = "00000000-0000-4000-8000-000000001001";
const arquivo = () => new File(["%PDF-1.4\n"], "proposta.pdf", { type: "application/pdf" });
const documento = () => ({
  id: "00000000-0000-4000-8000-000000001002", dealId, category: "proposta", originalName: "proposta.pdf",
  sizeBytes: 9, detectedMime: "application/pdf", canPreview: true, uploadedBy: null,
  createdAt: "2026-11-03T12:00:00.000Z", updatedAt: "2026-11-03T12:00:00.000Z", archivedAt: null, archivedBy: null,
});

it("aceita o limite de tamanho e recusa arquivos vazios ou acima dele antes de enviar", async () => {
  assert.equal(validarArquivoDocumento({ size: LEAD_DOCUMENT_MAX_BYTES }), null);
  assert.match(validarArquivoDocumento({ size: 0 })!, /vazio/);
  assert.match(validarArquivoDocumento({ size: LEAD_DOCUMENT_MAX_BYTES + 1 })!, /25/);
  globalThis.fetch = async () => { assert.fail("arquivo vazio não deve chamar a rede"); };
  await assert.rejects(enviarDocumentoDoLead(dealId, new File([], "vazio.pdf"), "proposta"), /vazio/);
});

it("envia os bytes e a categoria em multipart e valida a resposta do mesmo lead", async () => {
  globalThis.fetch = async (url, init) => {
    assert.equal(url, `/api/leads/${dealId}/documentos`);
    assert.equal(init?.method, "POST");
    assert.ok(init?.body instanceof FormData);
    assert.equal(init.body.get("category"), "proposta");
    const enviado = init.body.get("arquivo");
    assert.ok(enviado instanceof File);
    assert.equal(enviado.name, "proposta.pdf");
    assert.equal(await enviado.text(), "%PDF-1.4\n");
    return Response.json(documento(), { status: 201 });
  };
  const resultado = await enviarDocumentoDoLead(dealId, arquivo(), "proposta");
  assert.equal(resultado.dealId, dealId);
  assert.equal(resultado.originalName, "proposta.pdf");
});

it("preserva a mensagem de erro do servidor e identifica envio sem confirmação", async () => {
  globalThis.fetch = async () => Response.json({ codigo: "CONFLITO", mensagem: "Este arquivo já foi enviado." }, { status: 409 });
  await assert.rejects(enviarDocumentoDoLead(dealId, arquivo(), "proposta"), /já foi enviado/);
  globalThis.fetch = async () => new Response("resposta incompleta", { status: 502 });
  await assert.rejects(enviarDocumentoDoLead(dealId, arquivo(), "proposta"), /confirmar|confira|atualize/i);
});

it("não aceita metadados incompletos nem documentos de outro lead como sucesso", async () => {
  for (const corpo of [{ id: "incompleto" }, { ...documento(), dealId: "00000000-0000-4000-8000-000000001003" }]) {
    globalThis.fetch = async () => Response.json(corpo, { status: 201 });
    await assert.rejects(enviarDocumentoDoLead(dealId, arquivo(), "proposta"), /incompleta|confirmar|atualize/i);
  }
});

it("falha de rede orienta conferir a lista antes de repetir o envio", async () => {
  globalThis.fetch = async () => { throw new TypeError("Failed to fetch"); };
  await assert.rejects(enviarDocumentoDoLead(dealId, arquivo(), "proposta"), /confira a lista/i);
});
