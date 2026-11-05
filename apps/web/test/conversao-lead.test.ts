import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import type { Deal } from "@plugga/shared";
import { converterLead } from "../app/lib/conversao-lead.ts";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

const negocio: Deal = {
  id: "00000000-0000-4000-8000-000000001001", number: 1,
  pipelineId: "00000000-0000-4000-8000-000000001002", companyId: "plugga", stageId: "00000000-0000-4000-8000-000000001003",
  status: "open", priority: null, title: "Projeto sintético", value: null, expectedCloseDate: null,
  lead: { personType: "pj", name: "Lead sintético", companyName: null, landlinePhone: null, website: null, mainInterest: null, jobTitle: null, legalName: null, document: null, phone: null, email: "lead@teste.local", postalCode: null, street: null, addressComplement: null, district: null, city: null, state: null, origin: null, notes: null },
  owner: { id: "00000000-0000-4000-8000-000000001004", name: "Responsável sintético" },
  contact: null, client: null, tags: [], stageEnteredAt: "2026-11-05T12:00:00Z", closedAt: null, lossReason: null, revisitOn: null, createdAt: "2026-11-05T12:00:00Z",
};
const cliente = { id: "00000000-0000-4000-8000-000000001005", name: "Cliente sintético" };
const convertido = { ...negocio, client: cliente, status: "won" as const, closedAt: "2026-11-05T12:30:00Z" };

test("converte com os dados salvos em um único POST, sem PATCH", async () => {
  const chamadas: string[] = [];
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), `/api/leads/${negocio.id}/converter`);
    chamadas.push(init!.method!);
    assert.deepEqual(JSON.parse(String(init?.body)), {});
    return Response.json({ lead: convertido, client: cliente, created: true });
  };
  assert.equal((await converterLead(negocio)).ok, true);
  assert.deepEqual(chamadas, ["POST"]);
  assert.equal(negocio.client, null);
});

test("nome com telefone, email ou documento permite conversão", async () => {
  for (const identificador of [
    { phone: "11999999999", email: null, document: null },
    { phone: null, email: "lead@teste.local", document: null },
    { phone: null, email: null, document: "99999999000191" },
  ]) {
    const atual = { ...negocio, lead: { ...negocio.lead, ...identificador } };
    globalThis.fetch = async () => Response.json({ lead: { ...convertido, lead: atual.lead }, client: cliente, created: true });
    assert.equal((await converterLead(atual)).ok, true);
  }
});

test("só nome ou nome ausente não envia conversão nem anuncia sucesso", async () => {
  globalThis.fetch = async () => { assert.fail("dados insuficientes não devem enviar requisição"); };
  for (const perfil of [
    { ...negocio.lead, phone: null, email: null, document: null },
    { ...negocio.lead, name: "   " },
  ]) {
    const resultado = await converterLead({ ...negocio, lead: perfil });
    assert.equal(resultado.ok, false);
    if (resultado.ok) throw new Error("A conversão deveria ser recusada");
    assert.ok(resultado.erro.mensagem.length > 0);
  }
});

test("documento inválido não é tratado como dado suficiente", async () => {
  globalThis.fetch = async () => { assert.fail("documento inválido não deve ser enviado"); };
  assert.equal((await converterLead({ ...negocio, lead: { ...negocio.lead, email: null, document: "11111111111111" } })).ok, false);
});

test("duplicidade preserva candidatos e exige escolha explícita antes de vincular", async () => {
  const candidato = { ...cliente, personType: "pj", matchedOn: ["email"] };
  const chamadas: unknown[] = [];
  globalThis.fetch = async (_url, init) => {
    chamadas.push(JSON.parse(String(init?.body)));
    if (chamadas.length === 1) return Response.json({ mensagem: "Escolha o cliente", candidatos: [candidato] }, { status: 400 });
    return Response.json({ lead: convertido, client: cliente, created: false });
  };
  const recusada = await converterLead(negocio);
  assert.equal(recusada.ok, false);
  if (recusada.ok) throw new Error("A duplicidade deveria exigir escolha");
  assert.equal(recusada.erro.candidatos?.[0]?.id, cliente.id);
  assert.equal((await converterLead(negocio, cliente.id)).ok, true);
  assert.deepEqual(chamadas, [{}, { resolution: { type: "link", clientId: cliente.id } }]);
});

test("criar novo cliente continua dependendo de escolha explícita", async () => {
  globalThis.fetch = async (_url, init) => {
    assert.deepEqual(JSON.parse(String(init?.body)), { resolution: { type: "create" } });
    return Response.json({ lead: convertido, client: cliente, created: true });
  };
  assert.equal((await converterLead(negocio, "novo")).ok, true);
});

test("erros por campo viram orientação legível sem pedir campos destacados inexistentes", async () => {
  globalThis.fetch = async () => Response.json({ detalhes: [{ campo: "lead.document", problema: "CPF inválido." }] }, { status: 400 });
  const resultado = await converterLead(negocio);
  assert.equal(resultado.ok, false);
  if (resultado.ok) throw new Error("A conversão deveria ser recusada");
  assert.equal(resultado.erro.mensagem, "CPF inválido.");
});

test("rede indisponível e resposta de sucesso incompleta não confirmam conversão", async () => {
  globalThis.fetch = async () => { throw new Error("Falha sintética de rede"); };
  assert.equal((await converterLead(negocio)).ok, false);
  globalThis.fetch = async () => Response.json({});
  assert.equal((await converterLead(negocio)).ok, false);
});

test("conversão só confirma sucesso quando o negócio foi encerrado como ganho", async () => {
  for (const lead of [{ ...convertido, status: "open", closedAt: null }, { ...convertido, closedAt: null }]) {
    globalThis.fetch = async () => Response.json({ lead, client: cliente, created: true });
    assert.equal((await converterLead(negocio)).ok, false);
  }
  globalThis.fetch = async () => Response.json({ lead: convertido, client: cliente, created: true });
  const resposta = await converterLead(negocio);
  assert.equal(resposta.ok, true);
  if (!resposta.ok) throw new Error("A conversão deveria concluir");
  assert.equal(resposta.dados.lead.status, "won");
  assert.equal(resposta.dados.lead.closedAt, convertido.closedAt);
});
